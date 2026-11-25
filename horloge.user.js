// ==UserScript==
// @name         Fourmizzz - Horloge
// @namespace    fourmizzz
// @version      2.4
// @updateURL    https://raw.githubusercontent.com/laiglenoir/US/main/horloge.user.js
// @downloadURL  https://raw.githubusercontent.com/laiglenoir/US/main/horloge.user.js
// @description  Horloge avec secondes sous le bandeau
// @match        *://*.fourmizzz.fr/*
// @grant        none
// @run-at       document-end
// ==/UserScript==
(function () {
    'use strict';
    if (window.top !== window.self) return;
    const ID = 'fz-clock';
    if (document.getElementById(ID)) return;
    const FALLBACK_TOP = 95;
    const GAP_TOP = 2;
    const GAP_RIGHT = 22;
    const clock = document.createElement('div');
    clock.id = ID;
    clock.style.cssText = `
        position: fixed;
        top: ${FALLBACK_TOP}px;
        right: clamp(4px, 1vw, 12px);
        z-index: 999999;
        font-family: Arial, sans-serif;
        font-size: clamp(12px, 1.5vw, 14px);
        font-weight: bold;
        text-align: right;
        white-space: nowrap;
        pointer-events: none;
        padding: 2px 3px;
        background: #454737;
        color: #ffffff;
        border-radius: 5px;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
    `;
    document.body.appendChild(clock);
    function place() {
        const banner = document.getElementById('menu');
        const centre = document.getElementById('centre');
        const droite = document.getElementById('droite');
        const largeur = document.documentElement.clientWidth;
        // Positionnement vertical.
        if (banner) {
            const r = banner.getBoundingClientRect();
            clock.style.top = Math.max(0, r.bottom) + GAP_TOP + 'px';
        } else {
            clock.style.top = FALLBACK_TOP + 'px';
        }
        // Positionnement horizontal.
        if (droite && droite.getBoundingClientRect().width > 0) {
            const r = droite.getBoundingClientRect();
            clock.style.right = Math.max(0, largeur - r.left) + GAP_RIGHT + 'px';
        } else if (centre) {
            const r = centre.getBoundingClientRect();
            clock.style.right = Math.max(0, largeur - r.right) + GAP_RIGHT + 'px';
        } else {
            clock.style.right = GAP_RIGHT + 'px';
        }
    }
    function update() {
        const d = new Date();
        clock.textContent =
            [d.getHours(), d.getMinutes(), d.getSeconds()]
            .map(n => String(n).padStart(2, '0'))
            .join(':');
    }
    update();
    place();
    setInterval(update, 250);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, { passive: true });
    window.addEventListener('load', place);
    setTimeout(place, 1000);
})();
