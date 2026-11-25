import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, update, remove, set, onValue, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig, PERSONNES, VAPID_PUBLIQUE } from "./firebase-config.js";

const $ = (id) => document.getElementById(id);

/* ---------- Espace secret (arrive par le lien, gardé sur l'appareil) ---------- */
// Accepte le lien complet ou juste l'identifiant. Firebase interdit . # $ [ ] /
function extraireEspace(texte) {
  const id = (texte || "").split("#").pop().trim();
  return /^[A-Za-z0-9_-]{16,}$/.test(id) ? id : null;
}
function lireEspace() {
  const duLien = extraireEspace(location.hash);
  try {
    if (duLien) localStorage.setItem("voyage-espace", duLien);
    return duLien || localStorage.getItem("voyage-espace");
  } catch {
    return duLien;
  }
}
// Sans identifiant (ex. app installée sur iPhone, qui ne partage pas le stockage de Safari),
// on demande de coller le lien.
function demanderEspace() {
  $("choix-espace").hidden = false;
  return new Promise((resoudre) => {
    $("espace-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const id = extraireEspace($("espace-texte").value);
      if (!id) { $("espace-erreur").hidden = false; return; }
      try { localStorage.setItem("voyage-espace", id); } catch { /* stockage indisponible */ }
      $("choix-espace").hidden = true;
      resoudre(id);
    });
  });
}
const ESPACE_ID = lireEspace() || await demanderEspace();

/* ---------- Firebase ---------- */
const db = getDatabase(initializeApp(firebaseConfig));
const cheminLieux = `espaces/${ESPACE_ID}/lieux`;
const lieuxRef = ref(db, cheminLieux);
// Avis « Clara n'a pas retenu Kyoto » destinés à la personne qui avait proposé
const cheminAvis = `espaces/${ESPACE_ID}/avis`;

