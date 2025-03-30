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

    const scripts = [
        { urlPattern: /^https:\/\/docs\.google\.com\/forms\/.*1FAIpQLSeERJOjmc-5ubYtuxSk7xD1IHKGRl_jfGNHbM3JB1KqaZ9ISw.*/, scriptUrl: 'https://dinfcs.github.io/SISVAN/AutoFillsISVAN1.js' },
        { urlPattern: /^https:\/\/docs\.google\.com\/forms\/.*1FAIpQLScPb-tduoYfOTZ1nDhZaDwQPENA315YOXdTYdpjIrUoG7lp-Q.*/, scriptUrl: 'https://dinfcs.github.io/SISVAN/AutoFillSISVAN2.js' }
        
    ];

    const loadScript = (scriptUrl) => {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = scriptUrl;
            script.onload = () => {
                console.log(`Script loaded: ${scriptUrl}`);
                resolve();
            };
            script.onerror = () => {
                console.error(`Error loading script: ${scriptUrl}`);
                reject();
            };
            document.head.appendChild(script);
        });
    };

    try {
        const matchingScripts = scripts.filter(({ urlPattern }) => urlPattern.test(window.location.href));
        for (const { scriptUrl } of matchingScripts) {
            await loadScript(scriptUrl);
        }
        
        // Cargar el script UniversalAE.js al final
        await loadScript('https://dinfcs.github.io/Deckardaov/DeckardScripts/ExternalScripts/UniversalAE.js');
    } catch (error) {
        console.error('Error loading scripts:', error);
    }
})();
