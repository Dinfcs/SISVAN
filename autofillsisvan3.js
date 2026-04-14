// ==UserScript==
// @name         AutoFill SISVAN - Edición Salud Bolívar v7.6
// @namespace    http://tampermonkey.net/
// @version      7.6
// @description  Filtro de visibilidad (ignora páginas ocultas), auto-reinicio y sobreescritura forzada.
// @author       User
// @match        https://docs.google.com/forms/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const RETRASO_ACCION = 800; 
    let estaNavegando = false;  
    let hashPaginaActual = ""; // Detectará los cambios de página reales en pantalla

    const CSS_PREMIUM = `
        #sv-panel {
            position: fixed; top: 15px; left: 15px; width: 310px;
            background: rgba(255, 255, 255, 0.98);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            z-index: 2147483647 !important;
            font-family: 'Segoe UI', Roboto, Arial, sans-serif;
            border: 1px solid #1a73e8;
            overflow: hidden;
        }
        #sv-panel.minimized { width: 180px; height: 46px; border-radius: 12px; }
        #sv-panel.minimized .sv-main { display: none; }
        .sv-head-btns { display: flex; gap: 6px; padding: 8px; background: #f8f9fa; border-bottom: 1px solid #eee; align-items: center; }
        .sv-main { padding: 12px 15px 15px; max-height: 80vh; overflow-y: auto; }
        .sv-tag { display: block; font-size: 10px; color: #1a73e8; font-weight: 700; margin: 8px 0 3px; text-transform: uppercase; }
        .sv-field { width: 100%; padding: 8px 12px; border: 1px solid #dee2e6; border-radius: 8px; font-size: 13px; margin-bottom: 4px; box-sizing: border-box; }
        .sv-btn-top { border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 10px; height: 30px; display: flex; align-items: center; justify-content: center; text-transform: uppercase; }
        .btn-fill { flex: 3; background: #1a73e8; color: white; }
        .btn-auto { flex: 2; background: #fff; color: #3c4043; border: 1px solid #dadce0; }
        .btn-auto.on { background: #e6f4ea; color: #137333; border-color: #ceead6; font-weight: 800; }
        .btn-min { width: 30px; flex: none; background: #eee; color: #666; }
        .sv-sep { height: 1px; background: #eee; margin: 15px 0 10px; position: relative; }
        .sv-sep::after { content: "UBICACIÓN Y SALUD"; position: absolute; top: -6px; left: 50%; transform: translateX(-50%); background: white; padding: 0 8px; font-size: 8px; color: #aaa; }
    `;

    function crearEl(tag, props = {}) {
        const el = document.createElement(tag);
        Object.assign(el, props);
        return el;
    }

    function montarInterfaz() {
        if (document.getElementById('sv-panel')) return;

        if (!document.getElementById("sv-styles")) {
            const styleSheet = document.createElement("style");
            styleSheet.id = "sv-styles";
            styleSheet.textContent = CSS_PREMIUM;
            document.head.appendChild(styleSheet);
        }

        const win = crearEl('div', { id: 'sv-panel' });
        const head = crearEl('div', { className: 'sv-head-btns' });
        const main = crearEl('div', { className: 'sv-main' });

        const runBtn = crearEl('button', { id: 'sv-run', className: 'sv-btn-top btn-fill', textContent: 'RELLENAR' });
        const autoBtn = crearEl('button', { id: 'sv-auto', className: 'sv-btn-top btn-auto', textContent: 'AUTO: OFF' });
        const minBtn = crearEl('button', { id: 'sv-min', className: 'sv-btn-top btn-min', textContent: '—' });
        
        head.append(runBtn, autoBtn, minBtn);

        const config =[
            { id: 'n', label: '👤 Transcriptor', ph: 'Nombre y Apellido' },
            { id: 'c', label: '🆔 Cédula', ph: 'V-000000' },
            { id: 'f', label: '📅 Fecha Abordaje', ph: 'DD/MM/AAAA' },
            { id: 'sep', type: 'sep' },
            { id: 'm', label: '📍 Municipio', ph: 'Ej: CARONÍ' },
            { id: 'p', label: '🏘 Parroquia', ph: 'Ej: CATEDRAL' },
            { id: 'i', label: '🏫 Organismo Salud', ph: 'Ej: AUI LA SHELL' }
        ];

        config.forEach(item => {
            if(item.type === 'sep') { main.appendChild(crearEl('div', {className: 'sv-sep'})); return; }
            const label = crearEl('label', { className: 'sv-tag', textContent: item.label });
            const input = crearEl('input', { id: 'sv-in-' + item.id, className: 'sv-field', placeholder: item.ph, type: 'text' });
            main.append(label, input);
        });

        win.append(head, main);
        document.body.appendChild(win);

        if (sessionStorage.getItem('sv_minimized') === 'true') {
            win.classList.add('minimized');
            minBtn.textContent = '▢';
        }

        setupLogic(win, minBtn, autoBtn);
    }

    function setupLogic(win, minBtn, autoBtn) {
        const saved = JSON.parse(localStorage.getItem('sv_salud_v7') || '{}');
        const ids =['n', 'c', 'f', 'm', 'p', 'i'];
        
        ids.forEach(id => {
            const el = document.getElementById('sv-in-' + id);
            if (el) {
                if (saved[id]) el.value = saved[id];
                el.addEventListener('input', () => {
                    const d = JSON.parse(localStorage.getItem('sv_salud_v7') || '{}');
                    d[id] = el.value;
                    localStorage.setItem('sv_salud_v7', JSON.stringify(d));
                });
            }
        });

        minBtn.addEventListener('click', () => {
            const isMin = win.classList.toggle('minimized');
            minBtn.textContent = isMin ? '▢' : '—';
            sessionStorage.setItem('sv_minimized', isMin);
        });

        document.getElementById('sv-run').addEventListener('click', () => fill(true));

        const updateAutoBtnUI = () => {
            const isAuto = sessionStorage.getItem('sv_auto_salud') === 'true';
            if (isAuto) {
                autoBtn.textContent = "AUTO: ON";
                autoBtn.classList.add('on');
            } else {
                autoBtn.textContent = "AUTO: OFF";
                autoBtn.classList.remove('on');
            }
        };

        autoBtn.addEventListener('click', () => {
            const currentAuto = sessionStorage.getItem('sv_auto_salud') === 'true';
            sessionStorage.setItem('sv_auto_salud', !currentAuto);
            updateAutoBtnUI();
            if (!currentAuto) fill(false); 
        });

        updateAutoBtnUI();
    }

    // Identifica visualmente en qué página estamos leyendo el texto de las preguntas
    function getFirmaPagina() {
        let firma = "";
        document.querySelectorAll('div[role="listitem"]').forEach(el => {
            if (el.offsetParent !== null) { // SOLO lee lo que es visible en pantalla
                firma += el.innerText.trim().substring(0, 10);
            }
        });
        return firma;
    }

    function fill(manualClick = false) {
        if (estaNavegando && !manualClick) return;

        // --- 0. REINICIO AUTOMÁTICO AL TERMINAR ---
        // Si aparece la página final, da clic en "Enviar otra respuesta" automáticamente
        const linkOtraRespuesta = document.evaluate('//a[contains(translate(text(), "abcdefghijklmnopqrstuvwxyzáéíóú", "ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚ"), "OTRA RESPUESTA")]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (linkOtraRespuesta) {
            linkOtraRespuesta.click();
            return;
        }

        const d = JSON.parse(localStorage.getItem('sv_salud_v7') || '{}');
        let camposEncontrados = false; 

        const items = document.querySelectorAll('div[role="listitem"], div[jsmodel]');
        items.forEach(item => {
            // !!! FILTRO DE VISIBILIDAD !!! (Ignora todo lo que Google Forms oculte de páginas anteriores)
            if (item.offsetParent === null) return; 

            const labelText = item.innerText.toUpperCase();
            const input = item.querySelector('input[type="text"]');
            const inputDate = item.querySelector('input[type="date"]');

            // 1. Cédula
            if (input && (labelText.includes("CÉDULA") || labelText.includes("IDENTIDAD"))) {
                camposEncontrados = true;
                if (d.c && input.value !== d.c) type(input, d.c); // Sobreescribe si es distinto
            } 
            // 2. Nombre
            else if (input && (labelText.includes("NOMBRES") || labelText.includes("TRANSCRIPTOR") || labelText.includes("APELLIDO"))) {
                camposEncontrados = true;
                if (d.n && input.value !== d.n) type(input, d.n);
            }

            // 3. Fecha
            if (inputDate && labelText.includes("FECHA")) {
                camposEncontrados = true;
                const partes = (d.f || "").split(/[-/]/);
                if(partes.length === 3) {
                    const iso = `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
                    if (inputDate.value !== iso) type(inputDate, iso);
                }
            }
        });

        // 4. Radio Buttons (Municipios, Parroquias, Organismos)
        const opciones =[d.m, d.p, d.i];
        opciones.forEach(opt => {
            if (opt) {
                const estado = clickOption(opt);
                if (estado !== 'no_encontrado') camposEncontrados = true;
            }
        });

        // 5. Si en esta página activa encontramos campos válidos, avanzamos
        if (camposEncontrados || manualClick) {
            next();
        }
    }

    function type(el, v) { 
        if (el && v) { 
            el.value = v; 
            el.dispatchEvent(new Event('input', { bubbles: true })); 
            el.dispatchEvent(new Event('change', { bubbles: true })); 
            el.dispatchEvent(new Event('blur', { bubbles: true })); 
        } 
    }

    function clickOption(txt) {
        if (!txt) return 'no_encontrado';
        const t = txt.trim().toUpperCase();
        
        const xpath = `//div[@role="radio" or @role="checkbox"][contains(translate(@data-value, 'abcdefghijklmnopqrstuvwxyzáéíóú', 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚ'), "${t}") or contains(translate(@aria-label, 'abcdefghijklmnopqrstuvwxyzáéíóú', 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚ'), "${t}")]`;
        const iterador = document.evaluate(xpath, document, null, XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
        
        let nodo;
        while ((nodo = iterador.iterateNext())) {
            // Asegurar que solo marcamos opciones VISIBLES en la página actual
            if (nodo.offsetParent !== null) {
                if (nodo.getAttribute('aria-checked') !== 'true') {
                    nodo.click();
                    return 'click_realizado';
                }
                return 'ya_estaba_marcado';
            }
        }
        return 'no_encontrado';
    }

    function next() {
        if (estaNavegando) return;
        estaNavegando = true;

        setTimeout(() => {
            const xpath = '//span[text()="Siguiente" or text()="Enviar"]/ancestor::div[@role="button"]';
            const b = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (b) {
                b.click();
            }
        }, RETRASO_ACCION);
    }

    // --- MOTOR CONSTANTE REPOTENCIADO ---
    setInterval(() => {
        // Mantiene la interfaz viva
        if (!document.getElementById('sv-panel')) {
            montarInterfaz();
        }

        // Detecta cambio dinámico de página (Google Forms SPA)
        let nuevaFirma = getFirmaPagina();
        if (nuevaFirma !== hashPaginaActual) {
            hashPaginaActual = nuevaFirma;
            estaNavegando = false; // ¡Se cambió la página! Liberar el candado al instante
        }
        
        // Auto-Run constante
        if (sessionStorage.getItem('sv_auto_salud') === 'true') {
            fill(false);
        }
    }, 500);

})();
