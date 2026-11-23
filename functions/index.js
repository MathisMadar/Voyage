// Notifications de l'app Voyage (Web Push), envoyées par Firebase Functions :
// - un lieu est proposé  -> notification à l'autre personne
// - une proposition est acceptée -> notification à la personne qui l'avait proposée
// Déploiement : firebase deploy --only functions (depuis le dossier du projet)
import { onValueCreated, onValueUpdated } from "firebase-functions/v2/database";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import * as webpush from "web-push";

initializeApp();

// Clé privée gardée dans les secrets Firebase (jamais dans le code)
const VAPID_PRIVEE = defineSecret("VAPID_PRIVEE");
// Clé publique : la même que VAPID_PUBLIQUE dans firebase-config.js
const VAPID_PUBLIQUE = "BM2sR4HT6G-6-qjCf-aKncJhAOGEMm3RArkliNNYl2ACiOk5kwx6ubRzEQWA-mMNnTWmZnFgK_vkIUt0DBUu5Fo";
// Les mêmes prénoms que dans firebase-config.js
const PERSONNES = { A: "Mathis", B: "Clara" };
const autre = (qui) => (qui === "A" ? "B" : "A");

// Envoie la notification à tous les appareils de la personne `pour`
async function notifier(espace, pour, titre, texte) {
  webpush.setVapidDetails("https://mathismadar.github.io/Voyage/", VAPID_PUBLIQUE, VAPID_PRIVEE.value());
  const base = getDatabase().ref(`espaces/${espace}/abonnements`);
  const abonnements = (await base.get()).val() || {};
  await Promise.all(Object.entries(abonnements)
    .filter(([, a]) => a.qui === pour)
    .map(async ([cle, a]) => {
      try {
        await webpush.sendNotification({ endpoint: a.endpoint, keys: a.keys }, JSON.stringify({ titre, texte }));
      } catch (err) {
        // Appareil qui n'accepte plus les notifications (app supprimée, autorisation retirée) : on l'oublie
        if (err.statusCode === 404 || err.statusCode === 410) await base.child(cle).remove();
        else console.error("Envoi impossible", err.statusCode, err.body);
      }
    }));
}

const options = {
  ref: "/espaces/{espace}/lieux/{lieu}",
  instance: "voyage-73f48-default-rtdb",
  secrets: [VAPID_PRIVEE],
};

export const lieuPropose = onValueCreated(options, async (event) => {
  const l = event.data.val();
  if (!l || !l.propose || !PERSONNES[l.ajoutePar]) return;
  await notifier(event.params.espace, autre(l.ajoutePar), "Nouvelle destination",
    `${PERSONNES[l.ajoutePar]} veut visiter ${l.nom} avec toi`);
});

export const lieuAccepte = onValueUpdated(options, async (event) => {
  const avant = event.data.before.val();
  const apres = event.data.after.val();
  // Seulement le passage « proposé » -> « accepté »
  if (!avant?.propose || apres?.propose || !PERSONNES[apres?.ajoutePar]) return;
  await notifier(event.params.espace, apres.ajoutePar, "Destination acceptée",
    `${PERSONNES[autre(apres.ajoutePar)]} a accepté ${apres.nom} 🎉`);
});
