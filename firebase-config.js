// Config du projet Firebase « voyage-73f48 » (serveur aux États-Unis).
// Ces valeurs ne sont pas secrètes : elles peuvent être publiques.
export const firebaseConfig = {
  apiKey: "AIzaSyAcZTjnUnqyxYQ4OOpDJdNhT-LUPClUqeo",
  authDomain: "voyage-73f48.firebaseapp.com",
  databaseURL: "https://voyage-73f48-default-rtdb.firebaseio.com",
  projectId: "voyage-73f48",
  storageBucket: "voyage-73f48.firebasestorage.app",
  messagingSenderId: "917877265095",
  appId: "1:917877265095:web:b1dba0d347c9b8da9ba4e2",
};

// L'identifiant secret de l'espace n'est PAS ici (ce fichier est public sur GitHub).
// Il arrive par le lien : https://…/voyage/#identifiant-secret
// puis il est gardé sur l'appareil.

// Les deux personnes qui partagent la carte.
export const PERSONNES = {
  A: "Mathis",
  B: "Clara",
};

// Clé publique des notifications (Web Push). Pas secrète : la clé privée
// correspondante est rangée dans les secrets Firebase (VAPID_PRIVEE).
export const VAPID_PUBLIQUE = "BM2sR4HT6G-6-qjCf-aKncJhAOGEMm3RArkliNNYl2ACiOk5kwx6ubRzEQWA-mMNnTWmZnFgK_vkIUt0DBUu5Fo";
