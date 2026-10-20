// ==UserScript==
// @name         AutoFill SISVAN - Bolívar CPV v8.4
// @namespace    http://tampermonkey.net/
// @version      8.4
// @description  SISVAN Bolívar: Transcriptor, Fecha, Municipio → Parroquia → Escuela/Organismo con catálogo leído del propio formulario
// @author       Luis Escalante
// @match        https://docs.google.com/forms/d/e/1FAIpQLScPb-tduoYfOTZ1nDhZaDwQPENA315YOXdTYdpjIrUoG7lp-Q/*
// @match        https://docs.google.com/forms/u/*/d/e/1FAIpQLScPb-tduoYfOTZ1nDhZaDwQPENA315YOXdTYdpjIrUoG7lp-Q/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // Si se eligió la versión universal (AutoFillSISVAN_Universal.js), esta no actúa
    try { if (localStorage.getItem('sv_version') === 'universal') return; } catch (e) { /* sin almacenamiento */ }

    const RETRASO_ACCION = 800;   // Milisegundos antes de pulsar "Siguiente"
    const ESPERA_MAX = 10000;     // Máximo de espera a que Google habilite el formulario

    // Con sesión iniciada Google usa /forms/u/0/d/e/<ID>/... al pasar de sección
    const FORM_ID = (location.pathname.match(/\/forms\/(?:u\/\d+\/)?d\/e\/([^/]+)/) || [])[1] || 'desconocido';
    const K_COMUN = 'sv_comun_v8';                 // Transcriptor, cédula, fecha (compartido entre formularios)
    const K_UBIC = 'sv_ubic_v8_' + FORM_ID;        // Municipio, parroquia, escuela (propio de cada formulario)
    const K_CATALOGO = 'sv_catalogo_v8_' + FORM_ID;
    const K_AUTO = 'sv_auto_v8';
    const K_MIN = 'sv_minimized';
    const K_CONTADOR = 'sv_contador_v8';

    const CSS_PREMIUM = `
        #sv-panel {
            position: fixed; top: 15px; left: 15px; width: 310px;
            background: rgba(255, 255, 255, 0.98);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            z-index: 100000;
            font-family: 'Segoe UI', Roboto, Arial, sans-serif;
            border: 1px solid #1a73e8;
            transition: all 0.3s ease;
            overflow: hidden;
        }
        #sv-panel.minimized { width: 180px; height: 46px; border-radius: 12px; }
        #sv-panel.minimized .sv-main { display: none; }

        .sv-head-btns {
            display: flex; gap: 6px; padding: 8px;
            background: #f8f9fa;
            border-bottom: 1px solid #eee;
            align-items: center;
        }
        .sv-main { padding: 12px 15px 15px; max-height: 80vh; overflow-y: auto; }
        .sv-tag { display: block; font-size: 10px; color: #1a73e8; font-weight: 700; margin: 8px 0 3px; text-transform: uppercase; }

        .sv-field {
            width: 100%; padding: 8px 12px; border: 1px solid #dee2e6; border-radius: 8px;
            font-size: 13px; margin-bottom: 4px; box-sizing: border-box;
            background: #fff; transition: all 0.2s; color: #202124;
        }
        .sv-field:focus { border-color: #1a73e8; outline: none; box-shadow: 0 0 0 3px rgba(26,115,232,0.1); }
        .sv-field:disabled { background: #f1f3f4; color: #9aa0a6; }

        .sv-btn-top {
            border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 10px;
            transition: all 0.2s; height: 30px; display: flex; align-items: center; justify-content: center;
        }
        .btn-fill { flex: 3; background: #1a73e8; color: white; }
        .btn-auto { flex: 2; background: #fff; color: #3c4043; border: 1px solid #dadce0; }
        .btn-auto.on { background: #e6f4ea; color: #137333; border-color: #ceead6; font-weight: 800; }
        .btn-min { width: 30px; flex: none; background: #eee; color: #666; }

        .sv-sep { height: 1px; background: #eee; margin: 15px 0 10px; position: relative; }
        .sv-sep::after {
            content: "UBICACIÓN"; position: absolute; top: -6px; left: 50%;
            transform: translateX(-50%); background: white; padding: 0 8px;
            font-size: 8px; color: #aaa; letter-spacing: 1px;
        }

        .sv-status {
            margin-top: 12px; padding: 8px 10px; border-radius: 8px; font-size: 11px; line-height: 1.4;
            background: #f1f3f4; color: #3c4043;
        }
        .sv-status.ok { background: #e6f4ea; color: #137333; }
        .sv-status.warn { background: #fef7e0; color: #b06000; }
        .sv-status.err { background: #fce8e6; color: #c5221f; }
        .sv-foot { margin-top: 6px; font-size: 10px; color: #80868b; display: flex; justify-content: space-between; }
    `;

    // ---------- Utilidades ----------

    // Mayúsculas, sin acentos ni signos: "Caroní  Ciudad *" -> "CARONI CIUDAD"
    function norm(s) {
        return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
            .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    }

    function leer(k, def) {
        try { return JSON.parse(localStorage.getItem(k)) || def; } catch (e) { return def; }
    }
    function guardar(k, v) {
        try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* almacenamiento bloqueado */ }
    }
    function leerSesion(k) {
        try { return sessionStorage.getItem(k); } catch (e) { return null; }
    }
    function guardarSesion(k, v) {
        try { sessionStorage.setItem(k, v); } catch (e) { /* almacenamiento bloqueado */ }
    }

    function crearEl(tag, props = {}) {
        const el = document.createElement(tag);
        Object.assign(el, props);
        return el;
    }

    function esperar(cond, timeout = ESPERA_MAX) {
        return new Promise(resolve => {
            const t0 = Date.now();
            (function tick() {
                const r = cond();
                if (r || Date.now() - t0 > timeout) return resolve(r);
                setTimeout(tick, 150);
            })();
        });
    }

    function hoyISO() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    // ---------- Catálogo (Municipio → Parroquia → Escuela/Organismo) ----------
    // Se arma desde FB_PUBLIC_LOAD_DATA_, que Google incrusta en cada página del formulario.
    // Así el script se adapta solo si agregan o renombran escuelas.

    function construirCatalogo(data) {
        const items = data && data[1] && data[1][1];
        if (!Array.isArray(items)) return null;

        const indice = new Map(items.map((it, i) => [it[0], i]));
        const TIPO_RADIO = 2;

        // Pregunta de opción múltiple con la que abre la sección a la que salta una opción.
        // Si la sección empieza con otra cosa (p. ej. CINCO DE JULIO salta directo a DATOS DEL EVALUADO) no hay nivel siguiente.
        const radioDeSeccion = (seccionId) => {
            const i = indice.get(seccionId);
            const q = i === undefined ? null : items[i + 1];
            return q && q[3] === TIPO_RADIO ? q : null;
        };
        const opciones = (q) => ((q && q[4] && q[4][0] && q[4][0][1]) || [])
            .filter(o => o[0])
            .map(o => ({ v: o[0], salto: o[2] }));

        const qMun = items.find(it => it[3] === TIPO_RADIO && norm(it[1]).includes('MUNICIPIO'));
        if (!qMun) return null;

        const tPar = new Set(), tNiv3 = new Set();
        let titulo3 = '';
        const municipios = opciones(qMun).map(om => {
            const qPar = radioDeSeccion(om.salto);
            if (qPar) tPar.add(norm(qPar[1]));
            const parroquias = opciones(qPar).map(op => {
                const q3 = radioDeSeccion(op.salto);
                if (q3) { tNiv3.add(norm(q3[1])); titulo3 = titulo3 || q3[1]; }
                return { v: op.v, items: opciones(q3).map(o => o.v) };
            });
            return { v: om.v, parroquias };
        });

        return {
            municipios,
            titulos: { mun: [norm(qMun[1])], par: [...tPar], niv3: [...tNiv3] },
            etiqueta3: norm(titulo3).includes('ORGANISMO') ? '🏥 Organismo de Salud' : '🏫 Escuela'
        };
    }

    function obtenerCatalogo() {
        let cat = null;
        try { cat = construirCatalogo(window.FB_PUBLIC_LOAD_DATA_); } catch (e) { cat = null; }
        if (cat && cat.municipios.length) {
            guardar(K_CATALOGO, cat);
            return cat;
        }
        return leer(K_CATALOGO, null);  // p. ej. en la página de confirmación
    }

    // ---------- Datos guardados ----------

    function cargarDatos(cat) {
        let comun = leer(K_COMUN, null);
        let ubic = leer(K_UBIC, null);

        // Migración desde v7 (texto libre) a v8 (valores exactos del catálogo)
        if (!comun || !ubic) {
            const v7 = leer('sv_salud_v7', {});
            if (!comun) {
                const p = String(v7.f || '').split(/[-/]/);
                const f = p.length === 3 && p[2].length === 4
                    ? `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}` : '';
                comun = { n: v7.n || '', c: v7.c || '', f };
            }
            if (!ubic) {
                const buscar = (lista, txt) => {
                    const t = norm(txt);
                    if (!t) return null;
                    return lista.find(x => norm(x.v || x) === t) || lista.find(x => norm(x.v || x).startsWith(t)) || null;
                };
                const m = cat && buscar(cat.municipios, v7.m);
                const p = m && buscar(m.parroquias, v7.p);
                const e = p && buscar(p.items, v7.i);
                ubic = { m: m ? m.v : '', p: p ? p.v : '', e: e || '' };
            }
        }
        return Object.assign({ n: '', c: '', f: '' }, comun, { m: '', p: '', e: '' }, ubic);
    }

    function guardarDatos(d) {
        guardar(K_COMUN, { n: d.n, c: d.c, f: d.f });
        guardar(K_UBIC, { m: d.m, p: d.p, e: d.e });
    }

    // ---------- Interfaz ----------

    let catalogo = null;
    let datos = null;
    let statusEl = null;
    let contadorEl = null;

    function estado(msg, tipo = '') {
        console.info('[SISVAN]', msg, '|', firmaSeccion() || '(sin preguntas)', '|', location.pathname);
        if (!statusEl) return;
        statusEl.textContent = msg;
        statusEl.className = 'sv-status' + (tipo ? ' ' + tipo : '');
    }

    function llenarSelect(sel, valores, actual, vacio) {
        while (sel.firstChild) sel.removeChild(sel.firstChild);
        sel.appendChild(crearEl('option', { value: '', textContent: vacio }));
        valores.forEach(v => sel.appendChild(crearEl('option', { value: v, textContent: v.trim(), selected: v === actual })));
        sel.disabled = valores.length === 0;
        if (!valores.includes(actual)) sel.value = '';
    }

    function montarInterfaz() {
        if (document.getElementById('sv-panel') || !document.body) return;

        catalogo = obtenerCatalogo();
        datos = cargarDatos(catalogo);

        const styleSheet = document.createElement('style');
        styleSheet.textContent = CSS_PREMIUM;
        document.head.appendChild(styleSheet);

        const win = crearEl('div', { id: 'sv-panel' });
        const head = crearEl('div', { className: 'sv-head-btns' });
        const main = crearEl('div', { className: 'sv-main' });

        const runBtn = crearEl('button', { type: 'button', className: 'sv-btn-top btn-fill', textContent: 'RELLENAR', title: 'Rellenar esta sección y pasar a la siguiente (Alt+R)' });
        const autoBtn = crearEl('button', { type: 'button', className: 'sv-btn-top btn-auto', textContent: 'AUTO: OFF' });
        const minBtn = crearEl('button', { type: 'button', className: 'sv-btn-top btn-min', textContent: '—' });
        head.append(runBtn, autoBtn, minBtn);

        const campo = (label, el) => { main.append(crearEl('label', { className: 'sv-tag', textContent: label }), el); return el; };

        const inN = campo('👤 Transcriptor', crearEl('input', { className: 'sv-field', type: 'text', placeholder: 'Nombre y Apellido', value: datos.n }));
        const inC = campo('🆔 Cédula', crearEl('input', { className: 'sv-field', type: 'text', placeholder: 'Solo números', value: datos.c, inputMode: 'numeric' }));
        const inF = campo('📅 Fecha Abordaje', crearEl('input', { className: 'sv-field', type: 'date', value: datos.f }));
        main.appendChild(crearEl('div', { className: 'sv-sep' }));
        const selM = campo('📍 Municipio', crearEl('select', { className: 'sv-field' }));
        const selP = campo('🏘 Parroquia', crearEl('select', { className: 'sv-field' }));
        const selE = campo(catalogo ? catalogo.etiqueta3 : '🏫 Escuela', crearEl('select', { className: 'sv-field' }));

        statusEl = crearEl('div', { className: 'sv-status' });
        const foot = crearEl('div', { className: 'sv-foot' });
        contadorEl = crearEl('span');
        const probar = crearEl('a', { textContent: 'Probar universal', title: 'Cambiar a AutoFillSISVAN Universal (se vuelve con "↩ v8")' });
        probar.style.cssText = 'cursor:pointer;text-decoration:underline';
        probar.addEventListener('click', () => { try { localStorage.setItem('sv_version', 'universal'); } catch (e) { /* sin almacenamiento */ } location.reload(); });
        foot.append(crearEl('span', { textContent: 'v8.4 · Alt+R' }), contadorEl, probar);
        main.append(statusEl, foot);

        win.append(head, main);
        document.body.appendChild(win);
        actualizarContador();

        // Selects en cascada
        const municipio = () => catalogo ? catalogo.municipios.find(m => m.v === datos.m) : null;
        const parroquia = () => { const m = municipio(); return m ? m.parroquias.find(p => p.v === datos.p) : null; };
        const refrescarSelects = () => {
            llenarSelect(selM, catalogo ? catalogo.municipios.map(m => m.v) : [], datos.m, '— Seleccione municipio —');
            const m = municipio();
            llenarSelect(selP, m ? m.parroquias.map(p => p.v) : [], datos.p, '— Seleccione parroquia —');
            const p = parroquia();
            llenarSelect(selE, p ? p.items : [], datos.e, p && !p.items.length ? '(esta parroquia no tiene)' : '— Seleccione —');
        };
        refrescarSelects();
        if (!catalogo) estado('No se pudo leer el catálogo del formulario. Recarga la página.', 'err');

        const alCambiar = () => {
            datos.n = inN.value.trim();
            datos.c = inC.value.trim();
            datos.f = inF.value;
            guardarDatos(datos);
        };
        [inN, inC, inF].forEach(el => el.addEventListener('input', alCambiar));
        selM.addEventListener('change', () => { datos.m = selM.value; datos.p = ''; datos.e = ''; guardarDatos(datos); refrescarSelects(); });
        selP.addEventListener('change', () => { datos.p = selP.value; datos.e = ''; guardarDatos(datos); refrescarSelects(); });
        selE.addEventListener('change', () => { datos.e = selE.value; guardarDatos(datos); });

        // Minimizar
        if (leerSesion(K_MIN) === 'true') { win.classList.add('minimized'); minBtn.textContent = '▢'; }
        minBtn.addEventListener('click', () => {
            const isMin = win.classList.toggle('minimized');
            minBtn.textContent = isMin ? '▢' : '—';
            guardarSesion(K_MIN, isMin);
        });

        // Rellenar manual
        runBtn.addEventListener('click', () => procesarPagina(true));
        document.addEventListener('keydown', atajo);

        // Modo automático
        modoAuto = leerSesion(K_AUTO) === 'true';
        const pintarAuto = () => {
            autoBtn.textContent = modoAuto ? 'AUTO: ON' : 'AUTO: OFF';
            autoBtn.classList.toggle('on', modoAuto);
        };
        autoBtn.addEventListener('click', () => {
            modoAuto = !modoAuto;
            guardarSesion(K_AUTO, modoAuto);
            pintarAuto();
            if (modoAuto) procesarPagina(true);
        });
        pintarAuto();

        procesarPagina(modoAuto);
        vigilar(win, styleSheet);
    }

    // Al pasar de sección Google puede redibujar o reemplazar la página entera sin recargarla.
    // Un temporizador sobrevive a eso (un MutationObserver se queda mirando la página vieja):
    // devuelve el panel y procesa la nueva sección
    function vigilar(win, styleSheet) {
        setInterval(() => {
            if (!document.body || !document.head) return;
            if (!styleSheet.isConnected) document.head.appendChild(styleSheet);
            if (!win.isConnected) {
                document.body.appendChild(win);
                document.addEventListener('keydown', atajo);
                console.info('[SISVAN] Panel restaurado tras redibujo de la página');
            }
            if (!procesando && ultimaFirma !== null && firmaSeccion() !== ultimaFirma) procesarPagina(modoAuto);
        }, 700);
    }

    function atajo(e) {
        if (e.altKey && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); procesarPagina(true); }
    }

    function firmaSeccion() {
        return preguntas().map(q => q.titulo).join('|') || (enlaceOtraRespuesta() ? 'confirmacion' : '');
    }

    function actualizarContador() {
        const c = leer(K_CONTADOR, {});
        const n = c.dia === hoyISO() ? c.n : 0;
        if (contadorEl) contadorEl.textContent = `Enviados hoy: ${n}`;
    }

    function sumarEnvio() {
        const c = leer(K_CONTADOR, {});
        const n = (c.dia === hoyISO() ? c.n : 0) + 1;
        guardar(K_CONTADOR, { dia: hoyISO(), n });
        actualizarContador();
    }

    // ---------- Interacción con Google Forms ----------

    function escribir(el, v) {
        if (!el || el.value === v) return;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    function tituloDe(item) {
        const h = item.querySelector('[role="heading"]');
        return norm(h ? h.textContent : '');
    }

    // Solo preguntas con algo que responder: Google también pinta como listitem el encabezado
    // de cada sección (p. ej. "FECHA DEL ABORDAJE"), con el mismo título que la pregunta
    function preguntas() {
        return [...document.querySelectorAll('div[role="listitem"]')]
            .filter(el => el.querySelector('input:not([type="hidden"]), textarea, [role="radio"], [role="checkbox"], [role="listbox"]'))
            .map(el => ({ el, titulo: tituloDe(el) }))
            .filter(q => q.titulo);
    }

    // Las fechas pueden ser <input type="date"> o tres casillas Día/Mes/Año según el navegador
    function camposFecha(item) {
        const nativo = item.querySelector('input[type="date"]');
        if (nativo) return { nativo };
        const inputs = [...item.querySelectorAll('input[type="text"], input[type="number"], input:not([type])')];
        const porEtiqueta = re => inputs.find(i => re.test(i.getAttribute('aria-label') || ''));
        const dia = porEtiqueta(/d[ií]a|day/i), mes = porEtiqueta(/mes|month/i), anio = porEtiqueta(/a[ñn]o|year/i);
        if (dia && mes && anio) return { dia, mes, anio };
        if (inputs.length === 3) return { dia: inputs[0], mes: inputs[1], anio: inputs[2] };
        return null;
    }

    function escribirFecha(item, iso) {
        const c = camposFecha(item);
        if (!c || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
        if (c.nativo) escribir(c.nativo, iso);
        else {
            const [a, m, d] = iso.split('-');
            escribir(c.dia, d); escribir(c.mes, m); escribir(c.anio, a);
        }
        return leerFecha(item) === iso;
    }

    function leerFecha(item) {
        const c = camposFecha(item);
        if (!c) return '';
        if (c.nativo) return c.nativo.value;
        const d = c.dia.value.trim(), m = c.mes.value.trim(), a = c.anio.value.trim();
        if (!d || !m || a.length !== 4) return '';
        return `${a}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // Marca la opción cuyo valor coincide EXACTAMENTE (data-value), sin coincidencias parciales.
    // Devuelve null si no existe, true si quedó marcada y false si el clic aún no tomó
    // (recién llegada la sección, Google ignora clics hasta terminar de cargarla)
    function marcarOpcion(item, valor) {
        const radios = [...item.querySelectorAll('[role="radio"]')];
        const objetivo = norm(valor);
        const r = radios.find(x => x.getAttribute('data-value') === valor)
            || radios.find(x => norm(x.getAttribute('data-value') || x.getAttribute('aria-label') || x.textContent) === objetivo);
        if (!r) return null;
        if (r.getAttribute('aria-checked') !== 'true') r.click();
        return r.getAttribute('aria-checked') === 'true';
    }

    const pausa = ms => new Promise(r => setTimeout(r, ms));

    // Espera a que la sección deje de cambiar (Google la va pintando por partes)
    async function esperarEstable() {
        let previa = firmaSeccion();
        for (let i = 0; i < 20; i++) {
            await pausa(250);
            const actual = firmaSeccion();
            if (actual === previa) return;
            previa = actual;
        }
    }

    function botonSiguiente() {
        return [...document.querySelectorAll('div[role="button"], button')]
            .find(b => /^(siguiente|next)$/i.test(b.textContent.trim()));
    }

    function enlaceOtraRespuesta() {
        return [...document.querySelectorAll('a[href*="viewform"]')]
            .find(a => /otra respuesta|another response/i.test(a.textContent));
    }

    function formularioListo() {
        if (enlaceOtraRespuesta()) return 'confirmacion';
        const items = document.querySelectorAll('div[role="listitem"]');
        if (!items.length) return false;
        return document.querySelector('div[role="listitem"] input[disabled]') ? false : 'formulario';
    }

    let procesando = false;
    let modoAuto = false;
    let ultimaFirma = null;   // Títulos de la sección ya procesada, para detectar cambios de sección

    async function procesarPagina(avanzar) {
        if (procesando) return;
        procesando = true;
        try {
            let tipo = await esperar(formularioListo);
            await esperarEstable();
            tipo = formularioListo() || tipo;
            ultimaFirma = firmaSeccion();

            if (tipo === 'confirmacion') {
                const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
                if (!nav || nav.type !== 'reload') sumarEnvio();  // F5 en la confirmación no cuenta doble
                if (avanzar) {
                    estado('Respuesta enviada ✓ Abriendo un formulario nuevo…', 'ok');
                    setTimeout(() => { const a = enlaceOtraRespuesta(); if (a) a.click(); }, RETRASO_ACCION);
                } else {
                    estado('Respuesta enviada ✓', 'ok');
                }
                return;
            }
            if (!tipo) {
                estado('El formulario no terminó de cargar. ¿Iniciaste sesión en Google?', 'err');
                return;
            }

            if (!catalogo) {
                estado('No se pudo leer el catálogo del formulario. Recarga la página.', 'err');
                return;
            }

            // Rellena y vuelve a comprobar hasta que Google registre todo (máx. ~4 s)
            let res = rellenarSeccion();
            for (let intento = 0; res.pendientes && !res.faltan.length && intento < 10; intento++) {
                await pausa(400);
                res = rellenarSeccion();
            }
            res.ayudas = instalarAyudas();

            if (res.total === 0) {
                // Sección de datos del evaluado / antropometría: la llena el usuario
                const vacio = document.querySelector('div[role="listitem"] input[type="text"]:not([disabled])');
                if (vacio && !vacio.value && avanzar) vacio.focus();
                estado('Sección de datos del niño(a): complétala manualmente.' + (res.ayudas ? ' La edad se calcula sola.' : ''));
                return;
            }
            if (res.faltan.length) {
                estado('Falta en el panel: ' + res.faltan.join(', '), 'warn');
                return;
            }
            if (res.pendientes) {
                estado('Google no registró la selección. Pulsa RELLENAR de nuevo.', 'warn');
                return;
            }
            if (res.desconocidas) {
                estado('Sección rellenada, pero tiene preguntas que el script no maneja. Revisa y pulsa Siguiente.', 'warn');
                return;
            }
            if (!avanzar) {
                estado('Sección rellenada ✓', 'ok');
                return;
            }
            estado('Sección rellenada ✓ Pasando a la siguiente…', 'ok');
            await pausa(RETRASO_ACCION);
            // Última comprobación justo antes de avanzar
            const final = rellenarSeccion();
            if (final.pendientes || final.faltan.length) {
                estado('Una respuesta se desmarcó antes de avanzar. Pulsa RELLENAR de nuevo.', 'warn');
                return;
            }
            const b = botonSiguiente();
            if (b) b.click();
            else estado('Sección rellenada ✓ (no hay botón Siguiente)', 'ok');
        } finally {
            procesando = false;
        }
    }

    // Devuelve cuántas preguntas de cabecera había, cuáles faltan en el panel y si hay otras desconocidas
    function rellenarSeccion() {
        const t = catalogo.titulos;
        const res = { total: 0, faltan: [], pendientes: 0, desconocidas: 0 };

        preguntas().forEach(({ el, titulo }) => {
            // accion: true = listo, false = aún no registrado (reintentar), null = imposible
            const tarea = (nombre, valor, accion) => {
                res.total++;
                const r = valor ? accion(valor) : null;
                if (r === null) res.faltan.push(nombre);
                else if (!r) res.pendientes++;
            };
            const input = el.querySelector('input[type="text"]');
            const texto = v => { if (!input) return null; escribir(input, v); return input.value === v; };

            if (titulo.includes('TRANSCRIPTOR') && titulo.includes('NOMBRE')) {
                tarea('Transcriptor', datos.n, texto);
            } else if (titulo.includes('TRANSCRIPTOR') && titulo.includes('CEDULA')) {
                tarea('Cédula', datos.c, texto);
            } else if (titulo.includes('FECHA DEL ABORDAJE')) {
                tarea('Fecha', datos.f, v => escribirFecha(el, v));
            } else if (t.mun.includes(titulo)) {
                tarea('Municipio', datos.m, v => marcarOpcion(el, v));
            } else if (t.par.includes(titulo)) {
                tarea('Parroquia', datos.p, v => marcarOpcion(el, v));
            } else if (t.niv3.includes(titulo)) {
                tarea(catalogo.etiqueta3.replace(/^\S+\s/, ''), datos.e, v => marcarOpcion(el, v));
            } else {
                res.desconocidas++;
            }
        });

        if (res.total === 0) res.desconocidas = 0;
        return res;
    }

    // ---------- Ayudas en la sección del evaluado ----------

    function calcularEdad(nacISO, refISO) {
        const [na, nm, nd] = nacISO.split('-').map(Number);
        const [ra, rm, rd] = refISO.split('-').map(Number);
        if (!na || !ra) return null;
        const edad = ra - na - ((rm < nm || (rm === nm && rd < nd)) ? 1 : 0);
        return edad >= 0 && edad < 120 ? edad : null;
    }

    function instalarAyudas() {
        const qs = preguntas();
        const buscar = txt => qs.find(q => q.titulo.includes(txt));

        // EDAD CUMPLIDA a partir de FECHA DE NACIMIENTO y la fecha del abordaje
        const nac = buscar('FECHA DE NACIMIENTO');
        const edad = buscar('EDAD CUMPLIDA');
        if (nac && edad && !nac.el.dataset.svAyuda) {
            nac.el.dataset.svAyuda = '1';
            const inEdad = edad.el.querySelector('input[type="text"]');
            const recalcular = () => {
                const f = leerFecha(nac.el);
                const e = f.length === 10 ? calcularEdad(f, datos.f || hoyISO()) : null;
                if (e === null || !inEdad) return;
                // Solo sobrescribe si está vacío o lo puso el propio script
                if (!inEdad.value || inEdad.value === inEdad.dataset.svAuto) {
                    escribir(inEdad, String(e));
                    inEdad.dataset.svAuto = String(e);
                }
            };
            nac.el.addEventListener('input', recalcular, true);
            nac.el.addEventListener('change', recalcular, true);
        }

        // PESO: el formulario exige coma decimal (65,5)
        const peso = buscar('PESO');
        if (peso && !peso.el.dataset.svAyuda) {
            peso.el.dataset.svAyuda = '1';
            const inPeso = peso.el.querySelector('input[type="text"]');
            if (inPeso) inPeso.addEventListener('blur', () => {
                if (inPeso.value.includes('.')) escribir(inPeso, inPeso.value.replace(/\./g, ','));
            });
        }

        return !!(nac && edad);
    }

    // Inicialización segura (el cargador puede inyectar este script antes o después del DOM)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', montarInterfaz);
    } else {
        montarInterfaz();
    }

})();
