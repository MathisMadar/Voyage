# Voyage

App web partagée entre deux personnes pour lister les endroits du monde qu'on veut visiter ensemble (villes, pays, sites naturels, monuments). Les deux voient la même carte en temps réel.

## Stack
HTML, CSS et JavaScript sans framework ni build. Firebase Realtime Database pour la synchro (SDK modulaire v10 chargé depuis gstatic). Leaflet 1.9.4 avec les tuiles OpenStreetMap pour la carte. Nominatim (OpenStreetMap) pour la recherche et pour trouver la ville la plus proche d'un point touché. PWA installable sur iPhone. Déploiement prévu sur GitHub Pages.

## Fichiers
`index.html` structure de la page. `style.css` styles, couleurs dans les variables `:root`. `app.js` toute la logique (module ES). `firebase-config.js` config Firebase et prénoms des deux personnes (Mathis et Clara). `manifest.json` et `sw.js` pour la PWA. `icons/` icônes.

## Données
Pas d'authentification : un identifiant secret dans le chemin sert de protection. Le dépôt GitHub étant public, cet identifiant n'est jamais dans le code : il arrive par le lien (`…/voyage/#identifiant`) ou est collé à l'écran au premier lancement, puis gardé dans le localStorage (`voyage-espace`).
Chemin : `espaces/<ESPACE_ID>/lieux/<id>` avec les champs `nom`, `pays`, `codePays` (code ISO en minuscules donné par Nominatim, vide en pleine mer, sert au classement par continent ; complété automatiquement pour les anciens lieux), `categorie` (ville, pays, nature, plage, monument, autre), `note`, `saison` (printemps, ete, automne, hiver ou vide ; une seule, le nom du lieu s'affiche dans sa couleur), `lat`, `lng`, `visite` (booléen), `dateVisite` (format AAAA-MM), `priorite` (booléen commun aux deux, « on veut y aller en premier », ces lieux passent en tête de liste), `propose` (true tant que l'autre personne n'a pas accepté le lieu ; caché chez elle et remplacé par une bannière « X veut visiter Y avec toi » avec Voir / Refuser / Accepter ; absent = accepté), `ajoutePar` (A ou B), `creeLe` (timestamp serveur).
Refuser supprime le lieu et écrit en même temps un avis dans `espaces/<ESPACE_ID>/avis/<id>` ({`pour`, `par`, `nom`}) : la personne qui avait proposé voit « X n'a pas retenu Y » et l'efface avec OK. Les anciens champs `coeurs` (remplacés par `priorite`) et `vuPar` (ancienne pastille « Nouveau », remplacée par la bannière) sont effacés à l'enregistrement d'une fiche.
La personne courante (A ou B) est gardée dans le localStorage de l'appareil (`voyage-moi`).

Règles Realtime Database conseillées :
```json
{ "rules": { "espaces": { "$id": { ".read": true, ".write": true } } } }
```

## Conventions
Interface et commentaires en français. Mobile d'abord (usage principal sur iPhone en PWA), la mise en page passe en deux colonnes au-dessus de 900px.
Nominatim demande au plus une requête par seconde : ne pas lancer de recherche à chaque frappe, seulement à la validation.
Quand on modifie un fichier de l'app, augmenter la version de `CACHE` dans `sw.js`.
Ne jamais renommer ni déplacer les fichiers ou dossiers sans que je le demande.
Je préfère être guidé : expliquer brièvement les changements proposés plutôt que tout réécrire d'un coup.

## Pistes
Photo souvenir pour un lieu visité, liste de choses à faire sur place, saison idéale, budget estimé, regroupement par voyage.
