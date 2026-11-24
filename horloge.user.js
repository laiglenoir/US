// ==UserScript==
// @name         Fourmizzz - Horloge
// @namespace    fourmizzz
// @version      2.0
// @updateURL    https://raw.githubusercontent.com/laiglenoir/US/main/horloge.user.js
// @downloadURL  https://raw.githubusercontent.com/laiglenoir/US/main/horloge.user.js
// @description  Horloge avec secondes sous le bandeau
// @match        *://*.fourmizzz.fr/*
// @grant        none
// @run-at       document-end
// ==/UserScript==
(function () {
    'use strict';
    const ID = 'fz-clock';
    if (document.getElementById(ID)) return;
    const clock = document.createElement('div');
    clock.id = ID;
    clock.style.cssText = `
        position: fixed;
        top: 95px;
        right: 8px;
        z-index: 999999;
        color: black;
        background: transparent;
        font-family: Arial, sans-serif;
        font-size: 14px;
        font-weight: bold;
        text-align: right;
        pointer-events: none;
        padding: 3px;
    `;
    document.body.appendChild(clock);
    function update() {
        const d = new Date();
        clock.textContent =
            [d.getHours(), d.getMinutes(), d.getSeconds()]
            .map(n => String(n).padStart(2, '0'))
            .join(':');
    }
    update();
    setInterval(update, 250);
})();
