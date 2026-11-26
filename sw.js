// Service worker minimal : permet l'installation en PWA.
// Réseau d'abord pour les fichiers de l'app, cache en secours si hors ligne.
// Firebase, la carte et la recherche passent directement par le réseau.
const CACHE = "voyage-v23";
const FICHIERS = ["./", "index.html", "style.css", "app.js", "firebase-config.js", "manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((cles) => Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((rep) => {
        const copie = rep.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copie));
        return rep;
      })
      .catch(() => caches.match(e.request))
  );
});

// Notification envoyée par Firebase Functions (voir functions/index.js)
self.addEventListener("push", (e) => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(d.titre || "Voyage", {
    body: d.texte || "",
    icon: "icons/icon-192.png",
  }));
});

// Toucher la notification ouvre l'app (ou la ramène au premier plan)
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((fenetres) => (fenetres.length ? fenetres[0].focus() : self.clients.openWindow("./")))
  );
});
