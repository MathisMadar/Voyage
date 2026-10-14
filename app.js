import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, update, remove, set, onValue, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig, PERSONNES } from "./firebase-config.js";

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

/* ---------- Données de l'app ---------- */
const CATEGORIES = {
  ville:    { label: "Ville",          emoji: "🏙️" },
  pays:     { label: "Pays ou région", emoji: "🗺️" },
  nature:   { label: "Nature",         emoji: "🏔️" },
  plage:    { label: "Plage, île",     emoji: "🏝️" },
  monument: { label: "Monument, site", emoji: "🏛️" },
  autre:    { label: "Autre",          emoji: "📍" },
};

let lieux = {};         // { id: lieu } tel que dans Firebase
let filtre = "avisiter"; // avisiter | visite | tous
let marqueurs = {};      // { id: L.marker }
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
      rendre(); // les pastilles « Nouveau » dépendent de qui regarde
    };
    boite.appendChild(b);
  }
  $("choix-moi").hidden = false;
}
function majMoi() {
  $("btn-moi").textContent = PERSONNES[moi] || "?";
}
$("btn-moi").onclick = choisirMoi;
majMoi();
if (!PERSONNES[moi]) choisirMoi();

/* ---------- Carte ---------- */
const carte = L.map("carte", { zoomControl: false, worldCopyJump: true }).setView([30, 10], 2);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: "© OpenStreetMap",
}).addTo(carte);