/* ---------- Données de l'app ---------- */
// Chaque catégorie a une fine icône au trait (tracés SVG 24×24, couleur donnée par le CSS)
const CATEGORIES = {
  ville:    { label: "Ville",          icone: '<path d="M3 21h18M5 21V7l7-3v17M12 21V10l7 3v8M8.5 9v.01M8.5 12.5v.01M8.5 16v.01M15.5 15v.01M15.5 18v.01"/>' },
  pays:     { label: "Pays ou région", icone: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2ZM9 4v14M15 6v14"/>' },
  nature:   { label: "Nature",         icone: '<path d="M3 20 9.5 9l4 6.5L16 12l5 8H3Z"/>' },
  plage:    { label: "Plage, île",     icone: '<circle cx="16.5" cy="7" r="3"/><path d="M3 15.5c2 0 2-1.5 4.5-1.5s2.5 1.5 4.5 1.5 2.5-1.5 4.5-1.5 2.5 1.5 4.5 1.5M3 20c2 0 2-1.5 4.5-1.5S10 20 12 20s2.5-1.5 4.5-1.5S19 20 21 20"/>' },
  monument: { label: "Monument, site", icone: '<path d="M3 9 12 4l9 5H3ZM5.5 9v9M10 9v9M14 9v9M18.5 9v9M3 21h18M4 18h16"/>' },
  autre:    { label: "Autre",          icone: '<path d="M12 21s-6-5.5-6-11a6 6 0 1 1 12 0c0 5.5-6 11-6 11Z"/><circle cx="12" cy="10" r="2.2"/>' },
};
const iconeCategorie = (cle) =>
  `<svg class="icone" viewBox="0 0 24 24" aria-hidden="true">${(CATEGORIES[cle] || CATEGORIES.autre).icone}</svg>`;

// Saison idéale : une seule par lieu, couleurs dans style.css (--printemps…)
const SAISONS = {
  printemps: "Printemps",
  ete:       "Été",
  automne:   "Automne",
  hiver:     "Hiver",
};

// Type de voyage proposé : affiché dans la bannière (« Mathis te propose un week-end à Paris »)
// Recopié dans functions/index.js pour le texte des notifications
const FORMULES = {
  journee:  { label: "Journée",   texte: "une escapade d'une journée" },
  weekend:  { label: "Week-end",  texte: "un week-end" },
  vacances: { label: "Vacances",  texte: "des vacances" },
  roadtrip: { label: "Road trip", texte: "un road trip" },
};

// Code pays ISO (donné par Nominatim) -> continent
const CONTINENTS = {
  "Europe": "ad al at ax ba be bg by ch cy cz de dk ee es fi fo fr gb gg gi gr hr hu ie im is it je li lt lu lv mc md me mk mt nl no pl pt ro rs ru se si sj sk sm ua va xk",
  "Asie": "ae af am az bd bh bn bt cc cn cx ge hk id il in io iq ir jo jp kg kh kp kr kw kz la lb lk mm mn mo mv my np om ph pk ps qa sa sg sy th tj tl tm tr tw uz vn ye",
  "Afrique": "ao bf bi bj bw cd cf cg ci cm cv dj dz eg eh er et ga gh gm gn gq gw ke km lr ls ly ma mg ml mr mu mw mz na ne ng re rw sc sd sh sl sn so ss st sz td tg tn tz ug yt za zm zw",
  "Amérique du Nord": "ag ai aw bb bl bm bq bs bz ca cr cu cw dm do gd gl gp gt hn ht jm kn ky lc mf mq ms mx ni pa pm pr sv sx tc tt um us vc vg vi",
  "Amérique du Sud": "ar bo br cl co ec fk gf gs gy pe py sr uy ve",
  "Océanie": "as au ck fj fm gu ki mh mp nc nf nr nu nz pf pg pn pw sb tk to tv vu wf ws",
  "Antarctique": "aq bv hm tf",
};
const CONTINENT_DU_CODE = {};
for (const [continent, codes] of Object.entries(CONTINENTS)) {
  for (const code of codes.split(" ")) CONTINENT_DU_CODE[code] = continent;
}

// Drapeau emoji à partir du code pays (« ca » -> 🇨🇦), vide si pas de code
function drapeau(code) {
  if (!/^[a-z]{2}$/.test(code || "")) return "";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}
const avecDrapeau = (code, texte) => (drapeau(code) ? `${drapeau(code)} ${texte}` : texte);

function continentDe(l) {
  // Nominatim renvoie « fr » aussi pour les DOM-TOM : on regarde la position
  // pour tout ce qui est hors de la France métropolitaine.
  if (l.codePays === "fr" && !(l.lat > 41 && l.lat < 51.5 && l.lng > -5.5 && l.lng < 10)) {
    if (l.lng > 130 || l.lng < -100) return "Océanie";
    if (l.lng < -30) return l.lat < 10 ? "Amérique du Sud" : "Amérique du Nord";
    return "Afrique";
  }
  return CONTINENT_DU_CODE[l.codePays] || "Autres";
}

let lieux = {};         // { id: lieu } tel que dans Firebase
let filtre = "avisiter"; // avisiter | visite | tous
let marqueurs = {};      // { id: L.marker }
let avis = {};           // { id: { pour, par, nom } } tel que dans Firebase
let ficheId = null;      // id du lieu ouvert, null si nouveau
let brouillon = null;    // copie du lieu en cours d'édition
let marqueurTemp = null; // épingle provisoire pendant un ajout
let moi = lireMoi();

/* ---------- Qui suis-je (gardé sur l'appareil) ---------- */
function lireMoi() {
  try { return localStorage.getItem("voyage-moi"); } catch { return null; }
}
function ecrireMoi(v) {
  try { localStorage.setItem("voyage-moi", v); } catch { /* stockage indisponible */ }
}
function choisirMoi() {
  const boite = $("choix-boutons");
  boite.innerHTML = "";
  for (const [cle, nom] of Object.entries(PERSONNES)) {
    const b = document.createElement("button");
    b.className = "principal";
    b.textContent = nom;
    b.onclick = () => {
      moi = cle;
      ecrireMoi(cle);
      $("choix-moi").hidden = true;
      majMoi();
      rendre(); // la bannière et « En attente » dépendent de qui regarde
      majNotifications(); // l'appareil reçoit maintenant les notifications de cette personne
    };
    boite.appendChild(b);
  }
  $("choix-moi").hidden = false;
}
function majMoi() {
  $("btn-moi").textContent = PERSONNES[moi]?.[0] || "?";
  $("btn-moi").title = PERSONNES[moi] ? `${PERSONNES[moi]} (changer de personne)` : "Qui es-tu ?";
}
$("btn-moi").onclick = choisirMoi;
$("sous-titre").textContent = Object.values(PERSONNES).join(" & ");
majMoi();
if (!PERSONNES[moi]) choisirMoi();

/* ---------- Carte ---------- */
// Bornée aux pôles (pas de bande vide au-dessus ni en dessous) ; libre de tourner autour du monde
const carte = L.map("carte", {
  zoomControl: false,
  worldCopyJump: true,
  minZoom: 1,
  maxBounds: [[-85, -540], [85, 540]],
  maxBoundsViscosity: 1,
}).setView([30, 10], 2);
// Tuiles OpenStreetMap adoucies par un filtre de couleurs (voir .leaflet-tile-pane dans style.css)
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: "© OpenStreetMap",
}).addTo(carte);

