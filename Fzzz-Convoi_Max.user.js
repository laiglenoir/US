// ==UserScript==
// @name         ConvoiMax
// @description  Boutons pour remplir le maximum de pommes ou de matériaux.
// @match        *://*.fourmizzz.fr/commerce.*
// @version      1.0.0
// @updateURL    https://raw.githubusercontent.com/laiglenoir/US/main/Fzzz-Convoi_Max.user.js
// @downloadURL  https://raw.githubusercontent.com/laiglenoir/US/main/Fzzz-Convoi_Max.user.js
// @author       laiglenoir
// @grant        none
// @run-at       document-end
// ==/UserScript==
(function () {
    "use strict";
    function lireNombre(id) {
        const element = document.getElementById(id);
        if (!element) { return 0; } return Number(element.textContent.replace(/[\s\u00a0\u202f]/g, "")) || 0;
    }
    const formulaire = document.querySelector('form[action="commerce.php"]');
    const boutonEnvoi = formulaire?.querySelector('input[name="convoi"]');
    const explication = document.getElementById("explication_convois");
    if (!formulaire || !boutonEnvoi || !explication) {
        return;
    }
    const niveau = explication.textContent.match(/(?:étable niveau|level)\s+(\d+)/i);
    if (!niveau) {
        console.warn("ConvoiMax : niveau d'étable introuvable.");
        return;
    }
    const etable = Number(niveau[1]);
    const capaciteParOuvriere = 10 + etable / 2;
    const champs = {
        nourriture: document.getElementById("input_nbNourriture"),
        materiaux: document.getElementById("input_nbMateriaux"),
        ouvrieres: document.getElementById("input_nbOuvriere"),
        valeurNourriture: document.getElementById("nbNourriture"),
        valeurMateriaux: document.getElementById("nbMateriaux"),
        valeurOuvrieres: document.getElementById("nbOuvriere")
    };
    if (Object.values(champs).some(champ => !champ)) {
        return;
    }
    function definir(champ, valeur) {
        champ.value = valeur;
        champ.dispatchEvent(new Event("input", { bubbles: true }));
        champ.dispatchEvent(new Event("change", { bubbles: true }));
    }
    function vider() { Object.values(champs).forEach(function (champ) { definir(champ, ""); }); }
    function remplir(type) {
        vider();
        const ouvrieres = lireNombre("nb_ouvrieres");
        const tdc = lireNombre("quantite_tdc");
        const disponibles = Math.max(0, ouvrieres - tdc);
        const stock = lireNombre(type === "nourriture" ? "nb_nourriture" : "nb_materiaux");
        const maximum = Math.floor(Math.min(Math.floor(disponibles * capaciteParOuvriere), stock));
        const necessaires = Math.ceil(maximum / capaciteParOuvriere);
        const champCache = type === "nourriture" ? champs.valeurNourriture : champs.valeurMateriaux;
        definir(champs[type], String(maximum));
        definir(champCache, String(maximum));
        definir(champs.ouvrieres, String(necessaires));
        definir(champs.valeurOuvrieres, String(necessaires));
    }
    const conteneur = document.createElement("div");
    conteneur.style.cssText = "display:flex;justify-content:center;gap:10px;margin:0 0 12px";
    function creerBouton(texte, type) {
        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.textContent = texte;
        bouton.style.cssText = "cursor:pointer;padding:6px 12px;border-radius:6px";
        bouton.addEventListener("click", function () {
            remplir(type);
        });
        return bouton;
    }
    conteneur.appendChild(creerBouton("Max pommes", "nourriture"));
    conteneur.appendChild(creerBouton("Max matériaux", "materiaux"));
    boutonEnvoi.parentNode.insertBefore(conteneur, boutonEnvoi);
})();
