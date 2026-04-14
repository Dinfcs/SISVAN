// ==UserScript==
// @name         AutoFill SISVAN - Edición Salud Bolívar v7.0
// @namespace    http://tampermonkey.net/
// @version      7.0
// @description  Adaptado para SISVAN BOLÍVAR (Transcriptor, Fecha, Municipio, Parroquia, Organismo)
// @author       User
// @match        https://docs.google.com/forms/d/e/1FAIpQLSeW5L6vfgcBXbZTs2K3gVuyioFlD0SsgmL2um4n7Lf4bOinCw/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const RETRASO_ACCION = 800; // Milisegundos entre acciones

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
            background: #fff; transition: all 0.2s;
        }
        .sv-field:focus { border-color: #1a73e8; outline: none; box-shadow: 0 0 0 3px rgba(26,115,232,0.1); }
        
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
            content: "UBICACIÓN Y SALUD"; position: absolute; top: -6px; left: 50%; 
            transform: translateX(-50%); background: white; padding: 0 8px; 
            font-size: 8px; color: #aaa; letter-spacing: 1px; 
        }
    `;

    function crearEl(tag, props = {}) {
        const el = document.createElement(tag);
        Object.assign(el, props);
        return el;
    }

    function montarInterfaz() {
        if (document.getElementById('sv-panel') || !document.body) return;

        const styleSheet = document.createElement("style");
        styleSheet.textContent = CSS_PREMIUM;
        document.head.appendChild(styleSheet);

        const win = crearEl('div', { id: 'sv-panel' });
        const head = crearEl('div', { className: 'sv-head-btns' });
        const main = crearEl('div', { className: 'sv-main' });

        const runBtn = crearEl('button', { id: 'sv-run', className: 'sv-btn-top btn-fill', textContent: 'RELLENAR' });
        const autoBtn = crearEl('button', { id: 'sv-auto', className: 'sv-btn-top btn-auto', textContent: 'AUTO: OFF' });
        const minBtn = crearEl('button', { id: 'sv-min', className: 'sv-btn-top btn-min', textContent: '—' });
        
        head.append(runBtn, autoBtn, minBtn);

        const config = [
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

        setupLogic(win, minBtn);
    }

    function setupLogic(win, minBtn) {
        const saved = JSON.parse(localStorage.getItem('sv_salud_v7') || '{}');
        const ids = ['n', 'c', 'f', 'm', 'p', 'i'];
        
        ids.forEach(id => {
            const el = document.getElementById('sv-in-' + id);
            if (saved[id]) el.value = saved[id];
            el.addEventListener('input', save);
        });

        minBtn.addEventListener('click', () => {
            const isMin = win.classList.toggle('minimized');
            minBtn.textContent = isMin ? '▢' : '—';
            sessionStorage.setItem('sv_minimized', isMin);
        });

        document.getElementById('sv-run').addEventListener('click', fill);

        const autoBtn = document.getElementById('sv-auto');
        let isAuto = sessionStorage.getItem('sv_auto_salud') === 'true';

        const updateAuto = () => {
            if (isAuto) {
                autoBtn.textContent = "AUTO: ON";
                autoBtn.classList.add('on');
                fill();
            } else {
                autoBtn.textContent = "AUTO: OFF";
                autoBtn.classList.remove('on');
            }
        };

        autoBtn.addEventListener('click', () => {
            isAuto = !isAuto;
            sessionStorage.setItem('sv_auto_salud', isAuto);
            updateAuto();
        });
        updateAuto();
    }

    function save() {
        const d = {};
        ['n', 'c', 'f', 'm', 'p', 'i'].forEach(id => d[id] = document.getElementById('sv-in-' + id).value);
        localStorage.setItem('sv_salud_v7', JSON.stringify(d));
    }

    function fill() {
        const d = JSON.parse(localStorage.getItem('sv_salud_v7') || '{}');
        let accionRealizada = false;

        // 1. Manejo de Text Inputs (Nombre y Cédula)
        const inputsText = document.querySelectorAll('input[type="text"]:not(.sv-field)');
        inputsText.forEach(input => {
            const container = input.closest('div[role="listitem"], div[jsmodel]');
            if (!container) return;
            const text = container.innerText.toUpperCase();

            if (text.includes("NOMBRES") || text.includes("TRANSCRIPTOR")) {
                type(input, d.n); accionRealizada = true;
            }
            if (text.includes("CÉDULA") || text.includes("IDENTIDAD")) {
                type(input, d.c); accionRealizada = true;
            }
        });

        // 2. Manejo de Fecha
        const inputDate = document.querySelector('input[type="date"]');
        if (inputDate && d.f) {
            const partes = d.f.split(/[-/]/);
            if(partes.length === 3) {
                // Formato DD/MM/AAAA a AAAA-MM-DD
                const iso = `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
                type(inputDate, iso);
                accionRealizada = true;
            }
        }

        // 3. Manejo de Opciones (Radio Buttons) para Municipio, Parroquia, Institución
        const opciones = [d.m, d.p, d.i];
        opciones.forEach(opt => {
            if (opt && clickOption(opt)) accionRealizada = true;
        });

        // 4. Botón Siguiente / Enviar
        if (accionRealizada) next();
    }

    function type(el, v) { 
        if (el && v && el.value !== v) { 
            el.value = v; 
            el.dispatchEvent(new Event('input', { bubbles: true })); 
            el.dispatchEvent(new Event('change', { bubbles: true })); 
            el.dispatchEvent(new Event('blur', { bubbles: true }));
        } 
    }

    function clickOption(txt) {
        if (!txt) return false;
        const t = txt.trim().toUpperCase();
        // Busca el texto dentro de spans que están dentro de roles de radio o checkbox
        const xpath = `//div[@role="radio" or @role="checkbox"]//span[contains(translate(text(), 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), "${t}")]`;
        const res = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        
        if (res) {
            const parent = res.closest('div[role="radio"], div[role="checkbox"]');
            if (parent && parent.getAttribute('aria-checked') !== 'true') {
                parent.click();
                return true;
            }
        }
        return false;
    }

    function next() {
        setTimeout(() => {
            const b = document.evaluate('//span[text()="Siguiente" or text()="Enviar" or text()="Siguiente"]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (b) b.click();
        }, RETRASO_ACCION);
    }

    // Inicialización segura
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        montarInterfaz();
    } else {
        window.addEventListener('DOMContentLoaded', montarInterfaz);
    }
    setTimeout(montarInterfaz, 500);

})();
