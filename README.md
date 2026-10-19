# Le Journal Financier — site public et notifications

Présentation et confidentialité du composant personnel d’archivage, plus application web installable. Le code de production du journal, les cours, les PDF, les liens Drive et les identifiants restent privés.

- `notifications.html` : installation iPhone, permission volontaire et copie d’un abonnement vers un secret GitHub privé. Aucun serveur d’inscription.
- `manifest.webmanifest`, `icon-*.png` : identité de l’application.
- `sw.js` : réception chiffrée Web Push et affichage ; aucune mise en cache des PDF.
- `lecture.html` : accès au lien reçu, stocké uniquement sur l’appareil.
- `push-config.json` : clé **publique** VAPID ; la clé privée correspondante doit rester dans les secrets du dépôt privé.
- `index.html` et `confidentialite.html` : URLs conservées pour Google Auth Platform.

La configuration seule ne prouve pas la réception. Tester depuis GitHub puis confirmer sur l’iPhone avant de remplacer Pushcut. Ne jamais publier d’abonnement ou de clé privée ici.
