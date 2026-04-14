// ==UserScript==
// @name         Script Principal
// @version      2.4
// @description  Carga scripts auxiliares desde GitHub usando patrones RegExp sin caché (JSON externo)
// @author       Luis Escalante
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(async function() {
    'use strict';

    const trustedPolicy = window.trustedTypes?.createPolicy('default', {
        createScriptURL: (url) => url
    });

    const loadScript = (scriptUrl) => {
        const script = document.createElement('script');
        script.src = trustedPolicy ? trustedPolicy.createScriptURL(scriptUrl) : scriptUrl;
        script.onload = () => console.log(`Script loaded: ${scriptUrl}`);
        script.onerror = () => console.error(`Error loading script: ${scriptUrl}`);
        document.head.appendChild(script);
    };

    try {
        // Descargar lista desde GitHub sin caché
        const response = await fetch(
            `https://dinfcs.github.io/SISVAN/scriptsList.json?nocache=${Date.now()}`,
            { cache: 'no-store' }
        );
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
