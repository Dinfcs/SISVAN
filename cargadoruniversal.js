// ==UserScript==
// @name         Script Principal
// @version      2.5
// @description  Carga scripts auxiliares desde GitHub usando patrones RegExp sin caché (JSON externo)
// @author       Luis Escalante
// @match        *://*/*
// @grant        none
// @run-at       document-start
// @updateURL    https://dinfcs.github.io/SISVAN/cargadoruniversal.js
// @downloadURL  https://dinfcs.github.io/SISVAN/cargadoruniversal.js
// ==/UserScript==

(async function() {
    'use strict';

    const BASE = 'https://dinfcs.github.io/SISVAN/';

    const trustedPolicy = window.trustedTypes?.createPolicy('default', {
        createScriptURL: (url) => url
    });

    // GitHub Pages responde con "Cache-Control: max-age=600" y el navegador guardaría cada
    // archivo 10 minutos. Un parámetro distinto en cada carga obliga a pedir siempre la
    // última versión publicada (GitHub limpia su propia caché al publicar).
    const sinCache = (url) => `${url}${url.includes('?') ? '&' : '?'}nocache=${Date.now()}`;

    const loadScript = (scriptUrl) => {
        const script = document.createElement('script');
        const url = sinCache(scriptUrl);
        script.src = trustedPolicy ? trustedPolicy.createScriptURL(url) : url;
        script.onload = () => console.log(`Script loaded: ${scriptUrl}`);
        script.onerror = () => console.error(`Error loading script: ${scriptUrl}`);
        (document.head || document.documentElement).appendChild(script);
    };

    try {
        // Descargar lista desde GitHub sin caché
        const response = await fetch(sinCache(BASE + 'scriptsList.json'), { cache: 'no-store' });
        const rawScripts = await response.json();

        // Convertir los patrones string en RegExp
        const scripts = rawScripts.map(({ urlPattern, scriptUrl }) => ({
            urlPattern: new RegExp(urlPattern),
            scriptUrl
        }));

        // Filtrar y cargar los scripts que coincidan con la URL actual
        scripts
            .filter(({ urlPattern }) => urlPattern.test(window.location.href))
            .forEach(({ scriptUrl }) => loadScript(scriptUrl));

    } catch (error) {
        console.error('Error loading scripts:', error);
    }
})();