// Petit rond : vert sapin (à visiter), gris (visité), pointillé (en attente de l'autre)
function icone(lieu, classe = "") {
  const etat = lieu.visite && !aVisiter(lieu) ? " visite" : "";
  const attente = enAttente(lieu) || retourEnAttente(lieu) ? " attente" : "";
  return L.divIcon({
    className: "",
    html: `<div class="epingle${etat}${attente} ${classe}"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function montrerTemp(lat, lng) {
  retirerTemp();
  marqueurTemp = L.marker([lat, lng], { icon: icone({}, "temp") }).addTo(carte);
}
function retirerTemp() {
  if (marqueurTemp) { marqueurTemp.remove(); marqueurTemp = null; }
}

function cadrer() {
  const points = Object.values(lieux).filter((l) => !aDecider(l)).map((l) => [l.lat, l.lng]);
  if (points.length === 1) carte.setView(points[0], 6);
  else if (points.length > 1) {
    carte.fitBounds(points, { paddingTopLeft: [30, 80], paddingBottomRight: [30, 60], maxZoom: 6 });
  }
}

/* Toucher la carte : on propose la ville la plus proche */
carte.on("click", async (e) => {
  if (!PERSONNES[moi]) return choisirMoi();
  const { lat, lng } = e.latlng;
  montrerTemp(lat, lng);
  ouvrirFiche(null, { lat, lng, nom: "", pays: "", categorie: "ville" });
  const info = await lieuProche(lat, lng);
  // L'utilisateur a pu fermer la fiche ou en ouvrir une autre entre-temps
  if (!brouillon || ficheId || brouillon.lat !== lat) return;
  brouillon.pays = info.pays;
  brouillon.codePays = info.code || "";
  $("f-pays").textContent = info.pays ? avecDrapeau(info.code, info.pays) : "";
  if (!$("f-nom").value) $("f-nom").value = info.nom;
});

/* ---------- Recherche (Nominatim, OpenStreetMap) ---------- */
async function chercher(texte) {
  const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6"
    + `&accept-language=fr&q=${encodeURIComponent(texte)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`recherche ${r.status}`);
  return r.json();
}

// Nom plus court que celui de Nominatim :
// « Arrondissement de Chicoutimi » -> « Chicoutimi », « Montréal (région administrative) » -> « Montréal »
function nettoyerNom(nom) {
  const court = (nom || "")
    .replace(/^(arrondissement|municipalité|ville|commune|canton|paroisse)\s+(du |des |de |d'|d’)/i, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();
  return court || nom || "";
}

async function lieuProche(lat, lng) {
  try {
    // zoom=10 : niveau ville, pas adresse
    const r = await fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10"
      + `&accept-language=fr&lat=${lat}&lon=${lng}`);
    const d = await r.json();
    const a = d.address || {};
    return {
      nom: nettoyerNom(a.city || a.town || a.village || a.state || d.name || ""),
      pays: a.country || "",
      code: a.country_code || "", // vide en pleine mer
    };
  } catch {
    return { nom: "", pays: "", code: null }; // null : à réessayer plus tard
  }
}

function devinerCategorie(r) {
  const t = r.addresstype || r.type;
  if (["country", "state", "region", "province"].includes(t)) return "pays";
  if (["city", "town", "village", "municipality"].includes(t)) return "ville";
  if (["island", "archipelago", "beach"].includes(t)) return "plage";
  if (r.category === "natural" || ["peak", "volcano", "national_park", "lake"].includes(t)) return "nature";
  if (r.category === "tourism" || r.category === "historic") return "monument";
  return "autre";
}

$("recherche").addEventListener("submit", async (e) => {
  e.preventDefault();
  const texte = $("recherche-texte").value.trim();
  const ul = $("resultats");
  if (!texte) { ul.hidden = true; return; }
  ul.innerHTML = "<li class='info'>Recherche…</li>";
  ul.hidden = false;
  try {
    const resultats = await chercher(texte);
    ul.innerHTML = "";
    if (!resultats.length) ul.innerHTML = "<li class='info'>Aucun résultat</li>";
    for (const r of resultats) {
      const li = document.createElement("li");
      li.textContent = r.display_name;
      li.onclick = () => {
        const lat = Number(r.lat), lng = Number(r.lon);
        const categorie = devinerCategorie(r);
        ul.hidden = true;
        $("recherche-texte").value = "";
        $("recherche-texte").blur();
        carte.flyTo([lat, lng], categorie === "pays" ? 5 : 8);
        if (!PERSONNES[moi]) return choisirMoi();
        montrerTemp(lat, lng);
        ouvrirFiche(null, {
          lat, lng,
          nom: nettoyerNom(r.name || r.display_name.split(",")[0]),
          pays: categorie === "pays" ? "" : (r.address?.country || ""),
          codePays: r.address?.country_code || "",
          categorie,
        });
      };
      ul.appendChild(li);
    }
  } catch {
    ul.innerHTML = "<li class='info'>Recherche indisponible, réessaie plus tard</li>";
  }
});

/* ---------- Affichage ---------- */
// Un lieu ajouté reste « proposé » tant que l'autre ne l'a pas accepté
const aDecider = (l) => !!l.propose && l.ajoutePar !== moi;  // l'autre me le propose : caché, bannière
const enAttente = (l) => !!l.propose && l.ajoutePar === moi; // je l'ai proposé : visible, « en attente »
const autre = () => PERSONNES[moi === "A" ? "B" : "A"];
// Retourner dans un lieu déjà visité : retour = "propose" (en attente de l'autre) puis "oui" (accepté)
const retourADecider = (l) => l.retour === "propose" && l.retourPar !== moi;
const retourEnAttente = (l) => l.retour === "propose" && l.retourPar === moi;
// « À visiter » : jamais visité, ou retour prévu (sauf si c'est à moi de répondre, via la bannière).
// Un lieu avec retour prévu est donc à la fois dans « À visiter » et « Visités ».
const aVisiter = (l) => !l.visite || (!!l.retour && !retourADecider(l));
// Mis en avant en tête de liste : priorité (à visiter) ou coup de cœur (visité)
const enAvant = (l, passe) => (passe ? !!l.coupDeCoeur : !!l.priorite);
// Badge à droite : ❤️ coup de cœur (visités), 🔁 retour prévu ou ⭐ priorité (à visiter)
const badge = (l, passe) => (passe ? (l.coupDeCoeur ? "❤️" : "") : l.visite ? "🔁" : l.priorite ? "⭐" : "");

// Séjours d'un lieu visité, du plus ancien au plus récent (anciens lieux : dateDebut / dateFin)
function sejoursDe(l) {
  if (Array.isArray(l.sejours)) return l.sejours.filter(Boolean);
  return l.dateDebut ? [{ debut: l.dateDebut, fin: l.dateFin || l.dateDebut }] : [];
}
// « 14–19 août 2026 », « 30 août – 2 septembre 2026 », « 3 août 2026 »
function formaterSejour({ debut, fin }) {
  const d = new Date(`${debut}T12:00`);
  const f = new Date(`${fin || debut}T12:00`);
  const jourMois = { day: "numeric", month: "long" };
  const complet = (date) => date.toLocaleDateString("fr-FR", { ...jourMois, year: "numeric" });
  if (!fin || fin === debut) return complet(d);
  if (d.getFullYear() !== f.getFullYear()) return `${complet(d)} – ${complet(f)}`;
  if (d.getMonth() !== f.getMonth()) return `${d.toLocaleDateString("fr-FR", jourMois)} – ${complet(f)}`;
  return `${d.getDate()}–${complet(f)}`;
}

function rendre() {
  // Épingles : on enlève celles supprimées, on crée ou met à jour les autres
  const mesLieux = Object.entries(lieux).filter(([, l]) => !aDecider(l));
  for (const id of Object.keys(marqueurs)) {
    if (!lieux[id] || aDecider(lieux[id])) { marqueurs[id].remove(); delete marqueurs[id]; }
  }
  for (const [id, l] of mesLieux) {
    if (marqueurs[id]) {
      marqueurs[id].setLatLng([l.lat, l.lng]).setIcon(icone(l));
    } else {
      marqueurs[id] = L.marker([l.lat, l.lng], { icon: icone(l) })
        .addTo(carte)
        .on("click", () => ouvrirFiche(id));
    }
  }

  // Listes groupées par continent puis par pays
  const aVoir = mesLieux.filter(([, l]) => aVisiter(l));
  const vus = mesLieux.filter(([, l]) => l.visite);

  const conteneur = $("liste-lieux");
  conteneur.innerHTML = "";
  let nbAffiches = 0;
  if (filtre === "tous") {
    // Deux sections l'une sous l'autre ; une section vide n'est pas affichée
    for (const [nom, entrees, passe] of [["À visiter", aVoir, false], ["Visités", vus, true]]) {
      if (!entrees.length) continue;
      const titre = document.createElement("p");
      titre.className = "section";
      titre.textContent = `${nom} · ${entrees.length}`;
      conteneur.appendChild(titre);
      remplirGroupes(conteneur, entrees, passe);
      nbAffiches += entrees.length;
    }
  } else {
    const passe = filtre === "visite";
    const entrees = passe ? vus : aVoir;
    remplirGroupes(conteneur, entrees, passe);
    nbAffiches = entrees.length;
  }
  $("vide").hidden = nbAffiches > 0;
  majBanniere();
}

// Ajoute les lieux groupés par continent puis par pays ; passe = section « Visités »
function remplirGroupes(conteneur, entrees, passe) {
  entrees = [...entrees].sort(([, a], [, b]) => enAvant(b, passe) - enAvant(a, passe) || a.nom.localeCompare(b.nom, "fr"));
  const groupes = {}; // { continent: { pays: [[id, lieu], …] } }
  for (const entree of entrees) {
    const l = entree[1];
    const pays = l.pays || (l.categorie === "pays" ? l.nom : "Autres");
    ((groupes[continentDe(l)] ||= {})[pays] ||= []).push(entree);
  }

  // « Autres » toujours à la fin
  const trier = (cles) => cles.sort((a, b) => (a === "Autres") - (b === "Autres") || a.localeCompare(b, "fr"));
  for (const continent of trier(Object.keys(groupes))) {
    const titre = document.createElement("h2");
    titre.textContent = continent;
    conteneur.appendChild(titre);
    for (const pays of trier(Object.keys(groupes[continent]))) {
      const entrees = groupes[continent][pays];
      // Le pays lui-même a une fiche : il sert de sous-titre, pour ne l'écrire qu'une fois
      const iPays = entrees.findIndex(([, l]) => l.categorie === "pays" && !l.pays);
      if (iPays >= 0) {
        const [idPays, lieuPays] = entrees.splice(iPays, 1)[0];
        conteneur.appendChild(titrePays(idPays, lieuPays, passe));
      } else {
        const sousTitre = document.createElement("h3");
        const [, premier] = entrees[0]; // même pays, donc même code
        sousTitre.textContent = pays === "Autres" ? pays : avecDrapeau(premier.codePays, pays);
        conteneur.appendChild(sousTitre);
      }
      if (!entrees.length) continue;
      const ul = document.createElement("ul");
      for (const [id, l] of entrees) ul.appendChild(elementLieu(id, l, passe));
      conteneur.appendChild(ul);
    }
  }
}

// Sous-titre cliquable pour un pays qui a sa propre fiche : drapeau, nom (point de saison), icône du type
function titrePays(id, l, passe) {
  const attente = !passe && (enAttente(l) || retourEnAttente(l));
  const h3 = document.createElement("h3");
  h3.className = "titre-pays" + (passe ? " visite" : "") + (SAISONS[l.saison] ? ` saison-${l.saison}` : "");
  h3.innerHTML = `<span class="titre-nom"></span>
    ${iconeCategorie("pays")}
    <span class="lieu-attente"${attente ? "" : " hidden"}></span>
    <span class="lieu-priorite"${badge(l, passe) ? "" : " hidden"}>${badge(l, passe)}</span>`;
  h3.querySelector(".titre-nom").textContent = avecDrapeau(l.codePays, l.nom);
  h3.querySelector(".lieu-attente").textContent = `En attente de ${autre()}`;
  h3.onclick = () => {
    carte.flyTo([l.lat, l.lng], Math.max(carte.getZoom(), 4)); // un pays : on zoome moins qu'une ville
    ouvrirFiche(id);
  };
  return h3;
}

function elementLieu(id, l, passe) {
  const attente = !passe && (enAttente(l) || retourEnAttente(l));
  const li = document.createElement("li");
  li.className = "lieu" + (passe ? " visite" : "") + (SAISONS[l.saison] ? ` saison-${l.saison}` : "");
  li.innerHTML = `<span class="lieu-icone">${iconeCategorie(l.categorie)}</span>
    <div class="lieu-texte"><strong></strong><small></small></div>
    <span class="lieu-attente"${attente ? "" : " hidden"}></span>
    <span class="lieu-priorite"${badge(l, passe) ? "" : " hidden"}>${badge(l, passe)}</span>`;
  li.querySelector("strong").textContent = l.nom;
  li.querySelector(".lieu-attente").textContent = `En attente de ${autre()}`;
  const projet = !passe && [FORMULES[l.formule]?.label,
    l.envisageDebut && formaterSejour({ debut: l.envisageDebut, fin: l.envisageFin })].filter(Boolean).join(" · ");
  li.querySelector("small").textContent = projet || (l.note ? l.note.split("\n")[0] : "");
  li.onclick = () => {
    carte.flyTo([l.lat, l.lng], Math.max(carte.getZoom(), 6));
    ouvrirFiche(id);
  };
  return li;
}

/* ---------- Fiche d'un lieu ---------- */
for (const [cle, c] of Object.entries(CATEGORIES)) {
  $("f-categorie").add(new Option(c.label, cle));
}

// Boutons de saison dans la fiche (toucher à nouveau pour enlever)
for (const [cle, label] of Object.entries(SAISONS)) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `saison-${cle}`;
  b.dataset.saison = cle;
  b.textContent = label;
  b.onclick = () => {
    brouillon.saison = brouillon.saison === cle ? "" : cle;
    majSaisons();
  };
  $("f-saisons").appendChild(b);
}
function majSaisons() {
  for (const b of $("f-saisons").children) b.classList.toggle("actif", b.dataset.saison === brouillon.saison);
}

// Boutons de type de voyage, même principe que les saisons
for (const [cle, f] of Object.entries(FORMULES)) {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.formule = cle;
  b.textContent = f.label;
  b.onclick = () => {
    brouillon.formule = brouillon.formule === cle ? "" : cle;
    majFormules();
  };
  $("f-formules").appendChild(b);
}
function majFormules() {
  for (const b of $("f-formules").children) b.classList.toggle("actif", b.dataset.formule === brouillon.formule);
}

// « Mathis te propose un week-end à Paris · 12–14 décembre 2026 » (ou « veut visiter Paris avec toi »)
function texteProposition(l) {
  const qui = PERSONNES[l.ajoutePar] || l.ajoutePar;
  const texte = FORMULES[l.formule]
    ? `${qui} te propose ${FORMULES[l.formule].texte} à ${l.nom}`
    : `${qui} veut visiter ${l.nom} avec toi`;
  return l.envisageDebut ? `${texte} · ${formaterSejour({ debut: l.envisageDebut, fin: l.envisageFin })}` : texte;
}

function ouvrirFiche(id, nouveau) {
  if (id) retirerTemp();
  ficheId = id;
  brouillon = id ? structuredClone(lieux[id]) : nouveau;

  $("f-nom").value = brouillon.nom || "";
  $("f-pays").textContent = brouillon.pays ? avecDrapeau(brouillon.codePays, brouillon.pays) : "";
  $("f-categorie").value = brouillon.categorie || "autre";
  $("f-note").value = brouillon.note || "";
  $("f-priorite").checked = !!brouillon.priorite;
  majSaisons();
  brouillon.formule ||= "";
  majFormules();
  $("f-env-debut").value = brouillon.envisageDebut || "";
  $("f-env-fin").value = brouillon.envisageFin || "";
  $("f-env-fin").min = brouillon.envisageDebut || "";
  // Petit mot : on l'écrit en proposant un nouveau lieu, ensuite il est seulement affiché
  $("f-mot-pour").textContent = autre() || "l'autre";
  $("f-mot").value = "";
  $("f-mot-bloc").hidden = !!id;
  $("f-mot-lu").hidden = !(id && brouillon.mot);
  if (id && brouillon.mot) $("f-mot-lu").textContent = `« ${brouillon.mot} » — ${PERSONNES[brouillon.ajoutePar] || ""}`;
  $("f-visite").checked = !!brouillon.visite;
  brouillon.sejours = sejoursDe(brouillon).map((x) => ({ ...x }));
  $("f-debut").value = "";
  $("f-fin").value = "";
  $("f-fin").min = "";
  majSejours();
  $("f-coup-de-coeur").checked = !!brouillon.coupDeCoeur;
  // Ancienne date au mois (avant les dates exactes) : affichée en rappel tant qu'on n'a pas mis de jours
  $("f-ancienne-date").hidden = !brouillon.dateVisite || brouillon.sejours.length > 0;
  if (brouillon.dateVisite) $("f-ancienne-date").textContent = `Date notée avant : ${moisEnLettres(brouillon.dateVisite)}`;
  majRetour();
  majPasseAvenir();
  $("f-supprimer").hidden = !id;
  $("f-meta").textContent = id && brouillon.ajoutePar
    ? `Ajouté par ${PERSONNES[brouillon.ajoutePar] || brouillon.ajoutePar}` : "";

  $("fiche").hidden = false;
  $("fiche-fond").hidden = false;
}

function fermerFiche() {
  $("fiche").hidden = true;
  $("fiche-fond").hidden = true;
  ficheId = null;
  brouillon = null;
  retirerTemp();
}

// « On y est allés » coché : dates, coup de cœur et notes au passé ; sinon priorité et notes au futur
function majPasseAvenir() {
  const visite = $("f-visite").checked;
  $("f-bloc-passe").hidden = !visite;
  $("f-bloc-avenir").hidden = visite;
  $("f-note").placeholder = visite
    ? "Ce qu'on a fait, nos souvenirs, nos bonnes adresses…"
    : "Ce qu'on veut y faire, une idée…";
}
$("f-visite").onchange = () => {
  if ($("f-visite").checked && !$("f-debut").value && $("f-env-debut").value) {
    $("f-debut").value = $("f-env-debut").value;
    $("f-fin").value = $("f-env-fin").value || $("f-env-debut").value;
  }
  majPasseAvenir();
};

// Liste des séjours (✕ pour en retirer un, pris en compte à l'enregistrement)
function majSejours() {
  const ul = $("f-sejours");
  ul.innerHTML = "";
  brouillon.sejours.forEach((sejour, i) => {
    const li = document.createElement("li");
    li.textContent = formaterSejour(sejour);
    const x = document.createElement("button");
    x.type = "button";
    x.textContent = "✕";
    x.setAttribute("aria-label", "Retirer ce séjour");
    x.onclick = () => { brouillon.sejours.splice(i, 1); majSejours(); };
    li.appendChild(x);
    ul.appendChild(li);
  });
  $("f-sejours-bloc").hidden = !brouillon.sejours.length;
  $("f-dates-titre").textContent = brouillon.sejours.length ? "Ajouter un séjour" : "Dates du séjour";
}

// « Y retourner » : seulement pour un lieu déjà enregistré comme visité
function majRetour() {
  const l = brouillon;
  const enregistreVisite = !!ficheId && !!lieux[ficheId]?.visite;
  $("f-retour-bloc").hidden = !enregistreVisite;
  $("f-retour").hidden = !!l.retour;
  $("f-retour-info").textContent = l.retour === "oui" ? "🔁 On y retourne !"
    : retourEnAttente(l) ? `🔁 Retour proposé, en attente de ${autre()}`
    : retourADecider(l) ? `🔁 ${PERSONNES[l.retourPar]} propose d'y retourner`
    : "";
  // On peut annuler un retour accepté, ou sa propre proposition (l'autre répond avec la bannière)
  $("f-retour-annuler").hidden = !(l.retour === "oui" || retourEnAttente(l));
}

// Écrit tout de suite, à part du reste de la fiche
$("f-retour").onclick = async () => {
  brouillon.retour = "propose";
  brouillon.retourPar = moi;
  majRetour();
  await update(ref(db, `${cheminLieux}/${ficheId}`), { retour: "propose", retourPar: moi });
};
$("f-retour-annuler").onclick = async () => {
  brouillon.retour = null;
  brouillon.retourPar = null;
  majRetour();
  await update(ref(db, `${cheminLieux}/${ficheId}`), { retour: null, retourPar: null });
};

// La date de fin ne peut pas être avant celle du début (séjour et dates envisagées)
for (const [debut, fin] of [["f-debut", "f-fin"], ["f-env-debut", "f-env-fin"]]) {
  $(debut).onchange = () => {
    $(fin).min = $(debut).value;
    if (!$(fin).value || $(fin).value < $(debut).value) $(fin).value = $(debut).value;
  };
}

const moisEnLettres = (aaaamm) =>
  new Date(`${aaaamm}-01T12:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

$("fiche").addEventListener("submit", async (e) => {
  e.preventDefault();
  const visite = $("f-visite").checked;
  // Le séjour saisi dans Du / Au s'ajoute à la liste
  const nouveauSejour = visite && $("f-debut").value
    ? { debut: $("f-debut").value, fin: $("f-fin").value || $("f-debut").value } : null;
  if (nouveauSejour && nouveauSejour.fin < nouveauSejour.debut) {
    alert("La date de fin est avant la date de début.");
    return;
  }
  const sejours = visite ? [...brouillon.sejours, ...(nouveauSejour ? [nouveauSejour] : [])] : [];
  sejours.sort((a, b) => a.debut.localeCompare(b.debut));
  const donnees = {
    nom: $("f-nom").value.trim(),
    categorie: $("f-categorie").value,
    note: $("f-note").value.trim(),
    saison: brouillon.saison || "",
    visite,
    // Priorité pour un lieu à visiter, coup de cœur pour un lieu visité
    priorite: !visite && $("f-priorite").checked,
    coupDeCoeur: visite && $("f-coup-de-coeur").checked,
    sejours: sejours.length ? sejours : null,
    dateDebut: null, // remplacés par sejours
    dateFin: null,
    // L'ancienne date au mois est gardée tant qu'aucune date exacte ne la remplace
    dateVisite: visite && !sejours.length ? brouillon.dateVisite || "" : null,
  };
  // Projet (type de voyage, dates envisagées) : seulement pour un lieu à visiter
  const envisageDebut = $("f-env-debut").value;
  const envisageFin = envisageDebut ? $("f-env-fin").value || envisageDebut : "";
  if (!visite && envisageFin < envisageDebut) {
    alert("La date de fin envisagée est avant la date de début.");
    return;
  }
  Object.assign(donnees, {
    formule: visite ? null : brouillon.formule || null,
    envisageDebut: visite ? null : envisageDebut || null,
    envisageFin: visite ? null : envisageFin || null,
  });
  // Nouveau séjour ajouté (on y est retournés) ou plus visité : le retour prévu est terminé
  if (nouveauSejour || !visite) Object.assign(donnees, { retour: null, retourPar: null });
  if (!donnees.nom) return;
  try {
    if (ficheId) {
      // Efface les anciens champs : cœurs (remplacés par la priorité) et vuPar (remplacé par la bannière)
      await update(ref(db, `${cheminLieux}/${ficheId}`), { ...donnees, coeurs: null, vuPar: null });
    } else {
      await push(lieuxRef, {
        ...donnees,
        lat: brouillon.lat,
        lng: brouillon.lng,
        pays: brouillon.pays || "",
        codePays: brouillon.codePays || "",
        ajoutePar: moi,
        mot: $("f-mot").value.trim() || null,
        propose: true, // en attente de l'accord de l'autre
        creeLe: serverTimestamp(),
      });
    }
    fermerFiche();
  } catch (err) {
    alert("Enregistrement impossible : " + err.message);
  }
});

$("f-supprimer").onclick = async () => {
  if (!ficheId || !confirm(`Supprimer « ${brouillon.nom} » ?`)) return;
  // On ferme d'abord : la synchro ne doit pas croire que c'est l'autre qui a supprimé
  const id = ficheId;
  fermerFiche();
  await remove(ref(db, `${cheminLieux}/${id}`));
};

$("f-fermer").onclick = fermerFiche;
$("fiche-fond").onclick = fermerFiche;
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("fiche").hidden) fermerFiche();
});

/* ---------- Filtres ---------- */
for (const b of document.querySelectorAll("[data-filtre]")) {
  b.onclick = () => {
    filtre = b.dataset.filtre;
    document.querySelectorAll("[data-filtre]").forEach((x) => x.classList.toggle("actif", x === b));
    rendre();
  };
}

/* ---------- Bannière : propositions et refus ---------- */
// Affiche d'abord les refus qui me concernent, puis les lieux que l'autre me propose, un à la fois
function majBanniere() {
  const etaitCachee = $("banniere").hidden;
  afficherBanniere();
  // La bannière pousse la carte vers le bas : Leaflet doit recalculer sa taille
  if ($("banniere").hidden !== etaitCachee) carte.invalidateSize();
}
function afficherBanniere() {
  const banniere = $("banniere");
  const actions = $("banniere-actions");
  actions.innerHTML = "";
  const bouton = (texte, classe, action) => {
    const b = document.createElement("button");
    b.textContent = texte;
    b.className = classe;
    b.onclick = action;
    actions.appendChild(b);
  };

  const refus = PERSONNES[moi] && Object.entries(avis).find(([, a]) => a.pour === moi);
  if (refus) {
    const [idAvis, a] = refus;
    const qui = PERSONNES[a.par] || a.par;
    $("banniere-texte").textContent = a.retour
      ? `${qui} ne veut pas retourner à ${a.nom} pour l'instant`
      : `${qui} n'a pas retenu ${a.nom}`;
    $("banniere-mot").hidden = true;
    bouton("OK", "principal", () => remove(ref(db, `${cheminAvis}/${idAvis}`)));
    banniere.hidden = false;
    return;
  }

  const proposition = PERSONNES[moi] && (Object.entries(lieux).find(([, l]) => aDecider(l))
    || Object.entries(lieux).find(([, l]) => retourADecider(l)));
  if (!proposition) { banniere.hidden = true; return; }
  const [id, l] = proposition;
  const estRetour = retourADecider(l);
  $("banniere-texte").textContent = estRetour
    ? `${PERSONNES[l.retourPar] || l.retourPar} veut retourner à ${l.nom} avec toi`
    : texteProposition(l);
  $("banniere-mot").hidden = estRetour || !l.mot;
  $("banniere-mot").textContent = l.mot ? `« ${l.mot} »` : "";
  bouton("Voir", "secondaire", () => {
    carte.flyTo([l.lat, l.lng], l.categorie === "pays" ? 4 : 6);
    ouvrirFiche(id);
  });
  bouton("Refuser", "danger", () => {
    // En une seule écriture : avis pour l'autre, et suppression du lieu proposé
    // (un retour refusé garde le lieu dans « Visités », on retire juste le retour)
    const idAvis = push(ref(db, cheminAvis)).key;
    update(ref(db, `espaces/${ESPACE_ID}`), estRetour ? {
      [`lieux/${id}/retour`]: null,
      [`lieux/${id}/retourPar`]: null,
      [`avis/${idAvis}`]: { pour: l.retourPar, par: moi, nom: l.nom, retour: true },
    } : {
      [`lieux/${id}`]: null,
      [`avis/${idAvis}`]: { pour: l.ajoutePar, par: moi, nom: l.nom },
    });
  });
  bouton("Accepter", "principal", () => {
    if (!lieux[id]) return;
    if (estRetour) set(ref(db, `${cheminLieux}/${id}/retour`), "oui");
    else set(ref(db, `${cheminLieux}/${id}/propose`), null);
  });
  banniere.hidden = false;
}

/* ---------- Synchronisation temps réel ---------- */
onValue(ref(db, cheminAvis), (snap) => {
  avis = snap.val() || {};
  majBanniere();
});

let premierChargement = true;
onValue(lieuxRef, (snap) => {
  lieux = snap.val() || {};
  rendre();
  // L'autre personne a supprimé le lieu dont la fiche est ouverte : on ferme,
  // sinon « Enregistrer » ou le cœur le recréeraient à moitié.
  if (ficheId && !lieux[ficheId]) {
    const nom = brouillon.nom;
    fermerFiche();
    alert(`« ${nom} » vient d'être supprimé.`);
  }
  if (premierChargement) { premierChargement = false; cadrer(); }
  completerCodesPays();
});

// Les lieux ajoutés avant le classement par continent n'ont pas de codePays :
// on le retrouve un par un, une requête par seconde au plus (règle de Nominatim).
const dejaEssayes = new Set();
let completionEnCours = false;
async function completerCodesPays() {
  if (completionEnCours) return;
  completionEnCours = true;
  for (const [id, l] of Object.entries(lieux)) {
    if ("codePays" in l || dejaEssayes.has(id)) continue;
    dejaEssayes.add(id);
    const { code } = await lieuProche(l.lat, l.lng);
    // Pas de réponse : on réessaiera au prochain lancement.
    // Lieu supprimé entre-temps : on n'écrit rien pour ne pas le recréer.
    if (code !== null && lieux[id]) set(ref(db, `${cheminLieux}/${id}/codePays`), code);
    await new Promise((ok) => setTimeout(ok, 1100));
  }
  completionEnCours = false;
}

/* ---------- PWA ---------- */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

/* ---------- Notifications (envoyées par Firebase Functions, voir functions/index.js) ---------- */
// Sur iPhone, seulement dans l'app ajoutée à l'écran d'accueil (iOS 16.4 ou plus récent)
const notifPossibles = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function cleDepuisBase64(b64) {
  const brut = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(brut, (c) => c.charCodeAt(0));
}

// Range l'abonnement de cet appareil dans espaces/<id>/abonnements/<empreinte>, avec la personne
async function enregistrerAbonnement(abonnement) {
  const empreinte = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(abonnement.endpoint));
  const cle = [...new Uint8Array(empreinte)].map((o) => o.toString(16).padStart(2, "0")).join("").slice(0, 32);
  await set(ref(db, `espaces/${ESPACE_ID}/abonnements/${cle}`), { ...abonnement.toJSON(), qui: moi });
}

// Le bouton 🔔 reste visible tant que cet appareil n'est pas abonné.
// Déjà autorisé : on réenregistre l'abonnement (il peut changer, ou la personne aussi).
async function majNotifications() {
  if (!notifPossibles || !PERSONNES[moi]) { $("btn-notif").hidden = true; return; }
  let abonnement = null;
  if (Notification.permission === "granted") {
    abonnement = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (abonnement) enregistrerAbonnement(abonnement).catch(() => {});
  }
  $("btn-notif").hidden = !!abonnement;
}

$("btn-notif").onclick = async () => {
  try {
    if (await Notification.requestPermission() !== "granted") {
      alert("Les notifications sont bloquées. Pour les autoriser : Réglages > Notifications > Voyage.");
      return;
    }
    const inscription = await navigator.serviceWorker.ready;
    const abonnement = await inscription.pushManager.getSubscription()
      || await inscription.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleDepuisBase64(VAPID_PUBLIQUE) });
    await enregistrerAbonnement(abonnement);
    $("btn-notif").hidden = true;
  } catch (err) {
    alert("Impossible d'activer les notifications : " + err.message);
  }
};

majNotifications();
