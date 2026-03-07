// ==UserScript==
// @name         Script Principal
// @version      1.9
// @description  Define y carga scripts auxiliares según la URL
// @author       Luis Escalante
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(async function() {
    'use strict';

    // Crear una política de Trusted Types
    const trustedPolicy = window.trustedTypes?.createPolicy('default', {
        createScriptURL: (url) => url
    });

    const scripts = [
        { urlPattern: /1FAIpQLSeERJOjmc-5ubYtuxSk7xD1IHKGRl_jfGNHbM3JB1KqaZ9ISw/, scriptUrl: 'https://dinfcs.github.io/SISVAN/AutoFillsISVAN1.js' },
        { urlPattern: /1FAIpQLScPb-tduoYfOTZ1nDhZaDwQPENA315YOXdTYdpjIrUoG7lp-Q/, scriptUrl: 'https://dinfcs.github.io/SISVAN/AutoFillSISVAN2.js' }
    ];

    const loadScript = (scriptUrl) => {
        const script = document.createElement('script');
        script.src = trustedPolicy ? trustedPolicy.createScriptURL(scriptUrl) : scriptUrl;
        script.onload = () => console.log(`Script loaded: ${scriptUrl}`);
        script.onerror = () => console.error(`Error loading script: ${scriptUrl}`);
        document.head.appendChild(script);
    };

    try {
        scripts
            .filter(({ urlPattern }) => urlPattern.test(window.location.href))
            .forEach(({ scriptUrl }) => loadScript(scriptUrl));

        // Cargar el script UniversalAE.js al final
        loadScript('https://dinfcs.github.io/Deckardaov/DeckardScripts/ExternalScripts/UniversalAE.js');
    } catch (error) {
        console.error('Error loading scripts:', error);
    }
})();