function icone(lieu) {
  const cat = CATEGORIES[lieu.categorie] || CATEGORIES.autre;
  return L.divIcon({
    className: "",
    html: `<div class="epingle${lieu.visite ? " visite" : ""}${estNouveau(lieu) ? " nouveau" : ""}">`
      + `<span>${cat.emoji}</span></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
  });
}

function montrerTemp(lat, lng) {
  retirerTemp();
  marqueurTemp = L.marker([lat, lng], { icon: icone({ categorie: "autre" }) }).addTo(carte);
}
function retirerTemp() {
  if (marqueurTemp) { marqueurTemp.remove(); marqueurTemp = null; }
}

function cadrer() {
  const points = Object.values(lieux).map((l) => [l.lat, l.lng]);
  if (points.length === 1) carte.setView(points[0], 6);
  else if (points.length > 1) carte.fitBounds(points, { padding: [40, 40], maxZoom: 6 });
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
  $("f-pays").textContent = info.pays;
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

async function lieuProche(lat, lng) {
  try {
    // zoom=10 : niveau ville, pas adresse
    const r = await fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10"
      + `&accept-language=fr&lat=${lat}&lon=${lng}`);
    const d = await r.json();
    const a = d.address || {};
    return {
      nom: a.city || a.town || a.village || a.state || d.name || "",
      pays: a.country || "",
    };
  } catch {
    return { nom: "", pays: "" };
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
          nom: r.name || r.display_name.split(",")[0],
          pays: categorie === "pays" ? "" : (r.address?.country || ""),
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
const nbCoeurs = (l) => Object.values(l.coeurs || {}).filter(Boolean).length;
// Ajouté par l'autre personne et pas encore ouvert par moi
const estNouveau = (l) => !!l.ajoutePar && l.ajoutePar !== moi && !l.vuPar?.[moi];

function rendre() {
  // Épingles : on enlève celles supprimées, on crée ou met à jour les autres
  for (const id of Object.keys(marqueurs)) {
    if (!lieux[id]) { marqueurs[id].remove(); delete marqueurs[id]; }
  }
  for (const [id, l] of Object.entries(lieux)) {
    if (marqueurs[id]) {
      marqueurs[id].setLatLng([l.lat, l.lng]).setIcon(icone(l));
    } else {
      marqueurs[id] = L.marker([l.lat, l.lng], { icon: icone(l) })
        .addTo(carte)
        .on("click", () => ouvrirFiche(id));
    }
  }

  // Liste filtrée, groupée par pays
  const visibles = Object.entries(lieux)
    .filter(([, l]) => filtre === "tous" || (filtre === "visite" ? l.visite : !l.visite))
    .sort(([, a], [, b]) => nbCoeurs(b) - nbCoeurs(a) || a.nom.localeCompare(b.nom, "fr"));

  const groupes = {};
  for (const entree of visibles) {
    const pays = entree[1].pays || "Autres";
    (groupes[pays] ||= []).push(entree);
  }

  const conteneur = $("liste-lieux");
  conteneur.innerHTML = "";
  for (const pays of Object.keys(groupes).sort((a, b) => a.localeCompare(b, "fr"))) {
    const titre = document.createElement("h2");
    titre.textContent = pays;
    conteneur.appendChild(titre);
    const ul = document.createElement("ul");
    for (const [id, l] of groupes[pays]) ul.appendChild(elementLieu(id, l));
    conteneur.appendChild(ul);
  }
  $("vide").hidden = visibles.length > 0;
}

function elementLieu(id, l) {
  const cat = CATEGORIES[l.categorie] || CATEGORIES.autre;
  const li = document.createElement("li");
  li.className = "lieu" + (l.visite ? " visite" : "");
  li.innerHTML = `<span class="lieu-emoji">${cat.emoji}</span>
    <div class="lieu-texte"><strong></strong><small></small></div>
    <span class="lieu-nouveau"${estNouveau(l) ? "" : " hidden"}>Nouveau</span>
    <span class="lieu-coeurs"></span>`;
  li.querySelector("strong").textContent = l.nom;
  li.querySelector("small").textContent = l.note ? l.note.split("\n")[0] : "";
  li.querySelector(".lieu-coeurs").textContent = "♥".repeat(nbCoeurs(l));
  li.onclick = () => {
    carte.flyTo([l.lat, l.lng], Math.max(carte.getZoom(), 6));
    ouvrirFiche(id);
  };
  return li;
}

/* ---------- Fiche d'un lieu ---------- */
for (const [cle, c] of Object.entries(CATEGORIES)) {
  $("f-categorie").add(new Option(`${c.emoji} ${c.label}`, cle));
}

function ouvrirFiche(id, nouveau) {
  if (id) retirerTemp();
  // Ouvrir la fiche marque le lieu comme vu (écrit à part, comme les cœurs)
  if (id && estNouveau(lieux[id])) set(ref(db, `${cheminLieux}/${id}/vuPar/${moi}`), true);
  ficheId = id;
  brouillon = id ? structuredClone(lieux[id]) : nouveau;
  brouillon.coeurs ||= {};

  $("f-nom").value = brouillon.nom || "";
  $("f-pays").textContent = brouillon.pays || "";
  $("f-categorie").value = brouillon.categorie || "autre";
  $("f-note").value = brouillon.note || "";
  $("f-visite").checked = !!brouillon.visite;
  $("f-date").value = brouillon.dateVisite || "";
  $("f-date-bloc").hidden = !brouillon.visite;
  $("f-supprimer").hidden = !id;
  $("f-meta").textContent = id && brouillon.ajoutePar
    ? `Ajouté par ${PERSONNES[brouillon.ajoutePar] || brouillon.ajoutePar}` : "";
  majCoeur();

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

function majCoeur() {
  const mien = !!brouillon.coeurs[moi];
  $("f-coeur").textContent = mien ? "♥ J'ai envie" : "♡ J'ai envie";
  $("f-coeur").classList.toggle("actif", mien);
  const autres = Object.entries(brouillon.coeurs)
    .filter(([cle, v]) => v && cle !== moi)
    .map(([cle]) => PERSONNES[cle] || cle);
  $("f-coeurs-info").textContent = autres.length ? `${autres.join(", ")} aussi` : "";
}

// Le cœur d'un lieu existant est enregistré tout de suite, à part du reste,
// pour ne pas écraser celui de l'autre personne.
$("f-coeur").onclick = () => {
  const valeur = !brouillon.coeurs[moi];
  brouillon.coeurs[moi] = valeur;
  majCoeur();
  if (ficheId) set(ref(db, `${cheminLieux}/${ficheId}/coeurs/${moi}`), valeur || null);
};

$("f-visite").onchange = () => {
  $("f-date-bloc").hidden = !$("f-visite").checked;
};

$("fiche").addEventListener("submit", async (e) => {
  e.preventDefault();
  const visite = $("f-visite").checked;
  const donnees = {
    nom: $("f-nom").value.trim(),
    categorie: $("f-categorie").value,
    note: $("f-note").value.trim(),
    visite,
    dateVisite: visite ? $("f-date").value : "",
  };
  if (!donnees.nom) return;
  try {
    if (ficheId) {
      await update(ref(db, `${cheminLieux}/${ficheId}`), donnees);
    } else {
      await push(lieuxRef, {
        ...donnees,
        lat: brouillon.lat,
        lng: brouillon.lng,
        pays: brouillon.pays || "",
        coeurs: brouillon.coeurs,
        ajoutePar: moi,
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

/* ---------- Synchronisation temps réel ---------- */
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
});

/* ---------- PWA ---------- */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
