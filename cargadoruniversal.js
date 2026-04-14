// ==UserScript==
// @name         Script Principal
// @version      2.0
// @description  Define y carga scripts auxiliares desde GitHub
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
        // Descargar lista desde GitHub
        const response = await fetch('https://dinfcs.github.io/SISVAN/scriptsList.js');
        const scripts = await response.json();

        scripts
            .filter(({ urlPattern }) => new RegExp(urlPattern).test(window.location.href))
            .forEach(({ scriptUrl }) => loadScript(scriptUrl));

        // Ya no se carga UniversalAE.js
    } catch (error) {
        console.error('Error loading scripts:', error);
    }
})();
