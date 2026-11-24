// ==UserScript==
// @name         Fourmizzz - Outils unifiés
// @namespace    fourmizzz-outils-reunis
// @version      1.0.4
// @updateURL    https://raw.githubusercontent.com/laiglenoir/US/main/Fzzz-Outils.js
// @downloadURL  https://raw.githubusercontent.com/laiglenoir/US/main/Fzzz-Outils.js
// @description  Analyse RC avec bilan TDP automatique, Bilan TdC, Chasseurs, ConvoiMax.
// @match        *://*.fourmizzz.fr/*
// @run-at       document-end
// @noframes
// @grant        none
// ==/UserScript==
(function () {
    "use strict";
    class Commun {
        static NOMS = Object.freeze(['Jeune Soldate Naine', 'Soldate Naine', 'Naine d’Elite', 'Jeune Soldate', 'Soldate', 'Concierge', 'Concierge d’élite', 'Artilleuse', 'Artilleuse d’élite', 'Soldate d’élite', 'Tank', 'Tank d’élite', 'Tueuse', 'Tueuse d’élite']);
        static ALIAS = Object.freeze([
            ['jeune soldate naine', 'jeunes soldates naines', 'jsn'], ['soldate naine', 'soldates naines', 'sn'], ["naine d'elite", "naines d'elite", 'ne'],
            ['jeune soldate', 'jeunes soldates', 'js'], ['soldate', 'soldates', 's'], ['concierge', 'concierges', 'c'],
            ["concierge d'elite", "concierges d'elite", 'ce'], ['artilleuse', 'artilleuses', 'a'], ["artilleuse d'elite", "artilleuses d'elite", 'ae'],
            ["soldate d'elite", "soldates d'elite", 'se'], ['tank', 'tanks', 'tk'], ["tank d'elite", "tanks d'elite", 'tke'],
            ['tueuse', 'tueuses', 'tu'], ["tueuse d'elite", "tueuses d'elite", 'tue']
        ]);
        static fmt(n) { return Number.isFinite(n) ? Math.round(n).toLocaleString('fr-FR') : '—'; }
        static somme(a) { return a.reduce((s, v) => s + v, 0); }
        static norm(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim(); }
        static echapper(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])); }
        static indexUnite(libelle) {
            const s = this.norm(libelle).replace(/\.$/, '').replace(/d'\s*elites\b/g, "d'elite");
            return this.ALIAS.flatMap((items, i) => items.map((a) => ({a, i}))).find((x) => x.a === s)?.i ?? -1;
        }
        static armee(texte) {
            const resultat = Array(14).fill(0), inconnues = [];
            for (const morceau of texte.replace(/\.$/, '').split(/\s*,\s*/)) {
                const m = morceau.trim().match(/^([\d\s\u00a0\u202f]+)\s+(.+)$/);
                if (!m) { if (morceau.trim()) inconnues.push(morceau.trim()); continue; }
                const i = this.indexUnite(m[2]);
                if (i < 0) inconnues.push(morceau.trim()); else resultat[i] += this.nombre(m[1]);
            }
            return {unites: resultat, inconnues};
        }
        static retirerPerte(unites, pertes) {
            const a = unites.slice(), retires = Array(a.length).fill(0);
            let reste = pertes;
            for (let i = 0; i < a.length && reste > 0; i++) {
                const n = Math.min(a[i], reste);
                a[i] -= n; retires[i] = n; reste -= n;
            }
            return {unites: a, retires, excedent: reste};
        }
        static nettoyer(texte) {
            let s = String(texte || '');
            if (/<(?:br|div|p|td|tr|table|span|a)\b/i.test(s)) {
                const doc = new DOMParser().parseFromString(s, 'text/html');
                doc.querySelectorAll('br').forEach((e) => e.replaceWith('\n'));
                doc.querySelectorAll('tr,p,div').forEach((e) => e.append('\n'));
                s = doc.body.textContent || '';
            }
            return s.replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1').replace(/\*\*/g, '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/\r/g, '\n').replace(/[\u00a0\u202f]/g, ' ');
        }
        static lireDate(texte) {
            const re = /(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})[^\d]{0,12}?(\d{1,2})\s*[h:]\s*(\d{2})/g;
            let m, dernier = null;
            while ((m = re.exec(String(texte || '')))) dernier = m;
            if (!dernier) return null;
            const annee = Number(dernier[3]) < 100 ? 2000 + Number(dernier[3]) : Number(dernier[3]);
            const [jour, mois, heure, minute] = [dernier[1], dernier[2], dernier[4], dernier[5]].map(Number);
            const ms = Date.UTC(annee, mois - 1, jour, heure, minute);
            const d = new Date(ms);
            if (d.getUTCFullYear() !== annee || d.getUTCMonth() !== mois - 1 || d.getUTCDate() !== jour || d.getUTCHours() !== heure || d.getUTCMinutes() !== minute) return null;
            return {ms, texte: `${String(jour).padStart(2, '0')}/${String(mois).padStart(2, '0')}/${annee} ${String(heure).padStart(2, '0')}:${String(minute).padStart(2, '0')}`};
        }
        static UNITES = Object.freeze({
            VIE: Object.freeze([8, 10, 13, 16, 20, 30, 40, 10, 12, 27, 35, 50, 50, 55]),
            ATT: Object.freeze([3, 5, 7, 10, 15, 1, 1, 30, 35, 24, 55, 80, 50, 55]),
            DEF: Object.freeze([2, 4, 6, 9, 14, 25, 35, 15, 18, 23, 1, 1, 50, 55]),
            TEMPS: Object.freeze([300, 450, 570, 740, 1000, 1410, 1410, 1440, 1520, 1450, 1860, 1860, 2740, 2740]),
            COUT: Object.freeze([16, 20, 26, 30, 36, 70, 100, 30, 34, 44, 100, 150, 80, 90])
        });
        static nombre(texte) {
            return parseInt(String(texte ?? '').replace(/\D/g, ''), 10) || 0;
        }
        static sommeStat(unites, coefficients) {
            return unites.reduce((total, effectif, index) => total + effectif * coefficients[index], 0);
        }
        static pseudo = '';
        static alliance = '';
        static initialiser() {
            this.pseudo = $('#pseudo').text().trim();
            this.alliance = $('#tag_alliance').text().trim();
        }
        static get comptePlus() {
            return $("#menuComptePlus a.boutonStatJoueur").length && $("#menuComptePlus a.boutonStatJoueur").text() == "Stat" ? true : false;
        }
    }
    class MenuOutils {
        static elements = new Map();
        static observateur = null;
        static icones = {
            fz_boutonAnalyseRC: `
                <svg xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 640 640"><!--!Font Awesome Free 7.3.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.-->
                <path d="M208.5 192C243.8 192 272.5 163.3 272.5 128C272.5 92.7 243.8 64 208.5 64C173.2 64 144.5 92.7 144.5 128C144.5 163.3 173.2 192 208.5 192zM192.5 544L192.5 448L224.5 448L224.5 544C224.5 561.7 238.8 576 256.5 576C274.2 576 288.5 561.7 288.5 544L288.5 351.8L309.4 385C318.8 400 338.6 404.4 353.5 395C368.4 385.6 372.9 365.8 363.5 350.9L323.6 287.6C298.8 248 255.3 224 208.5 224C161.7 224 118.2 248 93.3 287.6L53.4 351C44 366 48.5 385.7 63.4 395.1C78.3 404.5 98.1 400 107.5 385.1L128.4 351.9L128.4 544.1C128.4 561.8 142.7 576.1 160.4 576.1C178.1 576.1 192.4 561.8 192.4 544.1zM480.5 64L448.5 64C439.7 64 432.5 71.2 432.5 80C432.5 88.8 439.7 96 448.5 96L448.5 196.3C438.9 201.8 432.5 212.2 432.5 224L432.5 256C414.8 256 400.5 270.3 400.5 288L400.5 432C400.5 449.7 414.8 464 432.5 464L448.5 464L448.5 560C448.5 568.8 455.7 576 464.5 576L524 576C534.4 576 542 566.2 539.5 556.1L516.5 464L560.5 464C569.3 464 576.5 456.8 576.5 448L576.5 432C576.5 423.2 569.3 416 560.5 416L512.5 416L512.5 389.3L565.6 371.6C572.1 369.4 576.5 363.3 576.5 356.4L576.5 271.9C576.5 263.1 569.3 255.9 560.5 255.9L544.5 255.9C535.7 255.9 528.5 263.1 528.5 271.9L528.5 327.9L512.5 333.2L512.5 223.9C512.5 212.1 506.1 201.7 496.5 196.2L496.5 79.9C496.5 71.1 489.3 63.9 480.5 63.9z"/></svg>
            `,    
            fz_boutonBilanTdC: `
                <path d="m12.99 6.74 1.93 3.44"/>
                <path d="M19.136 12a10 10 0 0 1-14.271 0"/>
                <path d="m21 21-2.16-3.84"/>
                <path d="m3 21 8.02-14.26"/>
                <circle cx="12" cy="5" r="2"/>
            `,
            fz_boutonChasseurs: `
                <svg xmlns="http://www.w3.org/2000/svg"
                    width="24" height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                    class="icon icon-tabler icons-tabler-outline icon-tabler-bow">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                    <path d="M17 3h4v4" />
                    <path d="M21 3l-15 15" />
                    <path d="M3 18h3v3" />
                    <path d="M16.5 20c1.576 -1.576 2.5 -4.095 2.5 -6.5c0 -4.81 -3.69 -8.5 -8.5 -8.5c-2.415 0 -4.922 .913 -6.5 2.5l12.5 12.5" />
                </svg>
            `,
        };
        static icone(id, modele) {
            const dessin = this.icones[id];
            const span = document.createElement('span');
            if (!dessin) return span;
            const svg = dessin.trim().startsWith('<svg')
                ? dessin.trim()
                : '<svg xmlns="http://www.w3.org/2000/svg" ' +
                    'viewBox="0 0 24 24" fill="black" ' +
                    'stroke="black" stroke-width="2" ' +
                    'stroke-linecap="round" stroke-linejoin="round">' +
                    dessin + '</svg>';
            const url = 'data:image/svg+xml;utf8,' +
                encodeURIComponent(svg);
            span.style.cssText =
                'background:#fff!important;' +
                '-webkit-mask:url("' + url + '") center/contain no-repeat;' +
                'mask:url("' + url + '") center/contain no-repeat;' +
                'min-width:18px;min-height:18px;';
            span.style.setProperty(
                'background',
                getComputedStyle(modele).color,
                'important'
            );
            return span;
        }              
        static ajouter(id, libelle, action = null, href = '#') {
            this.elements.set(id, {libelle, action, href});
            this.initialiser();
            this.rendre();
        }
        static initialiser() {
            if (this.observateur) return;
            this.observateur = new MutationObserver(() => {
                if (!this.complet()) {
                    this.rendre();
                }
            });
            this.observateur.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
        static complet() {
            const alliance = document.getElementById('menuAlliance');
            if (!alliance) return false;
            return [...this.elements.keys()].every((id) => {
                const lien = document.getElementById(id);
                return lien &&
                    lien.parentElement?.parentElement === alliance;
            });
        }
        static rendre() {
            const alliance = document.getElementById('menuAlliance');
            if (!alliance) return;
            const modele = alliance.querySelector(
                'a.boutonMembres, a[href="alliance.php?Membres"]'
            );
            if (!modele) return;
            // Supprime les éventuels restes de l'ancien menu Outils.
            document.getElementById('fz_menuOutilsEntree')?.remove();
            document.getElementById('fz_menuOutilsListe')?.remove();
            document.getElementById('fz-style-menu-outils')?.remove();
            for (const [id, definition] of this.elements) {
                let lien = document.getElementById(id);
                if (!lien) {
                    const li = document.createElement('li');
                    lien = document.createElement('a');
                    lien.id = id;
                    lien.href = definition.href;
                    lien.className = 'boutonMembres';
                    lien.appendChild(this.icone(id, modele));
                    lien.appendChild(
                        document.createTextNode(definition.libelle)
                    );
                    li.appendChild(lien);
                    alliance.appendChild(li);
                }
                if (!lien.dataset.fzActionInstallee) {
                    lien.dataset.fzActionInstallee = '1';
                    lien.addEventListener('click', (event) => {
                        const action = this.elements.get(id)?.action;
                        if (action) {
                            event.preventDefault();
                            action();
                        }
                    });
                }                
            }
        }
    }
    class AnalyseRC {
        static init() {
            'use strict';
            const estMessagerie = location.pathname === '/messagerie.php';            
            const NOMS = Commun.NOMS;
            const VIE = Commun.UNITES.VIE;
            const ATT = Commun.UNITES.ATT;
            const DEF = Commun.UNITES.DEF;
            const TEMPS = Commun.UNITES.TEMPS;
            const XP = [[0, 1], [3, 4], [5, 6], [7, 8], [10, 11], [12, 13]];
            const fmt = Commun.fmt;
            const somme = Commun.somme;
            const norm = Commun.norm;
            const nombre = Commun.nombre;
            const echapper = Commun.echapper;
            const indexUnite = (libelle) => Commun.indexUnite(libelle);
            const armee = (texte) => Commun.armee(texte);
            function retirerPerte(unites, pertes) { return Commun.retirerPerte(unites, pertes); }
            const stat = Commun.sommeStat;
            function secondes(s) {
                s = Math.round(s);
                const j = Math.floor(s / 86400);
                const h = Math.floor(s % 86400 / 3600);
                const m = Math.floor(s % 3600 / 60);
                const sec = s % 60;
                return `${j ? j + ' j ' : ''}${h} h ${String(m).padStart(2, '0')} min ${String(sec).padStart(2, '0')} s`;
            }
            function nettoyer(texte) { return Commun.nettoyer(texte); }
            function decouper(texte) {
                const s = nettoyer(texte);
                const re = /(?:Vous attaquez\s+(?:la|le|l['’])\s+|[\w.-]+\s+attaque\s+(?:votre|une de vos colonies))/gi;
                const departs = [...s.matchAll(re)].map((m) => m.index);
                const blocs = [];
                for (let i = 0; i < departs.length; i++) {
                    const debut = departs[i];
                    const fin = departs[i + 1] ?? s.length;
                    const bloc = s.slice(debut, fin);
                    if (/Troupes en attaque\s*:/i.test(bloc) && /Troupes en d[eé]fense\s*:/i.test(bloc)) {
                        const contexte = s.slice(Math.max(i ? departs[i - 1] : 0, debut - 180), debut);
                        blocs.push({texte: bloc, date: Commun.lireDate(contexte)});
                    }
                }
                return blocs;
            }
            function analyserBloc(bloc, numero) {
                const titre = bloc.split(/\n|Troupes en attaque\s*:/i)[0].trim().replace(/\s+/g, ' ');
                const defense = /^([\w.-]+)\s+attaque\s+(?:votre|une de vos colonies)/i.test(titre);
                const attaquant = defense ? (titre.match(/^([\w.-]+)\s+attaque/i)?.[1] || 'Adversaire') : 'Vous';
                const cible = defense ? 'Vous' : (titre.match(/\bde\s+([^,:.\n]+(?:\.[\w-]+)?)/i)?.[1]?.trim() || 'Adversaire');
                const lieu = /loge imp[eé]riale/i.test(titre) ? 'Loge impériale' : /fourmili[eè]re/i.test(titre) ? 'Fourmilière' : 'Terrain de chasse';
                const occupation = /arm[eé]e d.occupation est d[eé]j[aà] pr[eé]sente/i.test(titre);
                const aTxt = bloc.match(/Troupes en attaque\s*:\s*([^\n]*?)\.(?=\s|\n|$)/i)?.[1];
                const dTxt = bloc.match(/Troupes en d[eé]fense\s*:\s*([^\n]*?)\.(?=\s|\n|$)/i)?.[1];
                if (!aTxt || !dTxt) throw new Error('Armées initiales introuvables');
                const a = armee(aTxt);
                const d = armee(dTxt);
                if (a.inconnues.length || d.inconnues.length) throw new Error('Unités non reconnues : ' + [...a.inconnues, ...d.inconnues].join(', '));
                const tours = [];
                const lignes = bloc.split('\n').map((x) => x.trim()).filter(Boolean);
                const reDeg = /(?:Vous infligez|(?:L['’])?ennemie? inflige)\s*([\d ]+)\s*\(\s*\+\s*([\d ]+)\s*\)\s*d[eé]g[aâ]ts[^\n]*?\bet\s+(?:en\s+)?tue(?:z)?\s*([\d ]+)/i;
                for (const ligne of lignes) {
                    const m = ligne.match(reDeg);
                    if (!m) continue;
                    const nous = /^Vous infligez/i.test(ligne);
                    const camp = nous ? (defense ? 'def' : 'att') : (defense ? 'att' : 'def');
                    tours.push({camp, base: nombre(m[1]), bonus: nombre(m[2]), pertes: nombre(m[3])});
                }
                if (!tours.length) throw new Error('Aucun tour de combat reconnu');
                const pertesAtt = somme(tours.filter((t) => t.camp === 'def').map((t) => t.pertes));
                const pertesDef = somme(tours.filter((t) => t.camp === 'att').map((t) => t.pertes));
                const finAtt = retirerPerte(a.unites, pertesAtt);
                const finDef = retirerPerte(d.unites, pertesDef);
                const xp = [];
                const apresXP = defense ? finDef.unites.slice() : finAtt.unites.slice();
                const reXP = /-\s*([\d ]+)\s+([^\n]+?)\s+sont devenues?\s+des?\s+([^\n.]+)/gi;
                for (const m of bloc.matchAll(reXP)) {
                    const source = indexUnite(m[2].trim());
                    const dest = indexUnite(m[3].trim());
                    const quantite = nombre(m[1]);
                    if (source >= 0 && dest >= 0) {
                        const applique = Math.min(quantite, apresXP[source]);
                        apresXP[source] -= applique;
                        apresXP[dest] += applique;
                        xp.push({source, dest, quantite, applique});
                    }
                }
                const armes = {};
                for (const camp of ['att', 'def']) {
                    const tour = tours.find((t) => t.camp === camp && t.base > 0);
                    armes[camp] = tour ? Math.round(tour.bonus / tour.base * 10) : null;
                }
                const gagne = /Vous avez gagn[eé] cette bataille/i.test(bloc);
                const perdu = /Vos troupes ont [eé]chou[eé]/i.test(bloc);
                const issue = gagne ? (defense ? 'Défense gagnée' : 'Attaque gagnée') : perdu ? (defense ? 'Défense perdue' : 'Attaque perdue') : 'Issue indéterminée';
                return {numero, titre, attaquant, cible, lieu, occupation, defense, a: a.unites, d: d.unites,
                    finAtt: finAtt.unites, finDef: finDef.unites, pertesAtt, pertesDef, exces: finAtt.excedent + finDef.excedent,
                    apresXP, xp, tours, armes, issue};
            }
            // Méthode de RapportCombat.js : vie perdue au premier tour.
            // Un bouclier n'est calculable que si la cible survit au premier tour.
            function calculerDefenses(r) {
                const resultat = {att: {bouclier: null, lieu: []}, def: {bouclier: null, lieu: []}};
                for (const camp of ['att', 'def']) {
                    const attaque = r.tours.find((t) => t.camp === (camp === 'att' ? 'def' : 'att'));
                    const avant = camp === 'att' ? r.a : r.d;
                    if (!attaque || !attaque.pertes || attaque.pertes >= somme(avant)) continue;
                    const apres = retirerPerte(avant, attaque.pertes).unites;
                    const viePerdue = stat(avant, VIE) - stat(apres, VIE);
                    if (viePerdue <= 0) continue;
                    const ratio = (attaque.base + attaque.bonus - viePerdue) / viePerdue;
                    // Le bonus de lieu s'applique au défenseur, jamais à l'attaquant.
                    if (camp === 'att' || r.lieu === 'Terrain de chasse') {
                        resultat[camp].bouclier = Math.round(ratio * 10);
                    } else {
                        const armes = r.armes.att;
                        if (!Number.isFinite(armes)) continue;
                        for (let bouclier = armes - 3; bouclier <= armes + 2; bouclier++) {
                            let niveau;
                            if (r.lieu === 'Fourmilière') {
                                niveau = ratio * 20 - 2 - 2 * bouclier;
                                if (niveau < 0 || niveau > 45) continue;
                            } else {
                                niveau = ratio * 20 / 3 - 2 - 2 * bouclier / 3;
                                if (niveau < 0 || niveau > 45 || Math.abs(niveau - Math.round(niveau)) >= 0.2) continue;
                            }
                            resultat[camp].lieu.push(`${bouclier}/${Math.round(niveau)}`);
                        }
                    }
                }
                return resultat;
            }
            function afficherDefense(d) {
                if (d.bouclier !== null) return `Bouclier <b>${fmt(d.bouclier)}</b>`;
                if (d.lieu.length) return `Bouclier / niveau du lieu : <b>${d.lieu.join(' · ')}</b>`;
                return '<span title="Données insuffisantes, notamment en cas de destruction au premier tour">Non déterminable</span>';
            }
            function bilanUnites(r) {
                const lignes = [];
                for (let i = 0; i < 14; i++) {
                    const avA = r.a[i], avD = r.d[i], apA = r.defense ? r.finAtt[i] : r.apresXP[i];
                    const apD = r.defense ? r.apresXP[i] : r.finDef[i];
                    if (!avA && !avD && !apA && !apD) continue;
                    lignes.push(`<tr><td>${echapper(NOMS[i])}</td><td>${fmt(avA)}</td><td>${fmt(apA)}</td><td>${fmt(avD)}</td><td>${fmt(apD)}</td></tr>`);
                }
                return `<table><thead><tr><th>Unité</th><th>Att. avant</th><th>Att. après XP</th><th>Déf. avant</th><th>Déf. après XP</th></tr></thead><tbody>${lignes.join('')}</tbody></table>`;
            }
            // Armée survivante après pertes et transformations XP éventuelles.
            // Les transformations ne concernent que le camp du joueur.
            function afficherArmeeRestante(r, defenses) {
                // Le libellé dépend du vainqueur, et non du point de vue du joueur.
                const victoireJoueur = /gagnée/i.test(r.issue);
                const gagnantAttaque = victoireJoueur ? !r.defense : r.defense;
                const xpDuGagnant = victoireJoueur;
                const unites = xpDuGagnant ? r.apresXP : (gagnantAttaque ? r.finAtt : r.finDef);
                const libelle = gagnantAttaque ? 'Troupes en attaque' : 'Troupes en défense';
                const nomsPluriels = [
                    'Jeunes Soldates Naines', 'Soldates Naines', 'Naines d’élites',
                    'Jeunes Soldates', 'Soldates', 'Concierges', 'Concierges d’élites',
                    'Artilleuses', 'Artilleuses d’élites', 'Soldates d’élites',
                    'Tanks', 'Tanks d’élites', 'Tueuses', 'Tueuses d’élites'
                ];
                const elements = unites.flatMap((quantite, i) => {
                    if (quantite <= 0) return [];
                    return [`${fmt(quantite)} ${echapper(quantite === 1 ? NOMS[i] : nomsPluriels[i])}`];
                });
                const camp = gagnantAttaque ? 'att' : 'def';
                const armes = r.armes[camp];
                const protection = defenses[camp];
                const solutions = protection.lieu.map((valeur) => valeur.split('/').map(Number));
                // Parmi les couples Bouclier/Lieu possibles, privilégier le Bouclier
                // le plus proche des Armes sans dépasser leur niveau ; sinon le plus proche.
                const solutionsTriees = solutions.slice().sort((a, b) => {
                    if (!Number.isFinite(armes)) return a[0] - b[0];
                    const aDepasse = a[0] > armes ? 1 : 0;
                    const bDepasse = b[0] > armes ? 1 : 0;
                    return aDepasse - bDepasse || Math.abs(a[0] - armes) - Math.abs(b[0] - armes);
                });
                const solutionRetenue = solutionsTriees.length ? solutionsTriees[0] : null;
                const bouclier = protection.bouclier !== null ? protection.bouclier : (solutionRetenue ? solutionRetenue[0] : null);
                const niveauLieu = !gagnantAttaque && r.lieu !== 'Terrain de chasse' && solutionRetenue ? solutionRetenue[1] : null;
                const nomLieu = r.lieu === 'Fourmilière' ? 'Dôme' : r.lieu === 'Loge impériale' ? 'Loge' : null;
                const attaqueBase = stat(unites, ATT);
                const vieBase = stat(unites, VIE);
                const defenseBase = stat(unites, DEF);
                const attaque = Number.isFinite(armes) ? attaqueBase + Math.round(attaqueBase * armes / 10) : attaqueBase;
                const vie = Number.isFinite(bouclier) ? vieBase + Math.round(vieBase * bouclier / 10) : vieBase;
                const coefficientLieu = nomLieu === 'Dôme' ? 1 : 3;
                const vieLieu = nomLieu && niveauLieu !== null
                    ? vie + Math.round(vieBase * (niveauLieu + 2) * coefficientLieu / 20)
                    : null;
                const defense = Number.isFinite(armes) ? defenseBase + Math.round(defenseBase * armes / 10) : defenseBase;
                const incertain = (valeur, niveau) => niveau === null ? `${fmt(valeur)} <small>(sans bonus non déterminé)</small>` : fmt(valeur);
                return `<div class="rc-armee-restante">
                    <div><b>Troupes :</b> ${elements.length ? elements.join(', ') : 'Aucune troupe survivante'}.</div>
                    <div><b>Armes :</b> ${Number.isFinite(armes) ? fmt(armes) : 'Non déterminable'}</div>
                    ${Number.isFinite(bouclier) ? `<div><b>Bouclier :</b> ${fmt(bouclier)}</div>` : ''}
                    ${nomLieu && niveauLieu !== null ? `<div><b>${nomLieu} :</b> ${fmt(niveauLieu)}</div>` : ''}
                    <div><b>Attaque :</b> ${incertain(attaque, Number.isFinite(armes) ? armes : null)}</div>
                    <div><b>Vie :</b> ${fmt(vie)}</div>
                    ${nomLieu && niveauLieu !== null ? `<div><b>Vie en ${nomLieu} :</b> ${fmt(vieLieu)}</div>` : ''}
                    <div><b>Défense :</b> ${incertain(defense, Number.isFinite(armes) ? armes : null)}</div>
                </div>`;
            }
            function afficherResultats(blocs) {
                const destination = document.getElementById('rc-resultats');
                const rapports = [];
                const erreurs = [];
                blocs.forEach((b, i) => {
                    try { rapports.push({...analyserBloc(b.texte, i + 1), date: b.date}); }
                    catch (e) { erreurs.push(`Combat ${i + 1} : ${e.message}`); }
                });
                if (!rapports.length) {
                    destination.innerHTML = `<p class="rc-alerte">Aucun combat exploitable. ${echapper(erreurs.join(' ; ') || 'Ouvrez un message contenant un rapport complet ou collez son texte.')}</p>`;
                    return;
                }
                const total = (champ) => somme(rapports.map((r) => r[champ]));
                const bilanTDP = CalculTDP.bilan(rapports);
                const documentTDP = new DOMParser().parseFromString(bilanTDP, 'text/html');
                const calculsTDP = [...documentTDP.querySelectorAll('#rc-bilan-tdp tbody tr')]
                    .filter((ligne) => ligne.cells.length === 5).length;
                const resumeTDP = calculsTDP
                    ? `${calculsTDP} calcul${calculsTDP > 1 ? 's' : ''} effectué${calculsTDP > 1 ? 's' : ''}`
                    : 'Non calculé';                
                    const html = [`<div class="rc-bilan"><strong>${rapports.length} combat(s) analysé(s)</strong><span>Pertes attaquants : <b>${fmt(total('pertesAtt'))}</b></span><span>Pertes défenseurs : <b>${fmt(total('pertesDef'))}</b></span><span>TDP : <b>${resumeTDP}</b></span></div>`];
                for (const r of rapports) {
                    const nA = somme(r.a), nD = somme(r.d);
                    const defenses = calculerDefenses(r);
                    const hofA = stat(r.a, TEMPS) - stat(r.finAtt, TEMPS);
                    const hofD = stat(r.d, TEMPS) - stat(r.finDef, TEMPS);
                    html.push(`<details class="rc-combat"><summary><strong>${echapper(r.issue)}</strong> — ${echapper(r.attaquant)} → ${echapper(r.cible)} (${echapper(r.lieu)})</summary>
                        <div class="rc-interieur">
                        ${r.occupation ? '<p>Armée d’occupation présente : le propriétaire de la fourmilière n’est pas nécessairement le défenseur réel.</p>' : ''}
                        <div class="rc-chiffres"><div><small>Attaquants initiaux</small><b>${fmt(nA)}</b><small>Pertes : ${fmt(r.pertesAtt)} (${nA ? (r.pertesAtt * 100 / nA).toFixed(2) : 0} %)</small></div>
                        <div><small>Défenseurs initiaux</small><b>${fmt(nD)}</b><small>Pertes : ${fmt(r.pertesDef)} (${nD ? (r.pertesDef * 100 / nD).toFixed(2) : 0} %)</small></div></div>
                        <p>Survivants : attaquant <b>${fmt(somme(r.finAtt))}</b> · défenseur <b>${fmt(somme(r.finDef))}</b></p>
                        <div class="rc-niveaux">
                            <section class="rc-niveau-camp rc-camp-att">
                                <h4>Niveaux de l’attaquant — ${echapper(r.attaquant)}</h4>
                                <p>Armes : <b>${r.armes.att ?? 'Non déterminable'}</b></p>
                                <p>${afficherDefense(defenses.att)}</p>
                            </section>
                            <section class="rc-niveau-camp rc-camp-def">
                                <h4>Niveaux du défenseur — ${echapper(r.cible)}</h4>
                                <p>Armes : <b>${r.armes.def ?? 'Non déterminable'}</b></p>
                                <p>${afficherDefense(defenses.def)}</p>
                                <p>Lieu : <b>${echapper(r.lieu)}</b></p>
                            </section>
                        </div>
                        <p>HoF (TDP 0) : attaquant <b>${secondes(hofA)}</b> · défenseur <b>${secondes(hofD)}</b></p>
                        ${r.exces ? `<p class="rc-alerte">Attention : ${fmt(r.exces)} pertes dépassent les effectifs initiaux.</p>` : ''}
                        ${bilanUnites(r)}
                        ${r.xp.length ? `<p><b>XP :</b> ${r.xp.map((x) => `${fmt(x.quantite)} ${echapper(NOMS[x.source])} → ${echapper(NOMS[x.dest])}${x.applique !== x.quantite ? ' (quantité à vérifier)' : ''}`).join(' ; ')}</p>` : ''}
                        ${afficherArmeeRestante(r, defenses)}
                        <details><summary>Détail des tours (${Math.ceil(r.tours.length / 2)})</summary><table><thead><tr><th>Camp infligeant</th><th>Dégâts</th><th>Bonus</th><th>Unités tuées</th></tr></thead><tbody>${r.tours.map((t) => `<tr><td>${t.camp === 'att' ? 'Attaquant' : 'Défenseur'}</td><td>${fmt(t.base)}</td><td>${fmt(t.bonus)}</td><td>${fmt(t.pertes)}</td></tr>`).join('')}</tbody></table></details>
                        </div></details>`);
                }
                html.push(bilanTDP);
                if (erreurs.length) html.push(`<p class="rc-alerte">${echapper(erreurs.join(' ; '))}</p>`);
                destination.innerHTML = html.join('');
            }
            function texteMessages() {
                // Les lignes de conversation sont des FRÈRES des lignes message_,
                // et non leurs ancêtres : closest('tr.contenu_conversation') échoue.
                const rapports = [...document.querySelectorAll('#table_liste_conversations tr[id^="message_"] .contenuJoueur')]
                    .filter((element) => {
                        const ligne = element.closest('tr[id^="message_"]');
                        return ligne && element.getClientRects().length > 0
                            && getComputedStyle(element).visibility !== 'hidden';
                    })
                    .map((element) => {
                        const copie = element.cloneNode(true);
                        copie.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
                        let ligne = element.closest('tr[id^="message_"]');
                        let date = null;
                        for (let i = 0; ligne && i < 3 && !date; i++, ligne = ligne.previousElementSibling) {
                            const meta = ligne.cloneNode(true);
                            meta.querySelectorAll('.contenuJoueur').forEach((n) => n.remove());
                            date = Commun.lireDate(meta.textContent);
                        }
                        return (date ? date.texte + '\n' : '') + (copie.textContent || '');
                    })
                    .filter((texte) => /Troupes en attaque\s*:/i.test(texte)
                        && /Troupes en d[eé]fense\s*:/i.test(texte));
                return rapports.join('\n\n');
            }
            function ouvrir() {
                const p = document.getElementById('rc-panneau');
                p.hidden = false;
            }
            const style = document.createElement('style');
            style.textContent = `
                #fz_boutonAnalyseRC a{cursor:pointer}
                #rc-panneau[hidden] {display:none!important}
                #rc-panneau {position:fixed;top:4vh;left:0;right:0;margin:0 auto;width:92vw;max-width:900px;max-height:67vh;z-index:2147483646;background:#f7e8b8;color:#30200d;border:2px solid #a98d43;border-radius:7px;box-shadow:0 15px 70px #000b;display:flex;flex-direction:column;overflow:hidden;font:14px Arial,sans-serif}
                #rc-panneau * {box-sizing:border-box}
                #rc-entete {display:flex;align-items:center;justify-content:space-between;padding:11px 16px;background:linear-gradient(#e6c46a,#ae7826);border-bottom:2px solid #a98d43}
                #rc-entete strong {font-size:18px}
                #rc-fermer {background:transparent;border:0;color:#382c16;font-size:24px;cursor:pointer}
                #rc-corps {overflow:auto;padding:16px}
                #rc-actions {display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}
                #rc-panneau button.rc-action {background:linear-gradient(#ffe9a4,#c99a42);color:#382c16;border:1px solid #a98d43;border-radius:4px;padding:9px 12px;font-weight:700;cursor:pointer}
                #rc-panneau textarea {width:100%;min-height:125px;resize:vertical;background:#fffaf0;color:#382c16;border:1px solid #a98d43;border-radius:8px;padding:10px;font:13px Consolas,monospace}
                #rc-panneau .rc-note {color:#725d34;margin:8px 0}
                #rc-panneau .rc-bilan {display:flex;gap:16px;flex-wrap:wrap;align-items:center;padding:13px;background:#f1d994;border-radius:10px;margin:14px 0}
                #rc-panneau .rc-combat {margin:12px 0;border:1px solid #b99d53;border-radius:10px;overflow:hidden}
                #rc-panneau .rc-combat>summary {cursor:pointer;background:linear-gradient(#f6d782,#c49138);padding:12px}
                #rc-panneau .rc-interieur > details {margin-top:16px}
                #rc-panneau .rc-chiffres {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
                #rc-panneau .rc-chiffres>div {display:flex;flex-direction:column;gap:5px;padding:10px;background:#f1d994;border-radius:8px}
                #rc-panneau .rc-chiffres b {font-size:19px}
                #rc-panneau small {color:#725d34}
                #rc-panneau button.rc-action:hover {background:#e9d18d}
                #rc-panneau table {width:100%;border-collapse:collapse;margin:12px 0;font-size:12px}
                #rc-panneau th,#rc-panneau td {border-bottom:1px solid #c5aa69;padding:7px;text-align:right;white-space:nowrap}
                #rc-panneau th:first-child,#rc-panneau td:first-child {text-align:left}
                #rc-panneau .rc-niveaux {display:flex;flex-direction:column;gap:9px;margin:12px 0}
                #rc-panneau .rc-niveau-camp {padding:10px 13px;border-radius:6px;border:1px solid #9b702b}
                #rc-panneau .rc-camp-att {background:#f5dda0;border-left:5px solid #ad6921}
                #rc-panneau .rc-camp-def {background:#e7d4a2;border-left:5px solid #627c39}
                #rc-panneau .rc-niveau-camp h4 {margin:0 0 8px;color:#34220d;font-size:15px}
                #rc-panneau .rc-niveau-camp p {margin:5px 0}
                #rc-panneau .rc-armee-restante {padding:10px 12px;background:#e8c77e;border-left:4px solid #8b5a17;border-radius:5px;line-height:1.6;overflow-wrap:anywhere}
                #rc-panneau .rc-alerte {color:#9b2929}
                @media(max-width:650px) {#rc-panneau {top:2vh;width:96vw}#rc-panneau .rc-chiffres {grid-template-columns:1fr}}
                #rc-panneau #rc-fermer { font: 700 13px Arial, sans-serif; color: #382c16; background: linear-gradient(#ffe9a4, #c99a42); border: 1px solid #a98d43; border-radius: 4px; padding: 9px 12px; cursor: pointer; }
                #rc-panneau #rc-fermer:hover { background: #e9d18d; }            
                `;
            document.head.append(style);
            MenuOutils.ajouter('fz_boutonAnalyseRC', 'Analyse RC', ouvrir);
            const panneau = document.createElement('section');
            panneau.id = 'rc-panneau';
            panneau.hidden = true;
            panneau.innerHTML = `<div id="rc-entete"><strong>Analyse de combats</strong><button type="button" id="rc-fermer">Fermer</button></div>
                <div id="rc-corps"><div id="rc-actions"><button class="rc-action" id="rc-messagerie">Analyser les messages affichés</button><button class="rc-action" id="rc-coller">Analyser le texte collé</button></div>
                <textarea id="rc-texte" placeholder="Collez ici un ou plusieurs rapports de combat complets…"></textarea>
                ${estMessagerie ? '<p class="rc-note">Messagerie : ouvrez les conversations à analyser. Tous les rapports de combat visibles dans ces conversations seront récupérés, même si une conversation contient plusieurs combats.</p>' : ''}
                <div id="rc-resultats"></div></div>`;
            document.body.append(panneau);
            document.getElementById('rc-messagerie').style.display = estMessagerie ? '' : 'none';
            document.getElementById('rc-fermer').onclick = () => { panneau.hidden = true; };
            document.getElementById('rc-coller').onclick = () => afficherResultats(decouper(document.getElementById('rc-texte').value));
            document.getElementById('rc-messagerie').onclick = () => {
                if (!estMessagerie) return;
                const texte = texteMessages();
                if (texte) {
                    document.getElementById('rc-texte').value = texte;
                    afficherResultats(decouper(texte));
                } else {
                    document.getElementById('rc-resultats').innerHTML = '<p class="rc-alerte">Aucun rapport visible trouvé. Ouvrez le message dans la messagerie, puis réessayez.</p>';
                }
            };
        }
    }
    class BilanTdC {
        static init() {
            'use strict';
            const pageForum = window.location.href.startsWith(
                'https://s1.fourmizzz.fr/alliance.php?forum_menu'
            );
            MenuOutils.ajouter(
                'fz_boutonBilanTdC',
                'Bilan TdC',
                pageForum ? null : () => {
                    window.location.href = 'alliance.php?forum_menu';
                }
            );
            if (!pageForum) return;
            if (!Commun.pseudo) return;   // pas connecté
            const parseNum = Commun.nombre;
            function monthIdx(t) {
                t = t.toLowerCase().replace('.', '');
                if (t.indexOf('juin') === 0) return 5;
                if (t.indexOf('juil') === 0) return 6;
                var m = { jan: 0, 'fév': 1, fev: 1, mar: 2, avr: 3, mai: 4, 'aoû': 7, aou: 7, sep: 8, oct: 9, nov: 10, 'déc': 11, dec: 11 };
                var v = m[t.slice(0, 3)];
                return v === undefined ? -1 : v;
            }
            function parsePosts(text, now) {
                var raw = text.replace(/\r/g, '').split('\n').map(function (x) { return x.replace(/[\u00a0\u202f]/g, ' ').trim(); }).filter(Boolean);
                var posts = [], cur = null;
                var hdr = /^\[([^\]]+)\]\([^)]*\)(.*)$/;
                var dre = /^(\d{1,2})\s+([A-Za-zÀ-ÿ.]+)(?:\s+(\d{4}))?\s+à\s+(\d{1,2})h(\d{2})$/;
                function isDate(l) {
                if (/^(hier|aujourd['’]hui)\s+à\s+\d{1,2}h\d{2}$/i.test(l)) return true;
                var d = l.match(dre);
                return !!d && monthIdx(d[2]) >= 0;
                }
                /* 1. Un pseudo cliquable n'est l'auteur d'un post que s'il est suivi de la date du post.
                    Sinon c'est un nom au milieu d'une phrase (ex. « Vol par [pseudo] : ... ») : on le remet dans la ligne. */
                var items = [];
                for (var i = 0; i < raw.length; i++) {
                var m = raw[i].match(hdr);
                if (!m) { items.push({ s: raw[i] }); continue; }
                var rest = m[2].trim(), tag = '', tm = rest.match(/\(([^)]+)\)/);
                if (tm) { tag = tm[1].trim(); rest = rest.replace(tm[0], '').trim(); }
                var j = i + 1, tagNext = false;
                if (!tag && !rest && j < raw.length && /^\([^)]+\)$/.test(raw[j])) { tag = raw[j].slice(1, -1).trim(); tagNext = true; j++; }
                var real = rest ? isDate(rest) : (j < raw.length && isDate(raw[j]));
                if (real) {
                    items.push({ h: { author: m[1], tag: tag } });
                    if (rest) items.push({ s: rest });
                    if (tagNext) i++;
                } else {
                    var txt = (m[1] + m[2]).trim(), last = items[items.length - 1];
                    if (last && last.s !== undefined) last.s += ' ' + txt; else items.push({ s: txt });
                }
                }
                function handle(l) {
                if (!cur || !l || l === 'Corbeille') return;
                var d = l.match(dre);
                if (d && !cur.date) {
                    var mi = monthIdx(d[2]);
                    if (mi >= 0) {
                    var y = d[3] ? +d[3] : now.getFullYear();
                    var dt = new Date(y, mi, +d[1], +d[4], +d[5]);
                    if (!d[3] && dt.getTime() > now.getTime() + 86400000) dt = new Date(y - 1, mi, +d[1], +d[4], +d[5]);
                    cur.date = dt; return;
                    }
                }
                cur.lines.push(l);
                }
                items.forEach(function (it) {
                if (it.h) { cur = { author: it.h.author, tag: it.h.tag, date: null, lines: [], entries: [], notes: [] }; posts.push(cur); return; }
                handle(it.s);
                });
                posts.forEach(function (p) {
                var sumB = [], sumV = [], rawB = [], rawV = [];
                p.lines.forEach(function (l) {
                    var m;
                    if ((m = l.match(/Butin chez\s+([^\s:]+)\s*:\s*([\d ]+)\s*cm/i))) sumB.push({ type: 'butin', target: m[1], amount: parseNum(m[2]) });
                    else if ((m = l.match(/Vol par\s+([^\s:]+)\s*:\s*([\d ]+)\s*cm/i))) sumV.push({ type: 'vol', target: m[1], amount: parseNum(m[2]) });
                    else if ((m = l.match(/fourmis\s+ont\s+conquis\s+([\d\s\u00a0\u202f]+)\s*cm(?:²|2)?(?:.*?Ces terres appartenaient à\s+([^\s.]+))?/i))) { rawB.push({ type: 'butin', target: m[2] || '', amount: parseNum(m[1]) }); }  
                    else if ((m = l.match(/(\S+)\s+vous a pris\s+([\d ]+)\s*cm/i))) rawV.push({ type: 'vol', target: m[1], amount: parseNum(m[2]) });
                });
                function pick(sum, raw, label) {
                    if (sum.length) {
                    if (raw.length) {
                        var a = sum.reduce(function (s, e) { return s + e.amount; }, 0);
                        var b = raw.reduce(function (s, e) { return s + e.amount; }, 0);
                        if (a === b) p.notes.push({ warn: false, text: 'Détail ignoré : ' + raw.length + ' ligne(s), même total.' });
                        else p.notes.push({ warn: true, text: 'Le détail (' + b.toLocaleString('fr-FR') + ') diffère du total (' + a.toLocaleString('fr-FR') + ') pour le ' + label + '. Le total est retenu.' });
                    }
                    return sum;
                    }
                    return raw;
                }
                p.entries = pick(sumB, rawB, 'butin').concat(pick(sumV, rawV, 'vol'));
                /* 2. Message privé collé dans un post (« Moi », « Participants… ») : il répète des floods déjà postés ailleurs, on l'ignore */
                if (p.entries.length && p.lines.some(function (l) { return /^Moi(\s|,|$)/.test(l) || /Participants \(messages/i.test(l); })) {
                    p.entries = [];
                    p.notes.push({ warn: false, text: 'Message privé collé dans le post : ignoré (les floods sont déjà dans leurs posts d\u2019origine).' });
                }
                });
                return posts.filter(function (p) { return p.entries.length || p.lines.length; });
            }
            // Construit exclusivement à partir des auteurs de la lecture courante.
            function construireAuteurs(posts) {
                const membres = new Map();
                const partage = posts.some((p) => p.tag);
                for (const p of posts) {
                    const cle = Commun.norm(p.author);
                    if (!cle) continue;
                    const tag = partage ? p.tag : Commun.alliance;
                    if (!tag) continue;
                    const precedent = membres.get(cle);
                    if (precedent && precedent !== tag) membres.set(cle, null);
                    else if (!membres.has(cle)) membres.set(cle, tag);
                }
                if (Commun.pseudo && Commun.alliance) {
                    membres.set(Commun.norm(Commun.pseudo), Commun.alliance);
                }
                return membres;
            }
            function compute(posts, excluded, nous) {
                const players = {}, targets = {}, allis = {};
                const t = {butin: 0, vol: 0, net: 0, floods: 0, nButin: 0, nVol: 0,
                    ignored: 0, used: 0, internes: 0, nInternes: 0, horsAlliance: 0};
                const allianceDe = (pseudo) => {
                    const cle = Commun.norm(pseudo);
                    return corrections.has(cle) ? corrections.get(cle) : auteurs.get(cle);
                };
                posts.forEach((p, i) => {
                    if (!p.entries.length) { t.ignored++; return; }
                    if (excluded.has(i)) return;
                    t.used++;
                    const allianceAuteur = allianceDe(p.author) || p.tag || (forumPartage ? null : nous);
                    for (const e of p.entries) {
                        const allianceCible = allianceDe(e.target);
                        // Butin : l'auteur prend. Vol : le joueur cité prend à l'auteur.
                        const gagnant = e.type === 'butin' ? allianceAuteur : allianceCible;
                        const perdant = e.type === 'butin' ? allianceCible : allianceAuteur;
                        if (gagnant === nous && perdant === nous) {
                            t.internes += e.amount;
                            t.nInternes++;
                            continue;
                        }
                        if (gagnant && perdant && gagnant !== nous && perdant !== nous) {
                            t.horsAlliance++;
                            continue;
                        }
                        // L'auteur identifié suffit à déterminer le sens d'un rapport,
                        // tant que le joueur cité n'est pas confirmé comme membre interne.
                        let eff;
                        if (gagnant === nous) eff = 'butin';
                        else if (perdant === nous) eff = 'vol';
                        else if (gagnant && gagnant !== nous) eff = 'vol';
                        else if (perdant && perdant !== nous) eff = 'butin';
                        else continue;
                        const pk = Commun.norm(p.author), tk = Commun.norm(e.target);
                        const P = players[pk] || (players[pk] = {name: p.author, tag: allianceAuteur || '', butin: 0, vol: 0, n: 0});
                        const T = targets[tk] || (targets[tk] = {name: e.target, butin: 0, vol: 0, n: 0});
                        const ak = allianceAuteur || '';
                        const A = allis[ak] || (allis[ak] = {tag: ak, butin: 0, vol: 0, n: 0});
                        [P, T, A].forEach((o) => { o[eff] += e.amount; o.n++; });
                        t[eff] += e.amount;
                        t.floods++;
                        if (eff === 'butin') t.nButin++; else t.nVol++;
                    }
                });
                const list = (o) => Object.values(o).map((v) => {
                    v.net = v.butin - v.vol;
                    return v;
                }).sort((a, b) => b.net - a.net);
                t.net = t.butin - t.vol;
                return {players: list(players), targets: list(targets), alliances: list(allis), totals: t, nous};
            }
            var excluded = new Set(), posts = [], last = null;
            let auteurs = new Map(), corrections = new Map(), forumPartage = false;
            var fmt = function (n) { return n.toLocaleString('fr-FR'); };
            function signed(n) { return n === 0 ? '0' : (n > 0 ? '+' : '−') + fmt(Math.abs(n)); }
            function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
            /* ---------- Style (préfixe tdc- pour ne pas heurter le CSS du site) ---------- */
            var css = `
                #tdc-panel, #tdc-panel * { box-sizing: border-box; }
                #tdc-panel { position:fixed; top:4vh; left:0; right:0; margin:0 auto; width:92vw; max-width:900px; max-height:67vh; z-index:2147483646; background:#f7e8b8; color:#30200d; border:2px solid #a98d43; border-radius:7px; box-shadow:0 15px 70px #000b; display:none; flex-direction:column; font:14px Arial,sans-serif; text-align:left; overflow:hidden; }
                #tdc-panel .tdc-head { display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; padding:11px 16px; background:linear-gradient(#e6c46a,#ae7826); border-bottom:2px solid #a98d43; }
                #tdc-panel .tdc-head strong { font-size:18px; }
                #tdc-panel .tdc-body { overflow:auto; min-height:0; padding:16px; display:flex; flex-direction:column; gap:16px; }
                #tdc-panel button { font:700 13px Arial,sans-serif; color:#382c16; background:linear-gradient(#ffe9a4,#c99a42); border:1px solid #a98d43; border-radius:4px; padding:9px 12px; cursor:pointer; }
                #tdc-panel button:hover { background:#e9d18d; }
                #tdc-panel h3 { margin:0 0 6px; font-size:15px; color:#34220d; }
                #tdc-panel .tdc-tiles { display:flex; gap:16px; flex-wrap:wrap; }
                #tdc-panel .tdc-tile { background:#f1d994; border-left:5px solid #ad6921; padding:10px 13px; border-radius:6px; min-width:150px; }
                #tdc-panel .tdc-tile.b { border-left-color:#627c39; }
                #tdc-panel .tdc-tile.v { border-left-color:#a5432d; }
                #tdc-panel .tdc-k { font-size:14px; font-weight:700; color:#725d34; text-transform:uppercase; letter-spacing:.05em; }
                #tdc-panel .tdc-n { font-size:20px; font-weight:700; font-variant-numeric:tabular-nums; }
                #tdc-panel .tdc-tile.net .tdc-n { font-size:26px; }
                #tdc-panel .tdc-u { font-size:14px; color:#725d34; }
                #tdc-panel .tdc-scroll { overflow-x:auto; }
                #tdc-panel table { border-collapse:collapse; width:100%; font-size:12px; font-variant-numeric:tabular-nums; }
                #tdc-panel th, #tdc-panel td { text-align:right; padding:7px; border-bottom:1px solid #c5aa69; white-space:nowrap; background:none; color:inherit; }
                #tdc-panel th:first-child, #tdc-panel td:first-child { text-align:left; }
                #tdc-panel th { font-size:12px; color:#725d34; }
                #tdc-panel .b { color:#486d30; }
                #tdc-panel .v { color:#9b2929; }
                #tdc-panel tfoot td { font-weight:700; border-top:2px solid #a98d43; }
                #tdc-panel .tdc-post { display:flex; gap:8px; align-items:flex-start; padding:8px; border-bottom:1px solid #c5aa69; }
                #tdc-panel .tdc-post.off { opacity:.5; }
                #tdc-panel .tdc-note { font-size:12px; color:#725d34; }
                #tdc-panel .tdc-note.warn { color:#9b2929; }
                #tdc-panel .tdc-muted { color:#725d34; }
                #tdc-panel .tdc-phrase { font-weight:700; font-size:15px; background:#e8c77e; padding:10px 12px; border-radius:5px; }
                #tdc-panel .tdc-sub { font-size:11px; color:#725d34; font-weight:400; }
                #tdc-panel details { border:1px solid #b99d53; border-radius:8px; padding:10px 12px; }
                #tdc-panel summary { cursor:pointer; font-weight:700; font-size:15px; padding:2px 0 8px; }
                #tdc-panel .tdc-nous select { font:inherit; font-size:14px; margin-left:6px; padding:4px 8px; background:#fffaf0; color:#382c16; border:1px solid #a98d43; border-radius:4px; }
                .tdc-k .tdc-titre-topic { text-transform: none; }
                #tdc-panel .tdc-affiliation { margin-left:5px; padding:3px; border-radius:4px; }                    
            `;
            var st = document.createElement('style');
            st.textContent = css;
            document.head.appendChild(st);
            /* ---------- Lecture des posts affichés sur la page ---------- */
            function pageText() {
                const root = document.getElementById('forum');
                if (!root) return '';
                const out = [];            
                var BLOCK = /^(DIV|P|LI|UL|OL|TR|TABLE|TBODY|H[1-6]|SECTION|ARTICLE|BLOCKQUOTE|FORM|TD|TH)$/;
                (function walk(n) {
                    if (n.nodeType === 3) { out.push(n.nodeValue); return; }
                    if (n.nodeType !== 1) return;
                    if (n.id === 'tdc-panel' || n.id === 'fz_boutonBilanTdC') return;
                    var tag = n.tagName;
                    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
                    if (tag === 'BR') { out.push('\n'); return; }
                    if (tag === 'A' && /Membre\.php\?Pseudo=/i.test(n.getAttribute('href') || '')) {
                        out.push('\n[' + n.textContent.trim() + '](x)');
                        return;
                    }
                    var block = BLOCK.test(tag);
                    if (block) out.push('\n');
                    for (var c = n.firstChild; c; c = c.nextSibling) walk(c);
                    if (block) out.push('\n');
                })(root);
                return out.join('');
            }
            /* ---------- Panneau ---------- */
            const MOI = Commun.pseudo;
            var nous = '', groups = [], openState = {};
            var CLE_NOUS = 'fz_bilantdc_nous';
            function lireNous() { try { return localStorage.getItem(CLE_NOUS); } catch (e) { return null; } }
            function ecrireNous(v) { try { localStorage.setItem(CLE_NOUS, v); } catch (e) {} }
            function etiquette(tag) { return tag || 'Sans tag'; }
            function draw() {
                var body = document.getElementById('tdc-body');
                [].forEach.call(body.querySelectorAll('details'), function (d) { openState[d.getAttribute('data-k')] = d.open; });
                last = compute(posts, excluded, nous);
                var t = last.totals, multi = groups.length > 1;
                function table(list, label, nameFn) {
                    if (!list.length) return '<p class="tdc-muted">Aucune donnée.</p>';
                    var tn = 0, tf = 0;
                    var rows = list.map(function (r) {
                        tn += r.net; tf += r.n;
                        return '<tr><td>' + nameFn(r) + '<div class="tdc-sub"><span class="b">' + signed(r.butin) + '</span> · <span class="v">' + signed(-r.vol) + '</span></div></td>' +
                        '<td class="' + (r.net < 0 ? 'v' : 'b') + '"><strong>' + signed(r.net) + '</strong></td><td>' + r.n + '</td></tr>';
                    }).join('');
                    return '<div class="tdc-scroll"><table><thead><tr><th>' + label + '</th><th>Net</th><th>Floods</th></tr></thead><tbody>' + rows +
                        '</tbody><tfoot><tr><td>Total</td><td class="' + (tn < 0 ? 'v' : 'b') + '">' + signed(tn) + '</td><td>' + tf + '</td></tr></tfoot></table></div>';
                }
                function det(k, titre, contenu) { return '<details data-k="' + k + '"' + (openState[k] ? ' open' : '') + '><summary>' + titre + '</summary>' + contenu + '</details>'; }
                var select = multi ? '<div class="tdc-nous">Notre alliance : <select id="tdc-nous">' + groups.map(function (g) {
                return '<option value="' + esc(g) + '"' + (g === nous ? ' selected' : '') + '>' + esc(etiquette(g)) + '</option>';
                }).join('') + '</select><div class="tdc-note">Le sens des mouvements est déterminé par les alliances des joueurs identifiés.</div></div>' : '';
                const choixInconnus = (p) => p.entries.map((e) => {
                    const cle = Commun.norm(e.target);
                    if (!cle || auteurs.has(cle)) return '';
                    const valeur = corrections.get(cle) || '';
                    return '<div class="tdc-note">Alliance de ' + esc(e.target) +
                        ' (non identifié parmi les auteurs) : <select class="tdc-affiliation" data-pseudo="' + esc(e.target) + '">' +
                        '<option value=""' + (!valeur ? ' selected' : '') + '>Inconnue</option>' +
                        '<option value="nous"' + (valeur === nous ? ' selected' : '') + '>Notre alliance</option>' +
                        '<option value="autre"' + (valeur === '__autre__' ? ' selected' : '') + '>Autre alliance</option>' +
                        '</select></div>';
                }).join('');
                var list = posts.length ? posts.map(function (p, i) {
                var ok = p.entries.length > 0, on = ok && !excluded.has(i);
                var what = ok ? p.entries.map(function (e) {
                    return '<span class="' + (e.type === 'butin' ? 'b' : 'v') + '">' + (e.type === 'butin' ? '+' : '−') + fmt(e.amount) + ' · ' + esc(e.target) + '</span>';
                }).join(' &nbsp; ') : '<span class="tdc-muted">rien de reconnu, ignoré</span>';
                var notes = p.notes.map(function (n) { return '<div class="tdc-note' + (n.warn ? ' warn' : '') + '">' + esc(n.text) + '</div>'; }).join('');
                return '<div class="tdc-post' + (on ? '' : ' off') + '"><input type="checkbox" data-i="' + i + '" id="tdc-ck' + i + '" ' + (on ? 'checked' : '') + (ok ? '' : ' disabled') + '>' +
                    '<label for="tdc-ck' + i + '"><strong>' + esc(p.author) + '</strong>' + (p.tag ? ' <span class="tdc-sub">' + esc(p.tag) + '</span>' : '') + ' ' + what + notes + choixInconnus(p) + '</label></div>';
                }).join('') : '<p class="tdc-muted">Aucun post trouvé sur cette page. Ouvrez une section du forum, puis cliquez sur Actualiser.</p>';
                var autres = groups.filter(function (g) { return g !== nous; });
                var nomNous = etiquette(nous), nomAutres = autres.map(etiquette).join(', ') || 'les autres';
                var phrase = '';
                if (multi) phrase = t.net < 0 ? nomAutres + (autres.length > 1 ? ' doivent' : ' doit') + ' rendre à ' + nomNous + ' : ' + fmt(-t.net) + ' cm²'
                    : (t.net > 0 ? nomNous + ' doit rendre à ' + nomAutres + ' : ' + fmt(t.net) + ' cm²' : 'Comptes à l\u2019équilibre');
                var camps = multi ? '<div><h3>Récupéré par camp</h3><div class="tdc-scroll"><table><thead><tr><th>Camp</th><th>Récupéré</th><th>Floods</th></tr></thead><tbody>' +
                    '<tr><td>' + esc(nomNous) + ' <span class="tdc-sub">(nous)</span></td><td class="b"><strong>' + signed(t.butin) + '</strong></td><td>' + t.nButin + '</td></tr>' +
                    '<tr><td>' + esc(nomAutres) + '</td><td class="v"><strong>' + signed(-t.vol) + '</strong></td><td>' + t.nVol + '</td></tr>' +
                    '</tbody><tfoot><tr><td>Bilan</td><td class="' + (t.net < 0 ? 'v' : 'b') + '">' + signed(t.net) + '</td><td>' + t.floods + '</td></tr></tfoot></table></div></div>' : '';
                const titreTopic = document.querySelector('#forum > h2')?.textContent.trim() || '';              
                body.innerHTML =
                    '<div class="tdc-tiles"><div class="tdc-tile net ' + (t.net < 0 ? 'v' : 'b') + '">' +
                        '<div class="tdc-k">Bilan du Topic : <span class="tdc-titre-topic">' + esc(titreTopic) + '</span></div>' +
                        '<div class="tdc-n">' + signed(t.net) + '</div>' +
                        '<div class="tdc-u">' +
                            ' · ' + t.floods + ' floods' +
                            (t.nInternes > 0 ? '<div> · Internes exclus : ' + t.nInternes + ' (' + fmt(t.internes) + ' cm²)</div>' : '') +
                            '<div> · Pris : ' + signed(t.butin) + '</div>' +
                            '<div> · Perdu : ' + signed(-t.vol) + '</div>' +
                        '</div>' +
                    '</div></div>' +
                    (phrase ? '<div class="tdc-phrase">' + esc(phrase) + '</div>' : '') +                
                    select + camps +
                    det('joueurs', 'Par auteur du post', '<p class="tdc-note">Le membre qui a écrit le post (ex. Guitube).</p>' + table(last.players, 'Auteur', function (r) { return esc(r.name) + (multi ? ' <span class="tdc-sub">' + esc(etiquette(r.tag)) + '</span>' : ''); })) +
                    det('cibles', 'Par joueur cité dans le post', '<p class="tdc-note">Le joueur nommé après « Butin chez » ou « Vol par » (ex. mydolle).</p>' + table(last.targets, 'Joueur cité', function (r) { return esc(r.name); })) +
                    det('posts', 'Posts lus (' + t.used + ', ' + t.ignored + ' ignoré' + (t.ignored > 1 ? 's' : '') + ')', '<p class="tdc-note">Décochez un post pour l’exclure du bilan.</p>' + list);
            }
            function refresh() {
                excluded = new Set();
                posts = parsePosts(pageText(), new Date());
                corrections = new Map();
                forumPartage = posts.some((p) => !!p.tag);
                auteurs = construireAuteurs(posts);
                var s = {};
                posts.forEach(function (p) { if (p.entries.length) s[p.tag] = true; });
                groups = Object.keys(s);
                var st = lireNous();
                nous = Commun.alliance || ((st !== null && st.startsWith('t:')) ? st.slice(2) : '');
                draw();
            }
            function copyText(txt, btn, label) {
                function done() { btn.textContent = 'Copié'; setTimeout(function () { btn.textContent = label; }, 1800); }
                function legacy() {
                var ta = document.createElement('textarea');
                ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
                document.body.appendChild(ta); ta.select();
                try { document.execCommand('copy'); done(); } catch (e) { btn.textContent = 'Copie impossible'; }
                document.body.removeChild(ta);
                }
                try { navigator.clipboard.writeText(txt).then(done, legacy); } catch (e) { legacy(); }
            }
            function copyTable() {
                if (!last) return;
                var t = last.totals, rows = ['Camp\tRécupéré (cm²)\tFloods'];
                rows.push([etiquette(nous) + ' (nous)', t.butin, t.nButin].join('\t'));
                rows.push(['Autres', t.vol, t.nVol].join('\t'));
                rows.push(['Bilan notre alliance', t.net, t.floods].join('\t'));
                rows.push('');
                rows.push('Auteur\tAlliance\tRécupéré (cm²)\tVolé (cm²)\tNet (cm²)\tFloods');
                last.players.forEach(function (r) { rows.push([r.name, etiquette(r.tag), r.butin, -r.vol, r.net, r.n].join('\t')); });
                copyText(rows.join('\n'), document.getElementById('tdc-copy'), 'Copier Bilan');
            }
            function openPanel() {
                var p = document.getElementById('tdc-panel');
                if (!p) {
                p = document.createElement('div');
                p.id = 'tdc-panel';
                p.innerHTML = '<div class="tdc-head"><strong>Bilan TdC</strong><span>' +
                    '<button type="button" id="tdc-refresh">Actualiser</button> ' +
                    '<button type="button" id="tdc-copy">Copier Bilan</button> ' +
                    '<button type="button" id="tdc-close">Fermer</button></span></div><div class="tdc-body" id="tdc-body"></div>';
                document.body.appendChild(p);
                document.getElementById('tdc-refresh').addEventListener('click', refresh);
                document.getElementById('tdc-copy').addEventListener('click', copyTable);
                document.getElementById('tdc-close').addEventListener('click', function () { p.style.display = 'none'; });
                document.getElementById('tdc-body').addEventListener('change', function (e) {
                    if (e.target.id === 'tdc-nous') { nous = e.target.value; ecrireNous('t:' + nous); draw(); return; }
                    if (e.target.matches('.tdc-affiliation')) {
                        const cle = Commun.norm(e.target.dataset.pseudo);
                        if (e.target.value === 'nous') corrections.set(cle, nous);
                        else if (e.target.value === 'autre') corrections.set(cle, '__autre__');
                        else corrections.delete(cle);
                        draw();
                        return;
                    }
                    var i = e.target.getAttribute && e.target.getAttribute('data-i');
                    if (i === null || i === undefined) return;
                    if (e.target.checked) excluded.delete(+i); else excluded.add(+i);
                    draw();
                });
                }
                p.style.display = 'flex';
                refresh();
            }
            MenuOutils.ajouter('fz_boutonBilanTdC', 'Bilan TdC', openPanel);
        }
    }
    class DonneesJoueur {
        static CACHE_KEY = 'fz_donnees_joueur';
        static CACHE_MS = 60 * 60 * 1000;
        static POSITION_MS = 7 * 24 * 60 * 60 * 1000;
        static PROFIL_MS = 60 * 60 * 1000;
        static requetes = new Map();
        static lireCache() {
            try {
                const cache = JSON.parse(localStorage.getItem(this.CACHE_KEY));
                return cache && cache.pseudo === Commun.pseudo ? cache : {pseudo: Commun.pseudo};
            } catch (e) {
                return {pseudo: Commun.pseudo};
            }
        }
        static enregistrer(champ, valeur) {
            const cache = this.lireCache();
            cache[champ] = {t: Date.now(), valeur};
            try {
                localStorage.setItem(this.CACHE_KEY, JSON.stringify(cache));
            } catch (e) {}
            return valeur;
        }
        static valide(entree, duree = this.CACHE_MS) {
            return entree && Number.isFinite(entree.t)
                && Date.now() - entree.t >= 0
                && Date.now() - entree.t < duree;
        }
        static niveaux(doc) {
            const lignes = [...doc.querySelectorAll('.ligneAmelioration')];
            if (!lignes.length) return null;
            const valeurs = lignes.map((ligne) => {
                const element = ligne.querySelector('.niveau_amelioration');
                const m = element && element.textContent.match(/\d+/);
                return m ? Number(m[0]) : 0;
            });
            return valeurs;
        }
        static position(doc) {
            const liens = [...doc.querySelectorAll("a[href*='carte2.php']")];
            const texte = liens.map((a) => a.textContent + ' ' + a.getAttribute('href')).join(' ');
            const m = texte.match(/x\s*=\s*(\d+)\D+?y\s*=\s*(\d+)/i)
                || (doc.body?.textContent || '').match(/x\s*=\s*(\d+)\s*et\s*y\s*=\s*(\d+)/i);
            return m ? {x: Number(m[1]), y: Number(m[2])} : null;
        }
        static profilDepuisDocument(doc) {
            const lien = doc.querySelector(".boite_membre a[href^='carte2.php?']")
                || doc.querySelector("a[href*='carte2.php']");
            let m = lien && lien.textContent.match(/x\s*=\s*(\d+)\D+?y\s*=\s*(\d+)/);
            if (!m && lien) m = (lien.getAttribute('href') || '').match(/x=(\d+)\D+?y=(\d+)/);
            if (!m) m = (doc.body?.textContent || '').match(/x\s*=\s*(\d+)\s*et\s*y\s*=\s*(\d+)/i);
            if (!m) return null;
            const lignes = doc.querySelectorAll('.tableau_score tr');
            const terrain = lignes[1]?.querySelectorAll('td')[1];
            const commerce = doc.querySelector("a[href^='commerce.php?ID=']");
            const id = commerce?.getAttribute('href')?.match(/\d+/)?.[0] || null;
            return {
                x: Number(m[1]), y: Number(m[2]),
                terrain: terrain ? Commun.nombre(terrain.textContent) : 0,
                id
            };
        }
        static cleProfil(pseudo) {
            return Commun.norm(pseudo);
        }
        static enregistrerProfil(pseudo, profil) {
            if (!pseudo || !profil) return;
            const cle = this.cleProfil(pseudo);
            const cache = this.lireCache();
            const profils = cache.profils || {};
            profils[cle] = {t: Date.now(), valeur: profil};
            cache.profils = profils;
            try { localStorage.setItem(this.CACHE_KEY, JSON.stringify(cache)); } catch (e) {}
            if (cle === this.cleProfil(Commun.pseudo)) {
                this.enregistrer('position', {x: profil.x, y: profil.y});
            }
        }
        static profil(pseudo) {
            const cle = this.cleProfil(pseudo);
            const entree = this.lireCache().profils?.[cle];
            if (this.valide(entree, this.PROFIL_MS)) return Promise.resolve(entree.valeur);
            const requeteCle = 'profil:' + cle;
            if (this.requetes.has(requeteCle)) return this.requetes.get(requeteCle);
            const requete = fetch('/Membre.php?Pseudo=' + encodeURIComponent(pseudo), {
                credentials: 'same-origin'
            }).then((r) => {
                if (!r.ok) throw new Error('Profil HTTP ' + r.status);
                return r.text();
            }).then((html) => {
                if (html.includes('Aucun joueurs avec le pseudo')) throw new Error('profil');
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const profil = this.profilDepuisDocument(doc);
                if (!profil) throw new Error('profil');
                this.enregistrerProfil(pseudo, profil);
                return profil;
            }).finally(() => this.requetes.delete(requeteCle));
            this.requetes.set(requeteCle, requete);
            return requete;
        }
        static lirePage(champ, chemin, extracteur) {
            const cache = this.lireCache()[champ];
            if (this.valide(cache, champ === 'position' ? this.POSITION_MS : this.CACHE_MS)) return Promise.resolve(cache.valeur);
            if (this.requetes.has(champ)) return this.requetes.get(champ);
            const requete = fetch(chemin, {credentials: 'same-origin'})
                .then((r) => {
                    if (!r.ok) throw new Error('HTTP ' + r.status + ' : ' + chemin);
                    return r.text();
                })
                .then((html) => {
                    const doc = new DOMParser().parseFromString(html, 'text/html');
                    const valeur = extracteur.call(this, doc);
                    if (!valeur) throw new Error('Données introuvables : ' + chemin);
                    return this.enregistrer(champ, valeur);
                })
                .finally(() => this.requetes.delete(champ));
            this.requetes.set(champ, requete);
            return requete;
        }
        static construction() {
            return this.lirePage('construction', '/construction.php', this.niveaux);
        }
        static laboratoire() {
            return this.lirePage('laboratoire', '/laboratoire.php', this.niveaux);
        }
        static coordonnees() {
            return this.lirePage('position', '/Membre.php?Pseudo=' + encodeURIComponent(Commun.pseudo), this.position);
        }
        static reprendrePageOuverte() {
            const chemin = location.pathname.toLowerCase();
            if (chemin === '/construction.php') {
                const niveaux = this.niveaux(document);
                if (niveaux) this.enregistrer('construction', niveaux);
            } else if (chemin === '/laboratoire.php') {
                const niveaux = this.niveaux(document);
                if (niveaux) this.enregistrer('laboratoire', niveaux);
            } else if (chemin === '/membre.php') {
                const params = new URLSearchParams(location.search);
                const pseudo = params.get('Pseudo') || Commun.pseudo;
                const profil = this.profilDepuisDocument(document);
                if (profil && pseudo) this.enregistrerProfil(pseudo, profil);
            }
        }
    }
    class Chasseurs {
        static init() {
            "use strict";
            /* ---------------- Reglages ---------------- */
            var ID_SUJET = "404937";                         // sujet forum "Position dans la chienne..." (ID du topic)
            var COULEUR_ROUGE = "rgba(220, 60, 60, 0.45)";   // retours postes
            var COULEUR_VERT  = "rgba(60, 180, 75, 0.45)";   // a flooder (au-dessus de moi)
            var TOUJOURS = false;                            // true = colorier la page Membres meme sans le bouton Chasseurs
            var METHODE_FLOOD_DEFAUT = 1;                    // page Attaquer : 0 Standard, 1 Optimisee, 2 Uniforme, 3 Degressive
            var UNITE_SONDE = 1;                             // page Attaquer : nombre d'unites envoyees par le bouton "Sonder" (1re unite disponible)
            /* ---------------- Analyse du message (fonctions pures) ---------------- */
            class AnalyseChasseurs {
                static analyser(texte){
                    var res = {file: [], retours: []}, section = "file";
                    var re = /^\s*(⬆️?|↑)?\s*(.+?)\s*:\s*([\d ]+?)\s*cm\s*(?:²|2)\s*le\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i;
                    String(texte).replace(/[   ]/g, " ").split(/\r?\n/).forEach(function(ligne){
                        if (/retours?\s+post/i.test(ligne)){ section = "retours"; return; }
                        if (/historique/i.test(ligne)){ section = "historique"; return; }
                        var m = ligne.match(re);
                        if (!m || !res[section]) return;
                        res[section].push({pseudo: m[2].trim(), fleche: !!m[1]});
                    });
                    return res;
                }
                static classer(donnees, moi){
                    var rouge = {}, vert = {}, rangs = {}, numero = 0, me = String(moi).trim().toLowerCase();
                    donnees.retours.forEach(function(j){ rouge[j.pseudo.toLowerCase()] = true; });
                    var idx = -1;
                    donnees.file.forEach(function(j, i){ if (idx < 0 && j.pseudo.toLowerCase() == me) idx = i; });
                    var fin = idx >= 0 ? idx : donnees.file.length;   // pas dans la liste = virtuellement tout en bas
                    donnees.file.slice(0, fin).forEach(function(j){
                        var p = j.pseudo.toLowerCase();
                        if (j.fleche && !rouge[p] && !vert[p]) {
                            vert[p] = true;
                            rangs[p] = ++numero;
                        }
                    });
                    return {rouge: rouge, vert: vert, rangs: rangs, trouve: idx >= 0};
                }
            }
            const analyser = AnalyseChasseurs.analyser.bind(AnalyseChasseurs);
            const classer = AnalyseChasseurs.classer.bind(AnalyseChasseurs);
            /* ---------------- fin fonctions pures ---------------- */
            var pseudoEl = document.querySelector("#pseudo");
            if (!pseudoEl) return;   // pas connecte
            var MOI = pseudoEl.textContent.trim();
            const nombre = Commun.nombre;
            MenuOutils.ajouter('fz_boutonChasseurs', 'Chasseurs', null, 'alliance.php?Membres#chasseurs');
            /* ---------------- Page Armee : total des troupes + stats (reprise d'Outiiil) ----------------
            - Total des unites dans le titre "Troupes en Garnison (...)"
            - Lignes Vie / Degats en Attaque / Degats en Defense (avec bonus), Consommation journaliere
                (clic sur une ligne = bascule avec/sans bonus : AB / HB)
            - Temps HOF et temps relatif
            Les niveaux (bouclier, armes, ponte) sont lus sur laboratoire.php et construction.php (cache 10 min). */
            const COUT_UNITE = Commun.UNITES.COUT;       // JSN ... TE
            const VIE_UNITE = Commun.UNITES.VIE;
            const ATT_UNITE = Commun.UNITES.ATT;
            const DEF_UNITE = Commun.UNITES.DEF;
            const TEMPS_UNITE = Commun.UNITES.TEMPS;
            var NOMS_METHODE = ["Standard", "Optimisée", "Uniforme", "Dégressive"];
            var ORDRE_POST = [1, 2, 3, 4, 5, 6, 14, 7, 8, 9, 10, 13, 11, 12];   // rang interne de l'unite -> champ uniteN du formulaire
            var MOIS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
            var IMG_VIE    = "<img src='images/icone/icone_coeur.gif' height='18' width='18' style='vertical-align:middle'>";
            var IMG_POMME  = "<img src='images/icone/icone_pomme.gif' alt='Nourriture' title='Consommation Journalière' height='18' style='vertical-align:middle'>";
            var IMG_ATT_A  = "<img src='images/icone/icone_degat_attaque.gif' alt='Dégâts en attaque :' title='Dégâts en attaque :' height='18' style='vertical-align:middle'>";
            var IMG_DEF_A  = "<img src='images/icone/icone_degat_defense.gif' alt='Dégâts en défense :' title='Dégâts en défense :' height='18' style='vertical-align:middle'>";
            class CalculArmee {
                static formater(n){ return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
                static sommeStat(unites, tab){ return Commun.sommeStat(unites, tab); }
                static sommeUnites(unites){ return unites.reduce(function(acc, v){ return acc + Math.ceil(v); }, 0); }
                static tempsPonte(unites, tdp){ return unites.reduce(function(acc, v, i){ return acc + v * TEMPS_UNITE[i] * Math.pow(0.9, tdp); }, 0); }
                static consommation(unites, lieu){ return sommeStat(unites, COUT_UNITE) * 0.05 * lieu; }
                static vieTotale(unites, bouclier, lieu, niveauLieu){
                    var base = sommeStat(unites, VIE_UNITE), v = base + Math.round(base * bouclier / 10);
                    if (lieu == 1) v += Math.round(base * ((niveauLieu + 2) / 20));        // Dome
                    else if (lieu == 2) v += Math.round(base * (((niveauLieu + 2) * 3) / 20)); // Loge
                    return v;
                }
                static statTotale(unites, tab, armes){ var base = sommeStat(unites, tab); return base + Math.round(base * armes / 10); }
                static dureeCourte(sec){
                    sec = Math.floor(sec);
                    if (!(sec > 0)) return "0 sec";
                    var a = Math.floor(sec / 31556952); sec -= a * 31556952;
                    var j = Math.floor(sec / 86400);    sec -= j * 86400;
                    var h = Math.floor(sec / 3600);     sec -= h * 3600;
                    var m = Math.floor(sec / 60);       sec -= m * 60;
                    var p = [];
                    if (a) p.push(a + "A"); if (j) p.push(j + "J"); if (h) p.push(h + "h"); if (m) p.push(m + "m"); if (sec) p.push(sec + "s");
                    if (p.length > 4) return p.slice(0, p.length - 3).join(" ");
                    if (p.length > 3) return p.slice(0, p.length - 2).join(" ");
                    if (p.length > 2) return p.slice(0, p.length - 1).join(" ");
                    return p.join(" ");
                }
            }
            const formater = CalculArmee.formater.bind(CalculArmee);
            const sommeStat = CalculArmee.sommeStat.bind(CalculArmee);
            const sommeUnites = CalculArmee.sommeUnites.bind(CalculArmee);
            const tempsPonte = CalculArmee.tempsPonte.bind(CalculArmee);
            const consommation = CalculArmee.consommation.bind(CalculArmee);
            const vieTotale = CalculArmee.vieTotale.bind(CalculArmee);
            const statTotale = CalculArmee.statTotale.bind(CalculArmee);
            const dureeCourte = CalculArmee.dureeCourte.bind(CalculArmee);
            /* Duree facon Outiiil : "3015193A 197J" (annees de 365,2425 j, on garde au plus les 2 plus grosses unites) */
            function lireNiveaux() {
                return Promise.all([
                    DonneesJoueur.construction(),
                    DonneesJoueur.laboratoire()
                ]).then(([constr, rech]) => ({constr, rech}));
            }
            function pageArmee(){
                var rows = Array.prototype.slice.call(document.querySelectorAll(".simulateur tr[align=center]"), 0, 14);
                if (rows.length < 14 || document.getElementById("fz_statsArmee")) return;
                var tdc = [], dome = [], loge = [];
                rows.forEach(function(tr, i){
                    var tds = Array.prototype.slice.call(tr.children);
                    var sp = tr.querySelector("td:nth-child(3) span");
                    tdc[i] = sp ? nombre(sp.textContent) : 0;
                    var d = 0;
                    tds.slice(3, tds.length - 2).forEach(function(td){ var v = nombre(td.textContent); if (v) d = v; });
                    dome[i] = d;
                    loge[i] = tds.length >= 2 ? nombre(tds[tds.length - 2].textContent) : 0;
                });
                /* 1. Total dans le titre */
                var h3 = document.querySelector("h3");
                if (h3 && !h3.getAttribute("data-fz-total")){
                    h3.setAttribute("data-fz-total", "1");
                    h3.appendChild(document.createTextNode(" (" + formater(sommeUnites(tdc) + sommeUnites(dome) + sommeUnites(loge)) + ")"));
                }
                /* 2. Lignes de stats */
                var plus = document.querySelector("#menuComptePlus a.boutonStatJoueur");
                var estPlus = plus && plus.textContent.trim() == "Stat";
                var texte = (document.querySelector(".simulateur") || document.body).textContent;
                var mD = texte.match(/D[ôo]me\s*\((\d+)\)/i), mL = texte.match(/Loge\s*\((\d+)\)/i);
                var nivDome = mD ? parseInt(mD[1], 10) : 0, nivLoge = mL ? parseInt(mL[1], 10) : 0;
                lireNiveaux().then(function(n){
                    if (document.getElementById("fz_statsArmee")) return;
                    var bouclier = n.rech[1] || 0, armes = n.rech[2] || 0, tdp = (n.constr[3] || 0) + (n.constr[4] || 0) + (n.rech[0] || 0);
                    var dernier = rows[rows.length - 1];
                    function ligne(html, cache){
                        var tr = document.createElement("tr");
                        tr.setAttribute("align", "center");
                        tr.className = "fz_statsArmee";
                        if (cache) tr.style.display = "none";
                        tr.innerHTML = html;
                        dernier.parentNode.insertBefore(tr, dernier.nextSibling);
                        dernier = tr;
                        return tr;
                    }
                    function bloc(titre, img, calcAB, calcHB){
                        var ab = ligne("<td>" + titre + " (AB)</td>" + [0, 1, 2].map(function(l){ return "<td colspan=3>" + img + " " + formater(calcAB(l)) + "</td>"; }).join(""));
                        var hb = ligne("<td>" + titre + " (HB)</td>" + [0, 1, 2].map(function(l){ return "<td colspan=3>" + img + " " + formater(calcHB(l)) + "</td>"; }).join(""), true);
                        [ab, hb].forEach(function(tr){ tr.style.cursor = "pointer"; tr.addEventListener("click", function(){
                            ab.style.display = ab.style.display == "none" ? "" : "none";
                            hb.style.display = hb.style.display == "none" ? "" : "none";
                        }); });
                    }
                    var arm = [tdc, dome, loge], niv = [0, nivDome, nivLoge];
                    if (!estPlus){
                        bloc("Vie", IMG_VIE, function(l){ return vieTotale(arm[l], bouclier, l, niv[l]); }, function(l){ return sommeStat(arm[l], VIE_UNITE); });
                        bloc("Dégâts en Attaque", IMG_ATT_A, function(l){ return statTotale(arm[l], ATT_UNITE, armes); }, function(l){ return sommeStat(arm[l], ATT_UNITE); });
                        bloc("Dégâts en Défense", IMG_DEF_A, function(l){ return statTotale(arm[l], DEF_UNITE, armes); }, function(l){ return sommeStat(arm[l], DEF_UNITE); });
                        ligne("<td>Consommation Journalière</td>" + [0, 1, 2].map(function(l){ return "<td colspan=3>" + IMG_POMME + " " + formater(consommation(arm[l], l + 1)) + "</td>"; }).join(""));
                    }
                    var tous = tdc.map(function(v, i){ return v + dome[i] + loge[i]; });
                    var tr = ligne("<td colspan=10>Temps <span style='font-weight:bold' title='Hall Of Fame'>HOF : " + dureeCourte(tempsPonte(tous, 0))
                        + "</span>, Temps relatif : <span style='font-weight:bold'>" + dureeCourte(tempsPonte(tous, tdp)) + "</span></td>");
                    tr.id = "fz_statsArmee";
                    tr.removeAttribute("align");
                }).catch(function(e){ console.error("Chasseurs : stats armée", e); });
            }
            /* ---------------- Page Attaquer : Synchroniser / Sonder / Lanceur de Flood (reprise d'Outiiil) ----------------
            Page : ennemie.php?Attaquer=ID
            - Boutons Synchroniser et Sonder : attend la seconde 00 de l'arrivee (rapport de combat a la minute pile)
            - Heure de retour de l'armee (+ heure du RC arrondie a la minute)
            - Lanceur de Flood : methodes Standard / Optimisee / Uniforme / Degressive, antisonde, "Supp." (place le reste)
            Aucune dependance : pas besoin d'Outiiil ni de jQuery. Si Outiiil est actif sur la page, on ne fait rien. */
            class CalculFlood {
                static SECONDE_CIBLE = 58.500;
                static pad2(n){ return (n < 10 ? "0" : "") + n; }
                static dateCourte(d, secondes){
                    return d.getDate() + " " + MOIS_FR[d.getMonth()] + " à " + pad2(d.getHours()) + "h" + pad2(d.getMinutes()) + (secondes ? "m" + pad2(d.getSeconds()) + "s" : "");
                }
                static dateRC(sec){   /* arrondi a la minute superieure, comme Outiiil */
                    var d = new Date(Date.now() + sec * 1000 + 60000); d.setSeconds(0, 0); return dateCourte(d, false);
                }
                static dureeComplete(sec){
                    sec = Math.floor(sec);
                    if (!(sec > 0)) return "0 sec";
                    var a = Math.floor(sec / 31556952); sec -= a * 31556952;
                    var j = Math.floor(sec / 86400);    sec -= j * 86400;
                    var h = Math.floor(sec / 3600);     sec -= h * 3600;
                    var m = Math.floor(sec / 60);       sec -= m * 60;
                    var p = [];
                    if (a) p.push(a + "A"); if (j) p.push(j + "J"); if (h) p.push(h + "h"); if (m) p.push(m + "m"); if (sec) p.push(sec + "s");
                    return p.join(" ");
                }
                static tempsTrajet(vitesseAttaque, a, b){
                    var dist = Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
                    return Math.ceil(Math.pow(0.9, vitesseAttaque) * 637200 * (1 - Math.exp(-(dist / 350))));
                }
                static attenteSynchro(trajet) {
                    const seconde = new Date( Date.now() + trajet * 1000 ).getSeconds(); const attente = (this.SECONDE_CIBLE - seconde + 60) % 60;
                    return attente === 0 ? 60 : attente;
                }                
                static attaqueAutorisee(attaquant, cible) {
                    return attaquant >= Math.floor(cible / 3) + 1
                        && attaquant <= cible * 2;
                }
                static simulerFlood(unites, tdcAtt, tdcCible, methode, attaques, tdcUniforme, reste, indSupp){
                    var floods = [], d = {att: tdcAtt, cible: tdcCible, unite: sommeUnites(unites), reste: reste};
                    function poser(prise, priseMax) { if (!attaqueAutorisee(d.att, d.cible)) { return false; } floods.push(prise); d.att += priseMax; d.cible -= priseMax; d.unite -= prise; d.reste--; return true; } /* antisonde (toujours presente pour garder l'ordre) */
                    if (attaques[0]){
                        var pm = Math.min(attaques[0], Math.floor(d.cible * 0.2));
                        d.att += pm; d.cible -= pm; d.unite -= attaques[0]; d.reste--;
                    }
                    floods.push(attaques[0]);
                    if (d.unite > 0){
                        var prise, i, n;
                        if (methode == 0){          /* standard : valeurs saisies */
                            for (i = 1; i < attaques.length; i++){
                                prise = Math.min(d.unite, attaques[i]);
                                poser(prise, Math.min(prise, Math.floor(d.cible * 0.2)));
                                if (d.unite <= 0 || d.reste == 0) break;
                            }
                        }else if (methode == 1){    /* optimisee : -20% -20% -20% puis limite puis dernier */
                            while(d.att < Math.floor(d.cible * 1.4) && d.reste > 0){
                                prise = Math.min(d.unite, Math.floor(d.cible * 0.2));
                                if (!poser(prise, prise)) break;
                                if (d.unite <= 0) break;
                            }
                            if (d.unite > 0 && d.reste > 1){
                                var limite = Math.floor((d.cible * 2 - d.att) / 3) - 1;
                                limite = limite && d.unite >= limite ? limite : d.unite;
                                poser(limite, limite);
                            }
                            if (d.unite > 0 && d.reste > 0){
                                prise = Math.min(d.unite, Math.floor(d.cible * 0.2));
                                poser(prise, prise);
                            }
                        }else if (methode == 2){    /* uniforme */
                            for (i = 0, n = d.reste; i < n; i++){
                                prise = Math.min(d.unite, tdcUniforme);
                                poser(prise, Math.min(prise, Math.floor(d.cible * 0.2)));
                                if (d.unite <= 0) break;
                            }
                        }else if (methode == 3){    /* degressive */
                            for (i = 0, n = d.reste; i < n; i++){
                                prise = Math.min(d.unite, Math.floor(d.cible * 0.2));
                                poser(prise, prise);
                                if (d.unite <= 0) break;
                            }
                        }
                    }
                    /* unites restantes placees sur l'attaque cochee */
                    if (indSupp > 0 && d.unite > 0 && indSupp < floods.length) floods[indSupp] += d.unite;
                    return floods;
                }
                static repartirFlood(unites, floods){
                    var dispo = unites.slice(), rep = [];
                    floods.forEach(function(f, i){
                        var reste = f; rep[i] = [];
                        for (var j = 0; j < 14; j++){
                            var t = (reste > 0 && dispo[j] > 0) ? Math.min(dispo[j], reste) : 0;
                            rep[i][j] = t; reste -= t; dispo[j] -= t;
                        }
                    });
                    return rep;
                }
            }
            const pad2 = CalculFlood.pad2.bind(CalculFlood);
            const dateCourte = CalculFlood.dateCourte.bind(CalculFlood);
            const dateRC = CalculFlood.dateRC.bind(CalculFlood);
            const dureeComplete = CalculFlood.dureeComplete.bind(CalculFlood);
            const tempsTrajet = CalculFlood.tempsTrajet.bind(CalculFlood);
            const attenteSynchro = CalculFlood.attenteSynchro.bind(CalculFlood);
            const attaqueAutorisee = CalculFlood.attaqueAutorisee.bind(CalculFlood);
            const simulerFlood = CalculFlood.simulerFlood.bind(CalculFlood);
            const repartirFlood = CalculFlood.repartirFlood.bind(CalculFlood);
            /* --- Simulation de flood (fonctions pures, reprises d'Outiiil) ---
            unites : tableau de 14 quantites dans l'ordre interne (voir ORDRE_POST)
            attaques[0] = antisonde, puis les attaques saisies (utilisees seulement par la methode Standard) */
            /* --- Profils (position + terrain) --- */
            class ProfilsFourmizzz {
                static extraireProfil(html){
                    var doc = new DOMParser().parseFromString(html, "text/html");
                    var lien = doc.querySelector(".boite_membre a[href^='carte2.php?']") || doc.querySelector("a[href*='carte2.php']");
                    var m = lien && lien.textContent.match(/x\s*=\s*(\d+)\D+?y\s*=\s*(\d+)/);
                    if (!m && lien) m = (lien.getAttribute("href") || "").match(/x=(\d+)\D+?y=(\d+)/);
                    if (!m) m = doc.body.textContent.match(/x\s*=\s*(\d+)\s*et\s*y\s*=\s*(\d+)/i);
                    if (!m) m = html.match(/x\s*=\s*(\d+)\s*(?:et|&|&)\s*y\s*=\s*(\d+)/i);
                    if (!m) return null;
                    var tds = doc.querySelectorAll(".tableau_score tr");
                    var tdTer = tds[1] && tds[1].querySelectorAll("td")[1];
                    var com = doc.querySelector("a[href^='commerce.php?ID=']"), idm = com && com.getAttribute("href").match(/\d+/);
                    return {x: parseInt(m[1], 10), y: parseInt(m[2], 10), terrain: tdTer ? nombre(tdTer.textContent) : 0, id: idm ? idm[0] : null};
                }
                static lireProfil(pseudo) {
                    return DonneesJoueur.profil(pseudo);
                }
                static lireMaPosition() {
                    return DonneesJoueur.coordonnees().catch(function() {
                        try {
                            const ancien = JSON.parse(localStorage.getItem('fz_chasseurs_moi'));
                            if (ancien && ancien.pseudo === MOI && Number.isFinite(ancien.x) && Number.isFinite(ancien.y))
                                return DonneesJoueur.enregistrer('position', {x: ancien.x, y: ancien.y});
                        } catch (e) {}
                        try {
                            const ancien = JSON.parse(localStorage.getItem('outiiil_joueur'));
                            if (ancien && Number.isFinite(ancien.x) && Number.isFinite(ancien.y))
                                return DonneesJoueur.enregistrer('position', {x: ancien.x, y: ancien.y});
                        } catch (e) {}
                        const saisie = prompt('Chasseurs : position introuvable. Entrez x,y :');
                        const m = saisie && saisie.match(/(\d+)\D+(\d+)/);
                        if (!m) throw new Error('profil');
                        return DonneesJoueur.enregistrer('position', {x: Number(m[1]), y: Number(m[2])});
                    });
                }
            }
            const extraireProfil = ProfilsFourmizzz.extraireProfil.bind(ProfilsFourmizzz);
            const lireProfil = ProfilsFourmizzz.lireProfil.bind(ProfilsFourmizzz);
            const lireMaPosition = ProfilsFourmizzz.lireMaPosition.bind(ProfilsFourmizzz);
            function pageAttaquer(){
                function erreur(msg){
                    console.error("Chasseurs : page attaque -", msg);
                    var d = document.createElement("div");
                    d.style.cssText = "color:#a94442;background:#f2dede;font:12px Arial,sans-serif;padding:4px 8px;margin:4px;text-align:center";
                    d.textContent = "Chasseurs (flood) : " + msg;
                    var c = document.getElementById("centre") || document.body;
                    c.insertBefore(d, c.firstChild);
                }
                if (document.getElementById("o_btnSynchro") || document.getElementById("o_prepaFlood") || document.getElementById("fz_prepaFlood")){
                    if (!document.getElementById("fz_prepaFlood")) erreur("Outiiil est actif sur cette page : désactivez-le pour utiliser le lanceur de ce script.");
                    return;
                }
                var tab = document.getElementById("tabChoixArmee"), form = document.getElementById("formulaireChoixArmee");
                var champCible = document.querySelector("input[name=pseudoCible]");
                var btn = document.querySelector("input[name='ChoixArmee']");
                var simulateur = document.querySelector(".simulateur");
                var manque = [!tab && "#tabChoixArmee", !form && "#formulaireChoixArmee", !champCible && "pseudoCible", !btn && "bouton ChoixArmee", !simulateur && ".simulateur"].filter(Boolean);
                if (manque.length){ erreur("éléments introuvables : " + manque.join(", ")); return; }
                var pseudoCible = champCible.value;
                var champUnite = function(i){ return document.getElementById("unite" + i); };
                /* armee dans l'ordre interne */
                function lireArmee(){
                    return ORDRE_POST.map(function(p){ var el = champUnite(p); return el ? nombre(el.value) : 0; });
                }
                var armee = lireArmee();
                /* nombre d'attaques encore possibles (vitesse d'attaque + 1 - attaques deja en route) */
                var enRoute = (document.getElementById("centre") || document.body).textContent.split(/- Vous allez attaquer|- Des renforts arrivent/g).length;
                Promise.all([
                    lireNiveaux().catch(function(){ return {rech: []}; }),
                    lireMaPosition().catch(function(){ throw "position de votre compte introuvable (profil)"; }),
                    lireProfil(pseudoCible).catch(function(){ throw "profil de la cible introuvable (" + pseudoCible + ")"; })
                ]).then(function(r){
                    if (document.getElementById("o_prepaFlood") || document.getElementById("o_btnSynchro") || document.getElementById("fz_prepaFlood")){
                        erreur("Outiiil est actif sur cette page : désactivez-le pour utiliser le lanceur de ce script.");
                        return;
                    }
                    construireAttaque(r[0].rech[6] || 0, r[1], r[2], pseudoCible, armee, lireArmee, champUnite, btn, form, simulateur, enRoute);
                }).catch(function(e){ erreur(typeof e == "string" ? e : "erreur " + (e && e.message || e)); });
            }
            function construireAttaque(va, moi, cible, pseudoCible, armee, lireArmee, champUnite, btn, form, simulateur, enRoute){
                var nbAttaque = va + 2 - enRoute;                      // nombre d'etapes possibles + 1 (rang 0 = antisonde)
                var trajet = tempsTrajet(va, moi, cible);
                var mienTdc = nombre((document.getElementById("quantite_tdc") || {}).textContent);
                var idCible = (location.search.match(/Attaquer=(\d+)/) || [])[1] || cible.id;
                var methodeInit = METHODE_FLOOD_DEFAUT;
                /* ---- styles ---- */
                var st = document.createElement("style");
                st.textContent = "#fz_btnSynchro,#fz_btnLancer{display:inline-block}#fz_btnLancer{float:right}"
                    + ".fz_btn{cursor:pointer;font-size:1.1em;padding:6px 20px;border:1px solid transparent;transition:box-shadow .5s ease-in-out}.fz_btn:hover{box-shadow:inset 0 0 10px 0 #aba}"
                    + ".fz_ok{color:#3c763d;background:#dff0d8;border-color:#94c58b}.fz_ko{color:#a94442;background:#f2dede;border-color:#d79a9a}.fz_info{color:#31708f;background:#d9edf7;border-color:#83bbd3}"
                    + "#fz_synchro{margin-top:10px}#fz_sonder{margin-left:10px}"
                    + "#fz_simulationFlood{width:100%;border-collapse:collapse}#fz_simulationFlood tr{height:22px}#fz_simulationFlood input,#fz_simulationFlood select{max-width:100%;box-sizing:border-box}"
                    + "#fz_simulationFlood input[type=number]{width:100%;min-width:0}.fz_lien{text-decoration:underline;cursor:pointer}"
                    + "#fz_simulationFlood tr.fz_vert td{color:green!important}#fz_simulationFlood tr.fz_rouge td{color:#c5130f!important}"
                    + "#fz_msgFlood{font-size:.9em;color:#a94442;min-height:1em}";
                document.head.appendChild(st);
                /* ---- Synchroniser / Sonder + heure de retour ---- */
                var parent = btn.parentNode;
                if (parent && /^(P|CENTER|DIV)$/.test(parent.tagName) && parent !== form && parent.querySelectorAll("input[type=text],textarea,select").length == 0){
                    while(parent.firstChild) parent.parentNode.insertBefore(parent.firstChild, parent);   // equivalent de jQuery unwrap
                    parent.parentNode.removeChild(parent);
                }
                var wrapLancer = document.createElement("div");
                wrapLancer.id = "fz_btnLancer";
                btn.parentNode.insertBefore(wrapLancer, btn);
                wrapLancer.appendChild(btn);
                var wrapSynchro = document.createElement("div");
                wrapSynchro.id = "fz_btnSynchro";
                wrapSynchro.innerHTML = '<button id="fz_synchro" type="button" class="fz_btn fz_info">Synchroniser</button><button id="fz_sonder" type="button" class="fz_btn fz_ko">Sonder</button>';
                wrapLancer.parentNode.insertBefore(wrapSynchro, wrapLancer);
                var retour = document.createElement("p");
                retour.className = "centre reduce ligne_paire";
                retour.style.textAlign = "center";
                retour.innerHTML = 'Votre armée rentrera le <span id="fz_retourArmee" class="gras" style="font-weight:bold"></span> (RC : <span id="fz_retourArmeeRC" class="gras" style="font-weight:bold"></span>).';
                wrapLancer.parentNode.insertBefore(retour, wrapLancer.nextSibling);
                function majRetour(){
                    document.getElementById("fz_retourArmee").textContent = dateCourte(new Date(Date.now() + trajet * 1000), true);
                    document.getElementById("fz_retourArmeeRC").textContent = dateRC(trajet);
                }
                majRetour(); setInterval(majRetour, 1000);
                var synchroEnCours = false;
                function lancerSynchro(attente){
                    if (synchroEnCours) return;
                    synchroEnCours = true;
                    var fs = form.querySelectorAll("fieldset")[1] || form;
                    var p = document.createElement("p");
                    p.style.textAlign = "center";
                    p.innerHTML = "Synchronisation en cours, veuillez attendre : <span id='fz_decSync'></span>.";
                    fs.appendChild(p);
                    var reste = attente;
                    (function tick(){
                        document.getElementById("fz_decSync").textContent = dureeComplete(reste);
                        if (reste-- > 0) setTimeout(tick, 1000);
                    })();
                    setTimeout(function(){ btn.click(); }, attente * 1000);
                }
                document.getElementById("fz_synchro").addEventListener("click", function(e){
                    e.preventDefault();
                    lancerSynchro(attenteSynchro(trajet));
                });
                document.getElementById("fz_sonder").addEventListener("click", function(e){
                    e.preventDefault();
                    var premiere = true, lieu = document.getElementById("lieu");
                    if (lieu) lieu.value = 3;
                    for (var i = 1; i < 15; i++){
                        var el = champUnite(i);
                        if (el){ el.value = premiere ? UNITE_SONDE : 0; premiere = false; }
                    }
                    lancerSynchro(attenteSynchro(trajet));
                });
                /* ---- Lanceur de Flood ---- */
                var opts = NOMS_METHODE.map(function(n, i){ return "<option value='" + i + "'" + (i == methodeInit ? " selected" : "") + ">" + n + "</option>"; }).join("");
                var fs = document.createElement("fieldset");
                fs.id = "fz_prepaFlood";
                fs.style.textAlign = "center";
                fs.innerHTML = "<legend id='fz_toggleFlood' style='cursor:pointer;user-select:none'>"
                    + "<span class='titre'><span id='fz_flecheFlood'>▶</span> Lanceur de Flood</span></legend>"                    
                    + "<table id='fz_simulationFlood' cellspacing=0>"
                    + "<tr class='gras' style='font-weight:bold'><td>Etape</td><td>Troupes</td><td>Supp.*</td><td>Mon Terrain</td><td id='fz_nomCible'></td></tr>"
                    + "<tr><td><select id='fz_methodeFlood'>" + opts + "</select></td><td colspan='2'></td>"
                    +   "<td><input type='number' min='0' step='1' inputmode='numeric' id='fz_floodTDCA' value='" + mienTdc + "'/></td>"
                    +   "<td><input type='number' min='0' step='1' inputmode='numeric' id='fz_floodTDCB' value='" + cible.terrain + "'/></td></tr>"
                    + "<tr><td>Antisonde (<span id='fz_pourcent0'>0</span>%)</td><td><input type='number' min='0' step='1' inputmode='numeric' id='fz_floodAntiSonde' value='0'/></td><td></td>"
                    +   "<td id='fz_a0'>" + formater(mienTdc) + "</td><td id='fz_b0'>" + formater(cible.terrain) + "</td></tr>"
                    + "<tr class='gras reduce'><td colspan='3'></td><td><span id='fz_supprimeAttaque' class='fz_lien'>Supprimer une attaque</span></td><td><span id='fz_ajouteAttaque' class='fz_lien'>Ajouter une attaque</span></td></tr>"
                    + "</table>"
                    + "<button id='fz_lanceFlood' type='button' class='fz_btn fz_ok' style='margin-top:15px'>Flooder</button>"
                    + "<p class='reduce' style='text-align:left;font-size:.9em'>* : place les unités restantes sur l'attaque selectionnée.</p>"
                    + "<div id='fz_msgFlood'></div>";
                simulateur.appendChild(fs);
                var contenuFlood = document.createElement("div");
                contenuFlood.id = "fz_contenuFlood";
                contenuFlood.style.display = "none";
                Array.from(fs.children).forEach(function(el) {
                    if (el.tagName !== "LEGEND") {
                        contenuFlood.appendChild(el);
                    }
                });
                fs.appendChild(contenuFlood);
                document.getElementById("fz_toggleFlood").addEventListener("click", function() {
                    var ouvert = contenuFlood.style.display !== "none";

                    contenuFlood.style.display = ouvert ? "none" : "";
                    document.getElementById("fz_flecheFlood").textContent = ouvert ? "▶" : "▼";
                });
                document.getElementById("fz_nomCible").textContent = pseudoCible + " (" + dureeComplete(trajet) + ")";
                var table = document.getElementById("fz_simulationFlood");
                function nbLignesAttaque(){ return table.querySelectorAll("input[id^='fz_attaque']").length; }
                function zebre(){
                    Array.prototype.forEach.call(table.rows, function(tr, i){ tr.classList.toggle("ligne_paire", i % 2 === 0); });
                }
                function avertir(txt){
                    var m = document.getElementById("fz_msgFlood");
                    m.textContent = txt;
                    setTimeout(function(){ if (m.textContent === txt) m.textContent = ""; }, 3500);
                }
                function val(id){ var el = document.getElementById(id); return el ? Math.max(0, nombre(el.value)) : 0; }
                function methode(){ return document.getElementById("fz_methodeFlood").value; }
                var etat = {floods: [], rep: []};
                function ajouterAttaque(sansSimulation){
                    var n = nbLignesAttaque() + 1;
                    if (n >= nbAttaque){ avertir("Votre vitesse d'attaque ne vous permet pas d'envoyer plus d'attaques"); return false; }
                    var tr = table.insertRow(table.rows.length - 1);
                    tr.innerHTML = "<td>Attaque " + n + " (<span id='fz_pourcent" + n + "'>0</span>%)</td>"
                        + "<td><input type='number' min='0' step='1' inputmode='numeric' value='0' id='fz_attaque" + n + "'/></td>"
                        + "<td><input type='checkbox' id='fz_suppAttaque" + n + "' name='fz_suppAttaque'/></td>"
                        + "<td>" + formater(mienTdc) + "</td><td>" + formater(cible.terrain) + "</td>";
                    zebre();
                    document.getElementById("fz_attaque" + n).addEventListener("input", function(){ preparer(true); });
                    document.getElementById("fz_suppAttaque" + n).addEventListener("change", function(e){
                        Array.prototype.forEach.call(table.querySelectorAll("input[name='fz_suppAttaque']"), function(c){ if (c !== e.currentTarget) c.checked = false; });
                        preparer(false);
                    });
                    if (sansSimulation !== true && (methode() == "2" || methode() == "3")) preparer(false);
                    return true;
                }
                function supprimerAttaque(){
                    var n = nbLignesAttaque();
                    if (n == 0){ avertir("Vous ne pouvez plus supprimer d'attaque"); return; }
                    table.deleteRow(n + 2);   // lignes : titre, methode, antisonde, attaques..., liens
                    zebre();
                }
                function preparer(recup){
                    var tdcAtt = val("fz_floodTDCA"), tdcCible = val("fz_floodTDCB");
                    if (!attaqueAutorisee(tdcAtt, tdcCible)) { etat.floods = []; etat.rep = []; avertir("Cible hors de portée"); return; } var m = methode(), attaques = [val("fz_floodAntiSonde")];
                    if (recup || m == "0"){
                        for (var i = 1; i < nbAttaque; i++) if (document.getElementById("fz_attaque" + i)) attaques.push(val("fz_attaque" + i));
                    }
                    var coche = table.querySelector("input[name='fz_suppAttaque']:checked");
                    var indSupp = coche ? parseInt(coche.id.replace("fz_suppAttaque", ""), 10) : -1;
                    var uniforme = val("fz_attaque1");
                    var reste = (m == "2" || m == "3") ? Math.min(nbLignesAttaque(), nbAttaque) : nbAttaque;
                    armee = lireArmee();
                    var sim = simulerFlood(armee, tdcAtt, tdcCible, m, attaques, uniforme, reste, indSupp);
                    etat.floods = sim; etat.rep = repartirFlood(armee, sim);
                    /* antisonde */
                    var priseMax = Math.floor(tdcCible * 0.2), pct = 0;
                    if (sim[0]){
                        priseMax = Math.min(sim[0], priseMax);
                        pct = Math.round(priseMax * 100 / tdcCible);
                        tdcAtt += priseMax; tdcCible -= priseMax;
                    }
                    document.getElementById("fz_pourcent0").textContent = pct;
                    document.getElementById("fz_a0").textContent = formater(tdcAtt);
                    document.getElementById("fz_b0").textContent = formater(tdcCible);
                    /* attaques */
                    for (var k = 1; k < sim.length; k++){
                        if (!document.getElementById("fz_attaque" + k) && !ajouterAttaque(true)) break;
                        document.getElementById("fz_attaque" + k).value = sim[k];
                        pct = 0;
                        if (attaqueAutorisee(tdcAtt, tdcCible)) {
                            priseMax = Math.min(sim[k], Math.floor(tdcCible * 0.2));
                            pct = Math.round(priseMax * 100 / tdcCible);
                            tdcAtt += priseMax; tdcCible -= priseMax;
                        }
                        document.getElementById("fz_pourcent" + k).textContent = pct;
                        var tr = table.rows[k + 2];
                        tr.cells[3].textContent = formater(tdcAtt);
                        tr.cells[4].textContent = formater(tdcCible);
                    }
                    while(nbLignesAttaque() > Math.max(0, sim.length - 1)) supprimerAttaque();
                }
                for (var i = 1; i < Math.min(4, nbAttaque); i++) ajouterAttaque();
                if (methodeInit != 0) preparer(false);
                document.getElementById("fz_methodeFlood").addEventListener("change", function(e){
                    preparer(false);
                    var cache = e.currentTarget.value == "1" ? "none" : "";
                    document.getElementById("fz_ajouteAttaque").style.display = cache;
                    document.getElementById("fz_supprimeAttaque").style.display = cache;
                });
                if (methodeInit == 1){
                    document.getElementById("fz_ajouteAttaque").style.display = "none";
                    document.getElementById("fz_supprimeAttaque").style.display = "none";
                }
                ["fz_floodTDCA", "fz_floodTDCB", "fz_floodAntiSonde"].forEach(function(id){
                    document.getElementById(id).addEventListener("input", function(){ preparer(false); });
                });
                document.getElementById("fz_ajouteAttaque").addEventListener("click", function(){ ajouterAttaque(); });
                document.getElementById("fz_supprimeAttaque").addEventListener("click", supprimerAttaque);
                /* ---- envoi du flood ---- */
                var enCours = false;
                document.getElementById("fz_lanceFlood").addEventListener("click", function(){
                    if (enCours) return;
                    preparer(true);
                    if (!etat.floods.length){ avertir("Cible hors de portée : impossible de lancer le flood"); return; }
                    enCours = true;
                    var jetons = document.querySelectorAll("#t"), jeton = jetons[jetons.length - 1];
                    function envoyer(i){
                        if (i >= etat.floods.length){ location.reload(); return; }
                        if (!etat.floods[i]){ envoyer(i + 1); return; }
                        var p = new URLSearchParams();
                        if (jeton) p.set(jeton.getAttribute("name"), jeton.getAttribute("value"));
                        p.set("ChoixArmee", "1");
                        p.set("lieu", "1");
                        p.set("pseudoCible", pseudoCible);
                        ORDRE_POST.forEach(function(post, j){ p.set("unite" + post, etat.rep[i][j]); });
                        fetch(location.origin + "/ennemie.php?Attaquer=" + idCible, {
                            method: "POST", credentials: "same-origin",
                            headers: {"Content-Type": "application/x-www-form-urlencoded"}, body: p.toString()
                        }).then(function(r){ return r.text(); }).then(function(html){
                            var doc = new DOMParser().parseFromString(html, "text/html"), cs = doc.querySelectorAll("center");
                            var ok = cs.length && cs[cs.length - 1].textContent.indexOf("Vos troupes sont en marche") >= 0;
                            table.rows[i + 2].classList.add(ok ? "fz_vert" : "fz_rouge");
                        }).catch(function(){
                            table.rows[i + 2].classList.add("fz_rouge");
                        }).then(function(){ setTimeout(function(){ envoyer(i + 1); }, 1000); });
                    }
                    envoyer(0);
                });
            }
            /* ---------------- fin page Attaquer ---------------- */
            if (/\/armee\.php$/i.test(location.pathname)){ pageArmee(); return; }
            if (/\/ennemie\.php$/i.test(location.pathname)) { if (document.getElementById("formulaireChoixArmee")) { pageAttaquer(); } return; }            
            /* Page Membres uniquement */
            if (location.pathname !== "/alliance.php" || location.search.indexOf("Membres") < 0) return;
            function actif (){ return TOUJOURS || location.hash === "#chasseurs"; }
            var donnees = null, tColor = null;
            /* ---------------- Epees bleues / rouges (reprise d'Outiiil) ----------------
            Rouge (colonne apres le terrain)  : je peux attaquer ce joueur (terrain entre 50% et 300% du mien)
            Bleue (colonne avant le terrain)  : ce joueur peut m'attaquer
            Sans effet si compte Plus (le jeu les affiche deja) ou si la case contient deja une icone. */
            var IMG_ATT = "<img src='images/icone/icone_degat_attaque.gif' alt='Dégâts en attaque :' title='Dégâts en attaque :' height='18' style='vertical-align:middle'>";
            var IMG_DEF = "<img src='images/icone/icone_degat_defense.gif' alt='Dégâts en défense :' title='Dégâts en défense :' height='18' style='vertical-align:middle'>";
            function ajouterEpees(){
                var table = document.getElementById("tabMembresAlliance");
                var tdc = document.getElementById("quantite_tdc");
                if (!table || !tdc) return;
                var cp = document.querySelector("#menuComptePlus a.boutonStatJoueur");
                if (cp && cp.textContent.trim() == "Stat") return;
                var mien = nombre(tdc.textContent);
                if (!mien) return;
                Array.prototype.forEach.call(table.querySelectorAll("tr"), function(tr){
                    if (tr.getAttribute("data-fz-epees")) return;
                    var a = tr.querySelector("a[href^='Membre.php?Pseudo=']");
                    if (!a) return;
                    var tdPseudo = a.closest("td");
                    if (!tdPseudo) return;
                    var i = tdPseudo.cellIndex;
                    var tdDef = tr.cells[i + 1], tdTer = tr.cells[i + 2], tdAtt = tr.cells[i + 3];
                    if (!tdDef || !tdTer || !tdAtt) return;
                    tr.setAttribute("data-fz-epees", "1");
                    if (a.textContent.trim().toLowerCase() == MOI.toLowerCase()) return;
                    var t = nombre(tdTer.textContent);
                    if (!t) return;
                    if (t >= mien * 0.5 + 1 && t <= mien * 3 - 1 && !tdAtt.querySelector("img")) tdAtt.innerHTML = IMG_ATT;
                    if (t * 0.5 + 1 <= mien && t * 3 - 1 >= mien && !tdDef.querySelector("img")) tdDef.innerHTML = IMG_DEF;
                });
            }
            /* ---------------- fin epees ---------------- */
            function lireSujet(){
                var corps = "xajax=callGetTopic&xajaxargs%5B%5D=" + encodeURIComponent(ID_SUJET) + "&xajaxr=" + Date.now();
                return fetch(location.origin + "/alliance.php?forum_menu", {
                    method: "POST", credentials: "same-origin",
                    headers: {"Content-Type": "application/x-www-form-urlencoded"},
                    body: corps
                }).then(function(r){ return r.text(); }).then(function(brut){
                    var html = brut;
                    try{
                        var xml = new DOMParser().parseFromString(brut, "text/xml");
                        var cmds = xml.getElementsByTagName("cmd");
                        if (cmds.length){
                            html = "";
                            for (var i = 0; i < cmds.length; i++) html += cmds[i].textContent;
                        }
                    }catch(e){}
                    if (html.indexOf("Vous n'avez pas accès à ce forum.") >= 0) throw "acces";
                    var doc = new DOMParser().parseFromString(html, "text/html");
                    var msgs = Array.prototype.slice.call(doc.querySelectorAll(".messageForum")).reverse();
                    for (var k = 0; k < msgs.length; k++){
                        var c = msgs[k].cloneNode(true);
                        Array.prototype.forEach.call(c.querySelectorAll("br"), function(b){ b.replaceWith("\n"); });
                        Array.prototype.forEach.call(c.querySelectorAll("p,div,li"), function(b){ b.append("\n"); });
                        var r = analyser(c.textContent);
                        if (r.file.length + r.retours.length > 0) return r;
                    }
                    throw "vide";
                });
            }
            function colorier(){
                if (!donnees || !actif ()) return;
                var table = document.getElementById("tabMembresAlliance");
                if (!table) return;
                var c = classer(donnees, MOI);
                Array.prototype.forEach.call(table.querySelectorAll("tr"), function(tr){
                    var a = tr.querySelector("a[href^='Membre.php?Pseudo=']");
                    if (!a) return;
                    var p = a.textContent.trim().toLowerCase();
                    var cellulePseudo = a.closest("td");
                    if (cellulePseudo) {
                        var etiquette = cellulePseudo.querySelector(".fz_rangChasseurs");
                        var numero = c.rangs[p];
                        if (numero) {
                            if (!etiquette) {
                                etiquette = document.createElement("span");
                                etiquette.className = "fz_rangChasseurs";
                                cellulePseudo.insertBefore(etiquette, a);
                            }
                            var libelle = "[" + numero + "] ";
                            if (etiquette.textContent !== libelle) etiquette.textContent = libelle;
                        } else if (etiquette) {
                            etiquette.remove();
                        }
                    }
                    var couleur = c.rouge[p] ? COULEUR_ROUGE : (c.vert[p] ? COULEUR_VERT : "");
                    Array.prototype.forEach.call(tr.children, function(td){
                        if (couleur) {
                            if (td.style.getPropertyValue("background-color") !== couleur || td.style.getPropertyPriority("background-color") !== "important") td.style.setProperty("background-color", couleur, "important");
                        } else if (td.style.getPropertyValue("background-color")) {
                            td.style.removeProperty("background-color");
                        }
                    });
                    var titre = c.rouge[p] ? "Rentré de chasse" : (c.vert[p] ? "Retour avant le mien" : "");
                    if (tr.title !== titre) tr.title = titre;
                });
                if (!document.getElementById("fz_legendeChasseurs")){
                    var d = document.createElement("div");
                    d.id = "fz_legendeChasseurs";
                    d.style.cssText = "font:12px/1.3 Arial,sans-serif;font-weight:normal;text-align:left;margin:4px 0;display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-start;max-width:100%;";
                    var S = "font:15px/1.3 Arial,sans-serif;padding:2px 6px;border-radius:3px;";
                    d.innerHTML = '<span style="background:' + COULEUR_ROUGE + ';' + S + '">Rentré de chasse</span>'
                        + '<span style="background:' + COULEUR_VERT + ';' + S + '">Retour avant le mien</span>';
                    var titreMembres = Array.prototype.find.call(document.querySelectorAll(".simulateur h2"), function(h){ return h.textContent.trim().indexOf("Les membres de l") === 0; });
                    if (titreMembres) titreMembres.insertAdjacentElement("afterend", d);
                    else table.parentNode.insertBefore(d, table);
                }
            }
            function planifier(){ clearTimeout(tColor); tColor = setTimeout(function(){ ajouterEpees(); colorier(); }, 150); }
            function demarrer(){
                ajouterEpees();
                if (!actif () || donnees) { planifier(); return; }
                lireSujet().then(function(r){ donnees = r; colorier(); }, function(e){
                    var msg = e === "acces" ? "acces refuse au sujet (verifiez ID_SUJET)"
                            : e === "vide" ? "aucune ligne 'pseudo : N cm² le jj/mm/aa' trouvee dans le sujet"
                            : "erreur reseau";
                    console.error("Chasseurs :", msg, e);
                    alert("Chasseurs : " + msg);
                });
            }
            new MutationObserver(planifier).observe(document.body, {childList: true, subtree: true});
            window.addEventListener("hashchange", demarrer);
            demarrer();
        }
    }
    class ConvoiMax {
        static init() {
            "use strict";
            if (Commun.comptePlus) return;
            function lireNombre(id) {
                return Commun.nombre(document.getElementById(id)?.textContent);
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
            function vider() {
                Object.values(champs).forEach(function (champ) {
                    definir(champ, "");
                });
            }
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
        }
    }
    class CalculTDP {
        static FAMILLES = Object.freeze([[0, 1, 2], [3, 4, 9], [5, 6], [7, 8], [10, 11], [12, 13]].map((noeuds) => ({noeuds})));
        static TOLERANCE_UNITES = 1.5;
        static PONDABLE(i) { return i !== 6 && i !== 11; }
        static resoudreFamille(noeuds, s, c) {
            const m = noeuds.length, nv = m - 1;
            const d = noeuds.map((n) => c[n] - s[n]);
            // Forme linéaire : {coef:[...nv], cst}
            const p = noeuds.map((_, j) => {
                const coef = Array(nv).fill(0);
                if (j > 0) coef[j - 1] -= 1;
                if (j < nv) coef[j] += 1;
                return {coef, cst: d[j]};
            });
            const contraintes = []; // coef·x + cst ≥ 0
            for (let j = 0; j < nv; j++) {
                const coef = Array(nv).fill(0);
                coef[j] = 1;
                contraintes.push({coef, cst: 0});
            }
            noeuds.forEach((n, j) => {
                contraintes.push(p[j]);
                if (!this.PONDABLE(n)) contraintes.push({coef: p[j].coef.map((v) => -v), cst: -p[j].cst});
            });
            const ok = (x) => contraintes.every((k) => k.coef.reduce((t, v, i) => t + v * x[i], k.cst) >= -1e-9);
            const sommets = [];
            const ajouter = (x) => {
                if (x.every(Number.isFinite) && ok(x) && !sommets.some((y) => y.every((v, i) => Math.abs(v - x[i]) < 1e-9))) sommets.push(x);
            };
            if (nv === 1) {
                for (const k of contraintes) if (k.coef[0]) ajouter([-k.cst / k.coef[0]]);
            } else if (nv === 2) {
                for (let i = 0; i < contraintes.length; i++) {
                    for (let k = i + 1; k < contraintes.length; k++) {
                        const A = contraintes[i], B = contraintes[k];
                        const det = A.coef[0] * B.coef[1] - A.coef[1] * B.coef[0];
                        if (Math.abs(det) < 1e-12) continue;
                        ajouter([(-A.cst * B.coef[1] + B.cst * A.coef[1]) / det, (-B.cst * A.coef[0] + A.cst * B.coef[0]) / det]);
                    }
                }
            }
            if (!sommets.length) return {faisable: false, d};
            const evalP = (x) => p.map((l) => Math.round(l.coef.reduce((t, v, i) => t + v * x[i], l.cst)));
            const solutions = sommets.map((x) => {
                const pj = evalP(x);
                return {x: x.map(Math.round), p: pj, S: pj.reduce((t, v, j) => t + v * Commun.UNITES.TEMPS[noeuds[j]], 0)};
            });
            const parMin = solutions.reduce((a, b) => (b.S < a.S ? b : a));
            const parMax = solutions.reduce((a, b) => (b.S > a.S ? b : a));
            return {
                faisable: true, noeuds, d, solutions, parMin, parMax,
                pMin: noeuds.map((_, j) => Math.min(...solutions.map((v) => v.p[j]))),
                pMax: noeuds.map((_, j) => Math.max(...solutions.map((v) => v.p[j])))
            };
        }
        // Temps de ponte T(tdp) = S × 0.9^tdp ; S = Σ pondues × TEMPS. Candidat si S·f ≈ Δt (± quelques unités).
        static candidatsTDP(Smin, Smax, tm, dt) {
            const candidats = [];
            let minimum = null;
            if (Smax <= 0) return {candidats, minimum};
            for (let tdp = 0; tdp <= 150; tdp++) {
                const f = Math.pow(0.9, tdp), tol = this.TOLERANCE_UNITES * tm * f;
                if (Smin * f - tol <= dt && minimum === null) minimum = tdp;
                if (Smin * f - tol <= dt && dt <= Smax * f + tol) candidats.push({tdp, f, tmin: Smin * f, tmax: Smax * f, tol});
            }
            return {candidats, minimum};
        }
        static comparer(r1, r2, dt) {
            const familles = this.FAMILLES.map((f) => ({...f, ...this.resoudreFamille(f.noeuds, r1.survivants, r2.avant)}));
            const faisable = familles.every((f) => f.faisable);
            let Smin = 0, Smax = 0, tm = 0;
            if (faisable) {
                for (const f of familles) {
                    Smin += f.parMin.S;
                    Smax += f.parMax.S;
                    f.noeuds.forEach((n, j) => { if (f.pMax[j] > 0) tm = Math.max(tm, Commun.UNITES.TEMPS[n]); });
                }
            }
            const calcul = faisable ? this.candidatsTDP(Smin, Smax, tm, dt) : {candidats: [], minimum: null};
            return {familles, faisable, Smin, Smax, tm, dt, ...calcul};
        }
        static bilan(rapports) {
            const groupes = new Map();
            for (const rapport of rapports) {
                const pseudo = rapport.defense ? rapport.attaquant : rapport.cible;
                if (!pseudo || Commun.norm(pseudo) === 'adversaire' || Commun.norm(pseudo) === 'vous') continue;
                const cle = Commun.norm(pseudo);
                if (!groupes.has(cle)) groupes.set(cle, {pseudo, rapports: []});
                groupes.get(cle).rapports.push(rapport);
            }
            const sections = [];
            for (const {pseudo, rapports: groupe} of groupes.values()) {
                if (groupe.length < 2) continue;
                const dates = groupe.filter((r) => r.date && Number.isFinite(r.date.ms)).sort((a, b) => a.date.ms - b.date.ms);
                const lignes = [];
                const ensembles = [];
                for (let i = 1; i < dates.length; i++) {
                    const premier = dates[i - 1], second = dates[i];
                    const dt = (second.date.ms - premier.date.ms) / 1000;
                    if (dt <= 0) {
                        lignes.push(`<tr><td>${Commun.echapper(premier.date.texte)} → ${Commun.echapper(second.date.texte)}</td><td>0 min</td><td colspan="3">Même minute : chronologie insuffisante</td></tr>`);
                        continue;
                    }
                    const avant = premier.defense ? premier.a : premier.d;
                    const apres = premier.defense ? premier.finAtt : premier.finDef;
                    const nouveau = second.defense ? second.a : second.d;
                    const comparaison = this.comparer({survivants: apres}, {avant: nouveau}, dt);
                    const compatibles = comparaison.candidats.map((c) => c.tdp);
                    const pondus = comparaison.faisable ? Commun.somme(comparaison.familles.flatMap((f) => f.d)) : null;
                    const avertissement = dt >= 1800 ? 'Très peu fiable' : dt >= 900 ? 'Peu fiable' : 'Fiable';
                    let resultat;
                    if (!comparaison.faisable) resultat = 'Effectifs incompatibles avec ponte + XP seules';
                    else if (comparaison.Smax <= 0) resultat = 'Aucune ponte identifiable';
                    else if (compatibles.length) {
                        resultat = compatibles.join(', ');
                        ensembles.push(new Set(compatibles));
                    } else resultat = comparaison.minimum === null ? 'Aucun TDP compatible' : `Aucun TDP exact (borne indicative ≥ ${comparaison.minimum})`;
                    const duree = dt < 3600 ? `${Math.round(dt / 60)} min` : `${(dt / 3600).toLocaleString('fr-FR', {maximumFractionDigits: 2})} h`;
                    lignes.push(`<tr><td>${Commun.echapper(premier.date.texte)} → ${Commun.echapper(second.date.texte)}</td><td>${duree}</td><td>${pondus === null ? '—' : Commun.fmt(pondus)}</td><td>${Commun.echapper(resultat)}</td><td>${Commun.echapper(avertissement)}</td></tr>`);
                }
                let synthese;
                if (!dates.length || dates.length < 2) synthese = 'Au moins deux dates distinctes sont nécessaires. Aucun TDP calculé.';
                else if (!ensembles.length) synthese = 'Aucun intervalle ne permet de déterminer un TDP.';
                else {
                    const communs = [...ensembles[0]].filter((niveau) => ensembles.every((ensemble) => ensemble.has(niveau)));
                    synthese = communs.length ? `TDP compatibles communs : ${communs.join(', ')}` : 'Résultats contradictoires : aucun TDP commun aux intervalles exploitables.';
                    if (ensembles.length < dates.length - 1) synthese += ' Certains intervalles sont non exploitables.';
                }
                sections.push(`<details class="rc-combat rc-tdp"><summary><strong>${Commun.echapper(pseudo)}</strong> — ${groupe.length} RC, ${dates.length} daté(s)</summary><div class="rc-interieur"><p><b>${Commun.echapper(synthese)}</b></p>${lignes.length ? `<table><thead><tr><th>Rapports</th><th>Durée</th><th>Pondues</th><th>TDP compatibles</th><th>Observation</th></tr></thead><tbody>${lignes.join('')}</tbody></table>` : '<p>Dates manquantes : impossible de calculer automatiquement le TDP.</p>'}<p class="rc-note">Hypothèse : les variations proviennent de la ponte et de l’XP. Déplacements, combats intermédiaires ou ponte non continue peuvent fausser le résultat. Les durées ne constituent pas une mesure de fiabilité.</p></div></details>`);
            }
            return sections.length ? `<section id="rc-bilan-tdp"><h3>Bilan TDP</h3>${sections.join('')}</section>` : '';
        }
    }
    class MembrePage {
        static trouverTableauScore(boite) {
            if (!boite) return null;
            return boite.querySelector(
                '.tableau_score, .tableauscore'
            );
        }
        static trouverBoitesMembre(centre) {
            return Array.from(
                centre.querySelectorAll('.boite_membre')
            );
        }
        static inverserAffichage() {
            const centre = document.querySelector('#centre');
            if (!centre) return false;
            const boites = this.trouverBoitesMembre(centre);
            if (boites.length < 2) return false;
            const boiteTableau = boites.find(
                boite => this.trouverTableauScore(boite)
            );
            if (!boiteTableau) return false;
            const tableauScore = this.trouverTableauScore(boiteTableau);
            const boiteCible = boites.find(
                boite => boite !== boiteTableau
            );
            if (!boiteCible) return false;
            const parentCommun = boiteTableau.parentElement;
            if (!parentCommun) return false;
            boiteCible.appendChild(tableauScore);
            boiteCible.style.display = 'flex';
            boiteCible.style.flexWrap = 'wrap';
            boiteCible.style.gap = '20px';
            boiteCible.style.alignItems = 'center';
            boiteCible.style.justifyContent = 'center';
            parentCommun.insertBefore(
                boiteCible,
                boiteTableau
            );
            return true;
        }
        static init() {
            if (location.pathname.toLowerCase() !== '/membre.php') return;
            this.inverserAffichage();
        }
    }
    class TempsTrajet {
        static CACHE_KEY = 'tt_moi';
        static CACHE_MS = 10 * 60 * 1000;
        static tempsParcours(niveau, dx, dy) {
            const d = Math.sqrt(dx * dx + dy * dy);
            return Math.ceil(Math.pow(0.9, niveau) * 637200 * (1 - Math.exp(-d / 350)));
        }
        static formatDuree(s) {
            const j = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
            return (j ? j + 'j ' : '') + (h || j ? h + 'h ' : '') + (m || h || j ? m + 'm ' : '') + sec + 's';
        }
        static lireCoords(doc) {
            const re = /x\s*=\s*(\d+)\s*et\s*y\s*=\s*(\d+)/;
            const t = Array.from(doc.querySelectorAll("a[href^='carte2.php?']")).map((a) => a.textContent).join(' ');
            const m = t.match(re) || (doc.body ? doc.body.textContent : '').match(re);
            return m ? {x: +m[1], y: +m[2]} : null;
        }
        static async mesInfos() {
            const [coords, niveaux] = await Promise.all([
                DonneesJoueur.coordonnees(),
                DonneesJoueur.laboratoire()
            ]);
            const niveau = niveaux[6];
            if (!coords || !Number.isFinite(niveau)) throw new Error('infos introuvables');
            return {x: coords.x, y: coords.y, niveau};
        }
        static ajouterLigne(texte) {
            const lien = document.querySelector(
                '.boite_membre a[href^="commerce.php?ID="]'
            );
            if (!lien) return false;
            const cellule = lien.closest('td');
            if (!cellule) return false;
            let ligne = document.getElementById('tt_ligne');
            if (!ligne) {
                ligne = document.createElement('div');
                ligne.id = 'tt_ligne';
                ligne.style.marginTop = '8px';
                cellule.appendChild(ligne);
            }
            ligne.textContent = 'Temps de trajet : ';
            const valeur = document.createElement('strong');
            valeur.textContent = texte;
            ligne.appendChild(valeur);
            return true;
        }        
        static async init() {
            if (!/\/Membre\.php/i.test(location.pathname)) return;
            if (document.getElementById('tt_ligne')) return;
            // Recherche du temps de trajet natif.
            const ligneNative = Array.from(
                document.querySelectorAll('.boite_membre tr')
            ).find(tr =>
                tr.cells.length >= 2 &&
                /^Temps de trajet\s*:/i.test(
                    tr.cells[0].textContent.trim()
                )
            );
            // Si Fourmizzz fournit déjà le temps de trajet.
            if (ligneNative) {
                const texte = ligneNative.cells[1].textContent.trim();
                if (texte && this.ajouterLigne(texte)) {
                    ligneNative.remove();
                    return;
                }
            }
            // Sinon, calcul du temps de trajet.
            const cible = this.lireCoords(document);
            if (!cible) return;
            try {
                const moi = await this.mesInfos();
                if (moi.x === cible.x && moi.y === cible.y) return;
                const duree = this.tempsParcours(
                    moi.niveau,
                    cible.x - moi.x,
                    cible.y - moi.y
                );
                this.ajouterLigne(this.formatDuree(duree));
            } catch (e) {
                this.ajouterLigne(
                    'indisponible (ouvrez votre laboratoire)'
                );
            }
        }        
    }
    Commun.initialiser()
    DonneesJoueur.reprendrePageOuverte();
    MembrePage.init();
    AnalyseRC.init();
    BilanTdC.init();
    Chasseurs.init();
    ConvoiMax.init();
    TempsTrajet.init();
})();
