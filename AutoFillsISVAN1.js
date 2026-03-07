// ==UserScript==
// @name         AutoFill SISVAN - Premium Edition v6.5
// @namespace    http://tampermonkey.net/
// @version      6.5
// @description  Interfaz elegante a la izquierda, sin retraso y ultra precisa.
// @author       User
// @match        https://docs.google.com/forms/d/e/1FAIpQLSeERJOjmc-5ubYtuxSk7xD1IHKGRl_jfGNHbM3JB1KqaZ9ISw/*
// @match        https://docs.google.com/forms/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const RETRASO_ACCION = 600;

    // Estilos Premium
    const CSS_PREMIUM = `
        #sv-panel {
            position: fixed; top: 15px; left: 15px; width: 310px;
            background: rgba(255, 255, 255, 0.98);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.15);
            z-index: 100000;
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            border: 1px solid rgba(26, 115, 232, 0.2);
            transition: all 0.3s ease;
        }
        .sv-head {
            background: linear-gradient(135deg, #1a73e8, #1557b0);
            color: white; padding: 14px;
            font-weight: 600; text-align: center;
            border-radius: 16px 16px 0 0;
            font-size: 15px; letter-spacing: 0.5px;
        }
        .sv-main { padding: 15px; max-height: 82vh; overflow-y: auto; }
        .sv-tag { display: block; font-size: 10px; color: #70757a; font-weight: 700; margin: 8px 0 3px; text-transform: uppercase; }
        .sv-field {
            width: 100%; padding: 9px 12px; border: 1px solid #dee2e6; border-radius: 8px;
            font-size: 13px; margin-bottom: 6px; box-sizing: border-box;
            transition: border-color 0.2s; background: #f8f9fa;
        }
        .sv-field:focus { border-color: #1a73e8; outline: none; background: #fff; box-shadow: 0 0 0 3px rgba(26,115,232,0.1); }
        .sv-action-btn {
            width: 100%; padding: 11px; border: none; border-radius: 10px;
            cursor: pointer; font-weight: 600; font-size: 13px; margin-top: 10px;
            transition: transform 0.1s, background 0.2s;
        }
        .sv-action-btn:active { transform: scale(0.98); }
        .btn-prime { background: #1a73e8; color: white; }
        .btn-prime:hover { background: #1557b0; }
        .btn-status { background: #f1f3f4; color: #3c4043; border: 1px solid #dadce0; }
        .btn-status.on { background: #e6f4ea; color: #137333; border-color: #ceead6; }
        .sv-q-paste { background: #fffde7; border: 1px dashed #fbc02d; margin-bottom: 12px; }
        .sv-sep { height: 1px; background: #eee; margin: 12px 0; position: relative; }
        .sv-sep::after { content: "DATOS BENEFICIARIO"; position: absolute; top: -6px; left: 50%; transform: translateX(-50%); background: white; padding: 0 8px; font-size: 8px; color: #aaa; }
    `;

    function crearEl(tag, props = {}, style = {}) {
        const el = document.createElement(tag);
        Object.assign(el, props);
        Object.assign(el.style, style);
        return el;
    }

    function montarInterfaz() {
        if (document.getElementById('sv-panel') || !document.body) return;

        const styleSheet = document.createElement("style");
        styleSheet.textContent = CSS_PREMIUM;
        document.head.appendChild(styleSheet);

        const win = crearEl('div', { id: 'sv-panel' });
        const head = crearEl('div', { className: 'sv-head', textContent: 'SISVAN Intelligence v6.5' });
        const main = crearEl('div', { className: 'sv-main' });

        const config = [
            { id: 'q', label: '⚡ Pegado Inteligente', class: 'sv-q-paste', ph: 'Pega la fila de Excel aquí...' },
            { id: 'n', label: '👤 Transcriptor', ph: 'Nombre' },
            { id: 'c', label: '🆔 Cédula', ph: 'Cédula' },
            { id: 'ct', label: '📂 Categoría', ph: 'Categoría' },
            { id: 'f', label: '📅 Fecha', ph: 'DD/MM/AAAA' },
            { id: 'm', label: '📍 Municipio', ph: 'Municipio' },
            { id: 'p', label: '🏘 Parroquia', ph: 'Parroquia' },
            { id: 'i', label: '🏫 Institución', ph: 'Institución' },
            { id: 's', label: '🏠 Sector', ph: 'Sector Comunitario' },
            { id: 'cr', label: '🌀 Circuito', ph: 'Circuito Comunal' },
            { id: 'cm', label: '🚩 Comuna', ph: 'Nombre Comuna' }
        ];

        config.forEach(item => {
            if(item.id === 's') main.appendChild(crearEl('div', {className: 'sv-sep'}));
            const label = crearEl('label', { className: 'sv-tag', textContent: item.label });
            const input = crearEl('input', { id: 'sv-in-' + item.id, className: 'sv-field ' + (item.class || ''), placeholder: item.ph, type: 'text', autocomplete: 'off' });
            main.append(label, input);
        });

        const run = crearEl('button', { id: 'sv-run', className: 'sv-action-btn btn-prime', textContent: 'RELLENAR FORMULARIO' });
        const auto = crearEl('button', { id: 'sv-auto', className: 'sv-action-btn btn-status', textContent: 'AUTO-CARGA: OFF' });

        main.append(run, auto);
        win.append(head, main);
        document.body.appendChild(win);

        setupLogic();
    }

    function setupLogic() {
        const saved = JSON.parse(localStorage.getItem('sv_pro_v65') || '{}');
        const ids = ['n', 'c', 'ct', 'f', 'm', 'p', 'i', 's', 'cr', 'cm'];

        ids.forEach(id => {
            const el = document.getElementById('sv-in-' + id);
            if (saved[id]) el.value = saved[id];
            el.addEventListener('input', save);
        });

        document.getElementById('sv-in-q').addEventListener('input', (e) => {
            const val = e.target.value.split(',').map(s => s.trim());
            if (val.length >= 7) {
                const map = ['n', 'c', 'ct', 'f', 'm', 'p', 'i', 's', 'cr', 'cm'];
                map.forEach((key, i) => { if(val[i]) document.getElementById('sv-in-' + key).value = val[i]; });
                e.target.value = ""; save();
            }
        });

        document.getElementById('sv-run').addEventListener('click', fill);

        const btnAuto = document.getElementById('sv-auto');
        let isAuto = sessionStorage.getItem('sv_auto_pro') === 'true';

        const updateAuto = () => {
            if (isAuto) {
                btnAuto.textContent = "AUTO-CARGA: ON";
                btnAuto.classList.add('on');
                fill();
            } else {
                btnAuto.textContent = "AUTO-CARGA: OFF";
                btnAuto.classList.remove('on');
            }
        };

        btnAuto.addEventListener('click', () => {
            isAuto = !isAuto;
            sessionStorage.setItem('sv_auto_pro', isAuto);
            updateAuto();
        });
        updateAuto();
    }

    function save() {
        const d = {};
        ['n', 'c', 'ct', 'f', 'm', 'p', 'i', 's', 'cr', 'cm'].forEach(id => d[id] = document.getElementById('sv-in-' + id).value);
        localStorage.setItem('sv_pro_v65', JSON.stringify(d));
    }

    function fill() {
        const d = JSON.parse(localStorage.getItem('sv_pro_v65') || '{}');
        if (!d.n) return;

        // Detección de Inputs por aria-labelledby (Como solicitaste)
        const in_1_4 = document.querySelector('input[aria-labelledby="i1 i4"]');
        const in_6_9 = document.querySelector('input[aria-labelledby="i6 i9"]');
        const in_11_14 = document.querySelector('input[aria-labelledby="i11 i14"]');
        const in_date = document.querySelector('input[type="date"]');

        // LÓGICA DE PÁGINA DEL BENEFICIARIO (Sector, Circuito, Comuna)
        if (in_11_14) {
            type(in_1_4, d.s);    // Sector
            type(in_6_9, d.cr);   // Circuito
            type(in_11_14, d.cm); // Comuna
            next(); return;
        }

        // LÓGICA PÁGINA 1 (Nombre, Cédula, Categoría)
        if (in_1_4 && document.querySelector('div[role="radio"]')) {
            type(in_1_4, d.n);
            type(in_6_9, d.c);
            click(d.ct);
            next(); return;
        }

        // LÓGICA PÁGINA 2 (Fecha, Municipio)
        if (in_date) {
            const iso = d.f.split(/[-/]/);
            if(iso.length === 3) type(in_date, `${iso[2]}-${iso[1].padStart(2, '0')}-${iso[0].padStart(2, '0')}`);
            click(d.m);
            next(); return;
        }

        // LÓGICA RADIOS SUELTOS (Parroquia o Institución)
        if (document.querySelector('div[role="radio"]')) {
            if (click(d.i) || click(d.p)) next();
        }
    }

    function type(el, v) { if (el && v) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } }

    function click(txt) {
        if (!txt) return false;
        const t = txt.trim().toUpperCase();
        const xpath = `//div[@role="radio" or @role="checkbox"]//span[contains(translate(text(), 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), "${t}")] | //div[@aria-label[contains(translate(., 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), "${t}")]]`;
        const res = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (res) {
            res.click();
            const p = res.closest('div[role="radio"]');
            if (p) p.click();
            return true;
        }
        return false;
    }

    function next() {
        setTimeout(() => {
            const b = document.evaluate('//span[text()="Siguiente" or text()="Enviar"]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (b) b.click();
        }, RETRASO_ACCION);
    }

    // Inicialización inmediata
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        montarInterfaz();
    } else {
        window.addEventListener('DOMContentLoaded', montarInterfaz);
    }
    // Backup por si el DOM tarda mucho
    setTimeout(montarInterfaz, 500);

})();
