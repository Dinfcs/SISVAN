// ==UserScript==
// @name         AutoFill SISVAN - Universal v1.1
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Se configura solo leyendo las preguntas del formulario: marca cuáles son fijas y las rellena; avisa si el formulario cambia
// @author       Luis Escalante
// @match        https://docs.google.com/forms/d/e/1FAIpQLScPb-tduoYfOTZ1nDhZaDwQPENA315YOXdTYdpjIrUoG7lp-Q/*
// @match        https://docs.google.com/forms/u/*/d/e/1FAIpQLScPb-tduoYfOTZ1nDhZaDwQPENA315YOXdTYdpjIrUoG7lp-Q/*
// @match        https://docs.google.com/forms/d/e/1FAIpQLSeW5L6vfgcBXbZTs2K3gVuyioFlD0SsgmL2um4n7Lf4bOinCw/*
// @match        https://docs.google.com/forms/u/*/d/e/1FAIpQLSeW5L6vfgcBXbZTs2K3gVuyioFlD0SsgmL2um4n7Lf4bOinCw/*
// @match        https://docs.google.com/forms/d/e/1FAIpQLSeERJOjmc-5ubYtuxSk7xD1IHKGRl_jfGNHbM3JB1KqaZ9ISw/*
// @match        https://docs.google.com/forms/u/*/d/e/1FAIpQLSeERJOjmc-5ubYtuxSk7xD1IHKGRl_jfGNHbM3JB1KqaZ9ISw/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // Si conviven con AutoFillSISVAN2 (v8) en el mismo formulario solo uno debe actuar: esta, salvo
    // que se haya elegido volver a la v8 con el enlace "↩ v8" del pie (se guarda en sv_version).
    try { if (localStorage.getItem('sv_version') === 'v8') return; } catch (e) { /* sin almacenamiento: actúa */ }
    if (window.__svUniversal) return;  // evita doble carga (Tampermonkey + cargador)
    window.__svUniversal = true;

    const VERSION = '1.1';
    const RETRASO_ACCION = 800;   // Milisegundos antes de pulsar "Siguiente"
    const ESPERA_MAX = 10000;     // Máximo de espera a que Google habilite el formulario

    // Con sesión iniciada Google usa /forms/u/0/d/e/<ID>/... al pasar de sección
    const FORM_ID = (location.pathname.match(/\/forms\/(?:u\/\d+\/)?d\/e\/([^/]+)/) || [])[1] || 'desconocido';
    const K_CFG = 'sv_u_cfg_' + FORM_ID;          // { modos, valores, conocidas } de este formulario
    const K_ESTRUCTURA = 'sv_u_estructura_' + FORM_ID;
    const K_TITULOS = 'sv_u_por_titulo';           // Valores fijos por título: se comparten entre formularios
    const K_AUTO = 'sv_u_auto';
    const K_MIN = 'sv_u_min';
    const K_VISTA = 'sv_u_vista';
    const K_CONTADOR = 'sv_contador_v8';           // El mismo contador que la v8

    // Tipos de pregunta en FB_PUBLIC_LOAD_DATA_
    const T = { CORTA: 0, PARRAFO: 1, OPCION: 2, LISTA: 3, CASILLAS: 4, ESCALA: 5, CUADRICULA: 7, SECCION: 8, FECHA: 9, HORA: 10 };
    const SOPORTADOS = new Set([T.CORTA, T.PARRAFO, T.OPCION, T.LISTA, T.CASILLAS, T.ESCALA, T.FECHA, T.HORA]);
    const NOMBRE_TIPO = { 0: 'texto', 1: 'párrafo', 2: 'opción', 3: 'lista', 4: 'casillas', 5: 'escala', 7: 'cuadrícula', 9: 'fecha', 10: 'hora' };
    const SALTO_SIGUIENTE = -2, SALTO_ENVIAR = -3;

    // Preguntas que por defecto se consideran fijas (luego se cambian con ⚙)
    const PATRON_FIJA = /TRANSCRIPTOR|FECHA DEL ABORDAJE|MUNICIPIO|PARROQUIA|ESCUELA|ORGANISMO|ESTABLECIMIENTO|INSTITUCION/;

    const CSS = `
        #svu-panel {
            position: fixed; top: 15px; left: 15px; width: 330px;
            background: rgba(255, 255, 255, 0.98);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            z-index: 100000;
            font-family: 'Segoe UI', Roboto, Arial, sans-serif;
            border: 1px solid #1a73e8;
            transition: all 0.3s ease;
            overflow: hidden;
            color: #202124;
        }
        #svu-panel.minimized { width: 200px; height: 46px; border-radius: 12px; }
        #svu-panel.minimized .svu-main { display: none; }

        .svu-head { display: flex; gap: 6px; padding: 8px; background: #f8f9fa; border-bottom: 1px solid #eee; align-items: center; }
        .svu-main { padding: 10px 15px 15px; max-height: 80vh; overflow-y: auto; }
        .svu-btn {
            border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 10px;
            transition: all 0.2s; height: 30px; display: flex; align-items: center; justify-content: center;
        }
        .svu-fill { flex: 3; background: #1a73e8; color: white; }
        .svu-auto { flex: 2; background: #fff; color: #3c4043; border: 1px solid #dadce0; }
        .svu-auto.on { background: #e6f4ea; color: #137333; border-color: #ceead6; font-weight: 800; }
        .svu-icon { width: 30px; flex: none; background: #eee; color: #444; font-size: 13px; }
        .svu-icon.on { background: #1a73e8; color: #fff; }

        .svu-tag {
            display: block; font-size: 10px; color: #1a73e8; font-weight: 700; margin: 8px 0 3px;
            text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .svu-field {
            width: 100%; padding: 7px 10px; border: 1px solid #dee2e6; border-radius: 8px;
            font-size: 13px; margin-bottom: 2px; box-sizing: border-box; background: #fff; color: #202124;
        }
        .svu-field:focus { border-color: #1a73e8; outline: none; box-shadow: 0 0 0 3px rgba(26,115,232,0.1); }
        .svu-field.invalido { border-color: #d93025; background: #fce8e6; }
        .svu-casillas label { display: block; font-size: 12px; margin: 2px 0; }

        .svu-sec { font-size: 9px; color: #80868b; letter-spacing: .5px; text-transform: uppercase; margin: 12px 0 4px; border-top: 1px solid #eee; padding-top: 6px; }
        .svu-fila { display: flex; align-items: flex-start; gap: 6px; font-size: 11px; padding: 3px 0; }
        .svu-fila input { margin-top: 1px; flex: none; }
        .svu-fila .tit { flex: 1; }
        .svu-fila.off { color: #9aa0a6; }
        .svu-chip { font-size: 9px; padding: 0 5px; border-radius: 6px; background: #f1f3f4; color: #5f6368; white-space: nowrap; }
        .svu-chip.nueva { background: #fef7e0; color: #b06000; font-weight: 700; }

        .svu-nota { font-size: 11px; color: #5f6368; background: #f8f9fa; border-radius: 8px; padding: 6px 8px; margin: 8px 0; line-height: 1.4; }
        .svu-aviso { font-size: 11px; background: #fef7e0; color: #7a4a00; border-radius: 8px; padding: 8px; margin-bottom: 8px; line-height: 1.4; }
        .svu-aviso button { margin: 6px 6px 0 0; border: 1px solid #e0c080; background: #fff; border-radius: 6px; font-size: 10px; padding: 3px 8px; cursor: pointer; }

        .svu-status { margin-top: 12px; padding: 8px 10px; border-radius: 8px; font-size: 11px; line-height: 1.4; background: #f1f3f4; color: #3c4043; }
        .svu-status.ok { background: #e6f4ea; color: #137333; }
        .svu-status.warn { background: #fef7e0; color: #b06000; }
        .svu-status.err { background: #fce8e6; color: #c5221f; }
        .svu-foot { margin-top: 6px; font-size: 10px; color: #80868b; display: flex; justify-content: space-between; gap: 6px; }
        .svu-foot a { color: #80868b; cursor: pointer; text-decoration: underline; }
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

    function vaciar(el) { while (el.firstChild) el.removeChild(el.firstChild); }

    const pausa = ms => new Promise(r => setTimeout(r, ms));

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

    // ---------- Estructura del formulario ----------
    // Todo sale de FB_PUBLIC_LOAD_DATA_, que Google incrusta en cada página del formulario:
    // preguntas, opciones, saltos entre secciones y validaciones.

    function leerEstructura(data) {
        const items = data && data[1] && data[1][1];
        if (!Array.isArray(items)) return null;

        const secciones = [{ id: 'inicio', titulo: 'Inicio', preguntas: [], salida: SALTO_SIGUIENTE }];
        for (const it of items) {
            if (it[3] === T.SECCION) {
                // it[5] indica adónde va la sección ANTERIOR al terminar (-2 siguiente, -3 enviar o id de sección)
                secciones[secciones.length - 1].salida = it[5] == null ? SALTO_SIGUIENTE : it[5];
                secciones.push({ id: it[0], titulo: (it[1] || '').trim(), preguntas: [], salida: SALTO_SIGUIENTE });
                continue;
            }
            const q = it[4] && it[4][0];
            if (!q) continue;  // Títulos, imágenes y videos no se responden
            const extraFecha = q[7] || [];
            secciones[secciones.length - 1].preguntas.push({
                id: it[0],
                entry: String(q[0]),
                tipo: it[3],
                titulo: (it[1] || '').trim(),
                descripcion: it[2] || '',
                obligatoria: !!q[2],
                opciones: (q[1] || []).filter(o => o[0]).map(o => ({ v: o[0], salto: o[2] == null ? null : o[2] })),
                validacion: q[4] || null,
                // Fechas con hora o sin año no se manejan
                soportada: SOPORTADOS.has(it[3]) && !(it[3] === T.FECHA && (extraFecha[0] === 1 || extraFecha[1] === 0))
            });
        }
        return { titulo: ((data[1] && data[1][8]) || data[3] || '').trim(), secciones };
    }

    function indexar(est) {
        est.preguntas = [];
        est.porId = new Map();
        est.secciones.forEach((s, i) => s.preguntas.forEach(p => {
            p.clave = norm(p.titulo);
            p.seccion = i;
            // Una sección con saltos según la respuesta: municipio → parroquias de ese municipio, etc.
            p.ramifica = (p.tipo === T.OPCION || p.tipo === T.LISTA) && p.opciones.some(o => o.salto != null);
            est.preguntas.push(p);
            est.porId.set(p.id, p);
        }));
        return est;
    }

    function obtenerEstructura() {
        let est = null;
        try { est = leerEstructura(window.FB_PUBLIC_LOAD_DATA_); } catch (e) { est = null; }
        if (est && est.secciones.some(s => s.preguntas.length)) guardar(K_ESTRUCTURA, est);
        else est = leer(K_ESTRUCTURA, null);  // p. ej. en la página de confirmación
        return est ? indexar(est) : null;
    }

    const esOpcionUnica = p => p.tipo === T.OPCION || p.tipo === T.LISTA || p.tipo === T.ESCALA;

    // ---------- Configuración: qué es fijo y con qué valor ----------

    let est = null;
    let cfg = null;
    let porTitulo = {};
    let nuevas = new Set();

    function modoPorDefecto(p) {
        return p.soportada && (p.ramifica || PATRON_FIJA.test(p.clave)) ? 'fija' : 'variable';
    }
    function modo(p) {
        return p.soportada ? (cfg.modos[p.entry] || modoPorDefecto(p)) : 'variable';
    }

    function valorValido(p, v) {
        if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return false;
        if (esOpcionUnica(p)) return p.opciones.some(o => o.v === v);
        if (p.tipo === T.CASILLAS) return Array.isArray(v) && v.every(x => p.opciones.some(o => o.v === x));
        return true;
    }

    // Valor propio de la pregunta o, si no tiene, el de una pregunta con el mismo título (otro formulario)
    function valor(p) {
        const v = cfg.valores[p.entry];
        if (v !== undefined && v !== '') return v;
        const g = porTitulo[p.clave];
        return valorValido(p, g) ? g : '';
    }

    function fijarValor(p, v) {
        cfg.valores[p.entry] = v;
        if (p.tipo !== T.CASILLAS) porTitulo[p.clave] = v;
        guardar(K_CFG, cfg);
        guardar(K_TITULOS, porTitulo);
    }

    function cargarConfiguracion() {
        cfg = leer(K_CFG, null);
        porTitulo = leer(K_TITULOS, {});
        if (cfg) return;

        cfg = { modos: {}, valores: {}, conocidas: null };
        // Primera vez: aprovechar lo que ya estaba guardado en la v8
        const comun = leer('sv_comun_v8', {});
        const ubic = leer('sv_ubic_v8_' + FORM_ID, {});
        est.preguntas.forEach(p => {
            if (p.clave.includes('TRANSCRIPTOR') && p.clave.includes('NOMBRE') && comun.n) cfg.valores[p.entry] = comun.n;
            else if (p.clave.includes('TRANSCRIPTOR') && p.clave.includes('CEDULA') && comun.c) cfg.valores[p.entry] = comun.c;
            else if (p.clave.includes('FECHA DEL ABORDAJE') && comun.f) cfg.valores[p.entry] = comun.f;
            else if (esOpcionUnica(p)) {
                const v = [ubic.m, ubic.p, ubic.e].find(x => x && p.opciones.some(o => o.v === x));
                if (v) cfg.valores[p.entry] = v;
            }
        });
        guardar(K_CFG, cfg);
    }

    // Compara con las preguntas que había la última vez
    function detectarCambios() {
        const actuales = est.preguntas.map(p => p.entry);
        if (!cfg.conocidas) {
            cfg.conocidas = actuales;
            guardar(K_CFG, cfg);
        }
        const antes = new Set(cfg.conocidas), ahora = new Set(actuales);
        nuevas = new Set(actuales.filter(e => !antes.has(e)));
        const eliminadas = cfg.conocidas.filter(e => !ahora.has(e)).length;
        const invalidos = est.preguntas.filter(p => modo(p) === 'fija' && cfg.valores[p.entry] && !valorValido(p, cfg.valores[p.entry])).length;
        return (nuevas.size || eliminadas || invalidos) ? { nuevas: nuevas.size, eliminadas, invalidos } : null;
    }

    function aceptarCambios() {
        cfg.conocidas = est.preguntas.map(p => p.entry);
        guardar(K_CFG, cfg);
        nuevas = new Set();
    }

    // Simula la navegación del formulario con los valores fijos actuales:
    // devuelve las secciones por las que pasaría y, si se detiene antes, por qué
    function recorrido() {
        const camino = [], vistas = new Set();
        let i = 0, motivo = '';
        while (i >= 0 && i < est.secciones.length && !vistas.has(i)) {
            const s = est.secciones[i];
            vistas.add(i);
            camino.push(s);
            let destino = s.salida;
            const r = s.preguntas.find(p => p.ramifica);
            if (r) {
                if (modo(r) !== 'fija') { motivo = `"${r.titulo}" es variable: lo que sigue depende de cada registro.`; break; }
                const o = r.opciones.find(x => x.v === valor(r));
                if (!o) { motivo = `Elige "${r.titulo}" para ver lo que sigue.`; break; }
                if (o.salto != null) destino = o.salto;
            }
            if (destino === SALTO_ENVIAR) break;
            i = destino === SALTO_SIGUIENTE ? i + 1 : est.secciones.findIndex(x => x.id === destino);
        }
        return { camino, motivo };
    }

    // ---------- Interfaz ----------

    let statusEl = null, contadorEl = null, cuerpo = null, avisoEl = null;
    let vista = 'normal';

    function estado(msg, tipo = '') {
        console.info('[SISVAN-U]', msg, '|', firmaSeccion() || '(sin preguntas)', '|', location.pathname);
        if (!statusEl) return;
        statusEl.textContent = msg;
        statusEl.className = 'svu-status' + (tipo ? ' ' + tipo : '');
    }

    function nota(texto) {
        cuerpo.appendChild(crearEl('div', { className: 'svu-nota', textContent: texto }));
    }

    function control(p) {
        const v = valor(p);
        let el;
        if (esOpcionUnica(p)) {
            el = crearEl('select', { className: 'svu-field' });
            el.appendChild(crearEl('option', { value: '', textContent: '— Seleccione —' }));
            p.opciones.forEach(o => el.appendChild(crearEl('option', { value: o.v, textContent: o.v.trim(), selected: o.v === v })));
            const guardado = cfg.valores[p.entry];
            if (guardado && !valorValido(p, guardado)) {
                el.classList.add('invalido');
                el.title = `"${guardado}" ya no existe en el formulario`;
            }
            el.addEventListener('change', () => { fijarValor(p, el.value); if (p.ramifica) render(); });
        } else if (p.tipo === T.CASILLAS) {
            el = crearEl('div', { className: 'svu-casillas' });
            const marcadas = Array.isArray(v) ? v : [];
            p.opciones.forEach(o => {
                const cb = crearEl('input', { type: 'checkbox', value: o.v, checked: marcadas.includes(o.v) });
                cb.addEventListener('change', () => fijarValor(p, [...el.querySelectorAll('input')].filter(x => x.checked).map(x => x.value)));
                const lab = crearEl('label');
                lab.append(cb, document.createTextNode(' ' + o.v.trim()));
                el.appendChild(lab);
            });
        } else {
            const tipo = p.tipo === T.FECHA ? 'date' : p.tipo === T.HORA ? 'time' : 'text';
            el = crearEl('input', { className: 'svu-field', type: tipo, value: v || '' });
            el.addEventListener('input', () => fijarValor(p, tipo === 'text' ? el.value.trim() : el.value));
        }
        return el;
    }

    function renderNormal() {
        const { camino, motivo } = recorrido();
        let hay = 0;
        camino.forEach(s => s.preguntas.filter(p => modo(p) === 'fija').forEach(p => {
            cuerpo.append(crearEl('label', { className: 'svu-tag', textContent: p.titulo, title: p.titulo }), control(p));
            hay++;
        }));
        if (motivo) nota(motivo);
        if (!hay) nota('Ninguna pregunta está marcada como fija. Pulsa ⚙ para elegirlas.');
    }

    function renderConfig() {
        nota('Marca las preguntas que son iguales en todos los registros (FIJAS): se rellenan solas. ' +
             'Las demás se dejan para llenarlas a mano en cada registro.');
        const { camino, motivo } = recorrido();
        camino.forEach(s => {
            cuerpo.appendChild(crearEl('div', { className: 'svu-sec', textContent: s.titulo }));
            if (!s.preguntas.length) { nota('(sección sin preguntas)'); return; }
            s.preguntas.forEach(p => {
                const fila = crearEl('label', { className: 'svu-fila' + (p.soportada ? '' : ' off') });
                const cb = crearEl('input', { type: 'checkbox', checked: modo(p) === 'fija', disabled: !p.soportada });
                cb.addEventListener('change', () => {
                    cfg.modos[p.entry] = cb.checked ? 'fija' : 'variable';
                    guardar(K_CFG, cfg);
                    render();
                });
                fila.append(cb, crearEl('span', { className: 'tit', textContent: p.titulo }));
                if (nuevas.has(p.entry)) fila.appendChild(crearEl('span', { className: 'svu-chip nueva', textContent: 'NUEVA' }));
                fila.appendChild(crearEl('span', { className: 'svu-chip', textContent: p.soportada ? (NOMBRE_TIPO[p.tipo] || '?') : 'no soportada' }));
                cuerpo.appendChild(fila);
            });
        });
        if (motivo) nota(motivo);
    }

    function renderAviso() {
        vaciar(avisoEl);
        const c = detectarCambios();
        avisoEl.style.display = c ? '' : 'none';
        if (!c) return;
        const partes = [];
        if (c.nuevas) partes.push(`${c.nuevas} pregunta(s) nueva(s)`);
        if (c.eliminadas) partes.push(`${c.eliminadas} eliminada(s)`);
        if (c.invalidos) partes.push(`${c.invalidos} valor(es) guardado(s) que ya no existen`);
        avisoEl.appendChild(document.createTextNode('⚠ El formulario cambió: ' + partes.join(', ') + '.'));
        avisoEl.appendChild(crearEl('br'));
        const revisar = crearEl('button', { type: 'button', textContent: 'Revisar' });
        const ok = crearEl('button', { type: 'button', textContent: 'Entendido' });
        revisar.addEventListener('click', () => cambiarVista('config'));
        ok.addEventListener('click', () => { aceptarCambios(); renderAviso(); render(); });
        avisoEl.append(revisar, ok);
    }

    let cfgBtn = null;

    function cambiarVista(v) {
        vista = v;
        guardarSesion(K_VISTA, v);
        cfgBtn.classList.toggle('on', v === 'config');
        render();
    }

    function render() {
        if (!cuerpo) return;
        const scroll = cuerpo.parentNode ? cuerpo.parentNode.scrollTop : 0;
        vaciar(cuerpo);
        if (vista === 'config') renderConfig(); else renderNormal();
        if (cuerpo.parentNode) cuerpo.parentNode.scrollTop = scroll;
    }

    function montarInterfaz() {
        if (document.getElementById('svu-panel') || !document.body) return;

        est = obtenerEstructura();

        const styleSheet = crearEl('style', { textContent: CSS });
        document.head.appendChild(styleSheet);

        const win = crearEl('div', { id: 'svu-panel' });
        const head = crearEl('div', { className: 'svu-head' });
        const main = crearEl('div', { className: 'svu-main' });

        const runBtn = crearEl('button', { type: 'button', className: 'svu-btn svu-fill', textContent: 'RELLENAR', title: 'Rellenar esta sección y pasar a la siguiente (Alt+R)' });
        const autoBtn = crearEl('button', { type: 'button', className: 'svu-btn svu-auto', textContent: 'AUTO: OFF' });
        cfgBtn = crearEl('button', { type: 'button', className: 'svu-btn svu-icon', textContent: '⚙', title: 'Elegir qué preguntas son fijas' });
        const minBtn = crearEl('button', { type: 'button', className: 'svu-btn svu-icon', textContent: '—' });
        head.append(runBtn, autoBtn, cfgBtn, minBtn);

        avisoEl = crearEl('div', { className: 'svu-aviso' });
        cuerpo = crearEl('div');
        statusEl = crearEl('div', { className: 'svu-status' });
        contadorEl = crearEl('span');
        const volver = crearEl('a', { textContent: '↩ v8', title: 'Volver a AutoFillSISVAN2 v8' });
        volver.addEventListener('click', () => { try { localStorage.setItem('sv_version', 'v8'); } catch (e) { /* sin almacenamiento */ } location.reload(); });
        const foot = crearEl('div', { className: 'svu-foot' });
        foot.append(crearEl('span', { textContent: `Universal ${VERSION} · Alt+R` }), contadorEl, volver);
        main.append(avisoEl, cuerpo, statusEl, foot);

        win.append(head, main);
        document.body.appendChild(win);
        actualizarContador();

        if (est) {
            cargarConfiguracion();
            renderAviso();
            vista = leerSesion(K_VISTA) === 'config' ? 'config' : 'normal';
            cambiarVista(vista);
        } else {
            avisoEl.style.display = 'none';
            estado('No se pudo leer la estructura del formulario. Recarga la página.', 'err');
        }

        // Minimizar
        if (leerSesion(K_MIN) === 'true') { win.classList.add('minimized'); minBtn.textContent = '▢'; }
        minBtn.addEventListener('click', () => {
            const isMin = win.classList.toggle('minimized');
            minBtn.textContent = isMin ? '▢' : '—';
            guardarSesion(K_MIN, isMin);
        });

        cfgBtn.addEventListener('click', () => cambiarVista(vista === 'config' ? 'normal' : 'config'));

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
    // Un temporizador sobrevive a eso: devuelve el panel y procesa la nueva sección
    function vigilar(win, styleSheet) {
        setInterval(() => {
            if (!document.body || !document.head) return;
            if (!styleSheet.isConnected) document.head.appendChild(styleSheet);
            if (!win.isConnected) {
                document.body.appendChild(win);
                document.addEventListener('keydown', atajo);
                console.info('[SISVAN-U] Panel restaurado tras redibujo de la página');
            }
            if (!procesando && ultimaFirma !== null && firmaSeccion() !== ultimaFirma) procesarPagina(modoAuto);
        }, 700);
    }

    function atajo(e) {
        if (e.altKey && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); procesarPagina(true); }
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

    // ---------- Lectura de la página ----------

    // Preguntas de la sección visible, unidas a su definición en la estructura.
    // Cada listitem trae data-params="%.@.[<id de la pregunta>, ...": se identifica por id, no por título.
    function preguntasEnPagina() {
        if (!est) return [];
        const res = [];
        document.querySelectorAll('div[role="listitem"]').forEach(el => {
            const dp = el.querySelector('[data-params]');
            const m = dp && /^%\.@\.\[(\d+),/.exec(dp.getAttribute('data-params') || '');
            let p = m ? est.porId.get(Number(m[1])) : null;
            if (!m) p = porTituloEnPagina(el);
            if (p) res.push({ el, p });
        });
        return res;
    }

    // Respaldo si Google deja de poner data-params: por título y, si hay títulos repetidos, por sus opciones
    function porTituloEnPagina(el) {
        if (!el.querySelector('input:not([type="hidden"]), textarea, [role="radio"], [role="checkbox"], [role="listbox"]')) return null;
        const h = el.querySelector('[role="heading"]');
        const clave = norm(h ? h.textContent : '');
        const candidatas = est.preguntas.filter(p => p.clave === clave);
        if (candidatas.length < 2) return candidatas[0] || null;
        const valores = [...el.querySelectorAll('[data-value]')].map(x => x.getAttribute('data-value'));
        return candidatas.find(p => valores.length && valores.every(v => p.opciones.some(o => o.v === v))) || candidatas[0];
    }

    function firmaSeccion() {
        return preguntasEnPagina().map(x => x.p.id).join('|') || (enlaceOtraRespuesta() ? 'confirmacion' : '');
    }

    // ---------- Escritura en Google Forms ----------

    function escribir(el, v) {
        if (!el || el.value === v) return;
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
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

    function leerFecha(item) {
        const c = camposFecha(item);
        if (!c) return '';
        if (c.nativo) return c.nativo.value;
        const d = c.dia.value.trim(), m = c.mes.value.trim(), a = c.anio.value.trim();
        if (!d || !m || a.length !== 4) return '';
        return `${a}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // Cada "aplicar" devuelve: true = quedó registrado, false = aún no (reintentar), null = imposible

    function aplicarFecha(item, iso) {
        const c = camposFecha(item);
        if (!c || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
        if (c.nativo) escribir(c.nativo, iso);
        else {
            const [a, m, d] = iso.split('-');
            escribir(c.dia, d); escribir(c.mes, m); escribir(c.anio, a);
        }
        return leerFecha(item) === iso;
    }

    function aplicarHora(item, hhmm) {
        const nativo = item.querySelector('input[type="time"]');
        if (nativo) { escribir(nativo, hhmm); return nativo.value === hhmm; }
        const inputs = [...item.querySelectorAll('input:not([type="hidden"])')];
        const hora = inputs.find(i => /hora|hour/i.test(i.getAttribute('aria-label') || '')) || inputs[0];
        const min = inputs.find(i => /minuto|minute/i.test(i.getAttribute('aria-label') || '')) || inputs[1];
        const [h, m] = String(hhmm).split(':');
        if (!hora || !min || m === undefined) return null;
        escribir(hora, h); escribir(min, m);
        return hora.value === h && min.value === m;
    }

    function aplicarTexto(item, v) {
        const input = item.querySelector('textarea, input[type="text"], input[type="email"], input[type="url"], input[type="number"]');
        if (!input) return null;
        escribir(input, v);
        return input.value === v;
    }

    // Opción única por valor EXACTO (data-value), sin coincidencias parciales.
    // Recién llegada la sección Google ignora clics: por eso se comprueba aria-checked
    function aplicarOpcion(item, v) {
        const radios = [...item.querySelectorAll('[role="radio"]')];
        const objetivo = norm(v);
        const r = radios.find(x => x.getAttribute('data-value') === v)
            || radios.find(x => norm(x.getAttribute('data-value') || x.getAttribute('aria-label') || x.textContent) === objetivo);
        if (!r) return null;
        if (r.getAttribute('aria-checked') !== 'true') r.click();
        return r.getAttribute('aria-checked') === 'true';
    }

    // Lista desplegable: se abre y se pulsa la opción (las opciones pueden pintarse fuera del listitem)
    function aplicarLista(item, v) {
        const lb = item.querySelector('[role="listbox"]');
        if (!lb) return null;
        const elegida = lb.querySelector('[role="option"][aria-selected="true"]');
        if (elegida && elegida.getAttribute('data-value') === v) return true;
        const buscar = raiz => [...raiz.querySelectorAll('[role="option"]')].find(o => o.getAttribute('data-value') === v);
        lb.click();
        const opt = buscar(item) || buscar(document);
        if (!opt) return null;
        opt.click();
        return false;  // se confirma en el siguiente intento
    }

    function aplicarCasillas(item, valores) {
        const cajas = [...item.querySelectorAll('[role="checkbox"]')];
        if (!cajas.length) return null;
        let listo = true;
        cajas.forEach(c => {
            const v = c.getAttribute('data-answer-value') || c.getAttribute('aria-label') || '';
            const quiero = valores.includes(v);
            if ((c.getAttribute('aria-checked') === 'true') !== quiero) {
                c.click();
                if ((c.getAttribute('aria-checked') === 'true') !== quiero) listo = false;
            }
        });
        return listo;
    }

    function aplicar(item, p, v) {
        switch (p.tipo) {
            case T.FECHA: return aplicarFecha(item, v);
            case T.HORA: return aplicarHora(item, v);
            case T.OPCION: case T.ESCALA: return aplicarOpcion(item, v);
            case T.LISTA: return aplicarLista(item, v);
            case T.CASILLAS: return aplicarCasillas(item, v);
            default: return aplicarTexto(item, v);
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

    // Rellena las preguntas fijas de la sección visible
    function rellenarSeccion(pagina) {
        const res = { total: 0, faltan: [], pendientes: 0, variables: [] };
        pagina.forEach(({ el, p }) => {
            if (modo(p) !== 'fija') { res.variables.push({ el, p }); return; }
            res.total++;
            const v = valor(p);
            const r = valorValido(p, v) ? aplicar(el, p, v) : null;
            if (r === null) res.faltan.push(p.titulo);
            else if (!r) res.pendientes++;
        });
        return res;
    }

    let procesando = false;
    let modoAuto = false;
    let ultimaFirma = null;   // Preguntas de la sección ya procesada, para detectar cambios de sección

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
            if (!est) {
                estado('No se pudo leer la estructura del formulario. Recarga la página.', 'err');
                return;
            }

            const pagina = preguntasEnPagina();
            // Rellena y vuelve a comprobar hasta que Google registre todo (máx. ~4 s)
            let res = rellenarSeccion(pagina);
            for (let intento = 0; res.pendientes && !res.faltan.length && intento < 10; intento++) {
                await pausa(400);
                res = rellenarSeccion(pagina);
            }
            instalarAyudas(pagina);

            if (res.faltan.length) {
                estado('Falta en el panel: ' + res.faltan.join(', '), 'warn');
                return;
            }
            if (res.pendientes) {
                estado('Google no registró la selección. Pulsa RELLENAR de nuevo.', 'warn');
                return;
            }
            if (res.variables.length) {
                // Sección con datos de cada registro: la llena el usuario
                const vacio = res.variables.map(x => x.el.querySelector('input[type="text"]:not([disabled]), textarea')).find(i => i && !i.value);
                if (vacio && avanzar) vacio.focus();
                estado((res.total ? 'Lo fijo está listo. ' : '') + `Completa a mano: ${res.variables.length} pregunta(s).`);
                return;
            }
            if (!res.total) {
                estado('Esta sección no tiene preguntas.');
                return;
            }
            if (!avanzar) {
                estado('Sección rellenada ✓', 'ok');
                return;
            }
            estado('Sección rellenada ✓ Pasando a la siguiente…', 'ok');
            await pausa(RETRASO_ACCION);
            // Última comprobación justo antes de avanzar
            const final = rellenarSeccion(pagina);
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

    // ---------- Ayudas en las preguntas variables ----------

    function calcularEdad(nacISO, refISO) {
        const [na, nm, nd] = nacISO.split('-').map(Number);
        const [ra, rm, rd] = refISO.split('-').map(Number);
        if (!na || !ra) return null;
        const edad = ra - na - ((rm < nm || (rm === nm && rd < nd)) ? 1 : 0);
        return edad >= 0 && edad < 120 ? edad : null;
    }

    // Fecha del abordaje (o la primera fecha fija) como referencia para la edad
    function fechaReferencia() {
        const fechas = est.preguntas.filter(p => p.tipo === T.FECHA && modo(p) === 'fija' && valor(p));
        const p = fechas.find(x => x.clave.includes('ABORDAJE')) || fechas[0];
        return p ? valor(p) : hoyISO();
    }

    // Rango "número entre A y B" definido en la validación del propio formulario
    function rangoDe(p) {
        const v = p.validacion && p.validacion[0];
        return v && v[0] === 1 && v[1] === 7 && Array.isArray(v[2]) ? v[2].map(Number) : null;
    }

    function instalarAyudas(pagina) {
        // EDAD CUMPLIDA a partir de FECHA DE NACIMIENTO
        const nac = pagina.find(x => x.p.tipo === T.FECHA && x.p.clave.includes('NACIMIENTO'));
        const edad = pagina.find(x => x.p.tipo === T.CORTA && x.p.clave.includes('EDAD'));
        if (nac && edad && !nac.el.dataset.svuAyuda) {
            nac.el.dataset.svuAyuda = '1';
            const inEdad = edad.el.querySelector('input[type="text"]');
            const recalcular = () => {
                const f = leerFecha(nac.el);
                const e = f.length === 10 ? calcularEdad(f, fechaReferencia()) : null;
                if (e === null || !inEdad) return;
                // Solo sobrescribe si está vacío o lo puso el propio script
                if (!inEdad.value || inEdad.value === inEdad.dataset.svuAuto) {
                    escribir(inEdad, String(e));
                    inEdad.dataset.svuAuto = String(e);
                }
            };
            nac.el.addEventListener('input', recalcular, true);
            nac.el.addEventListener('change', recalcular, true);
        }

        // Coma decimal (si la descripción lo pide) y rango permitido, según el propio formulario
        pagina.forEach(({ el, p }) => {
            if (p.tipo !== T.CORTA || modo(p) === 'fija' || el.dataset.svuAyuda) return;
            const input = el.querySelector('input[type="text"]');
            const coma = /COMAS? NO PUNTOS?/.test(norm(p.descripcion));
            const rango = rangoDe(p);
            if (!input || (!coma && !rango)) return;
            el.dataset.svuAyuda = '1';
            input.addEventListener('blur', () => {
                if (coma && input.value.includes('.')) escribir(input, input.value.replace(/\./g, ','));
                if (!rango || !input.value) { input.style.outline = ''; return; }
                const n = parseFloat(input.value.replace(',', '.'));
                const fuera = isNaN(n) || n < rango[0] || n > rango[1];
                input.style.outline = fuera ? '2px solid #d93025' : '';
                if (fuera) estado(`${p.titulo}: "${input.value}" está fuera de rango (${rango[0]} a ${rango[1]}).`, 'warn');
            });
        });
    }

    // Inicialización segura (el cargador puede inyectar este script antes o después del DOM)
    function iniciar() {
        try {
            montarInterfaz();
        } catch (e) {
            console.error('[SISVAN-U] Error al montar el panel:', e);
        }
    }
    console.info('[SISVAN-U] Universal ' + VERSION + ' cargado en', location.pathname);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }

})();
