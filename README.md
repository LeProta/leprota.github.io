# Le Journal Financier — interface privée

Interface statique publiée sur GitHub Pages. Le site public contient l’interface, les illustrations de rubrique, les polices et l’identifiant OAuth **public**. Les articles, cours, PDF, jetons Google, abonnements de notification et clés privées restent hors du dépôt public.

## Organisation

- `design-system.css` : couleurs sémantiques, polices et règles de base.
- `components.css` : boutons, sélections et états interactifs communs à toutes les pages. Modifier ces composants ici plutôt que dans les styles iOS.
- `appearance.js` : préférence clair/sombre/automatique commune aux pages, y compris au retour de navigation.
- `styles.css` : disposition des pages de présentation, réception, notifications et confidentialité.
- `app/app.css` : dispositions du lecteur, composants éditoriaux et adaptations iOS. Les dispositions spécifiques ne redéfinissent pas les boutons partagés.
- `app/app.js` : vues, navigation, recherche et exercices. L’index de recherche reste en mémoire de session et est retiré avec les contenus privés.
- `app/drive-reader.js` : connexion Google, vérification des fichiers et chargements privés. Les réponses obsolètes ne remplacent pas une sélection récente.
- `app/reader-contract.js` : validation des formats reçus.
- `app/ios-ui.js` : partage système du lien public de la source et intégrations progressives iOS.
- `viewport-layout.js` : adaptation à la réduction de la zone visible lors d’une saisie.
- `notifications.html`, `notifications.js`, `sw.js`, `storage.js` : inscription volontaire et réception Web Push. Aucun envoi ne part automatiquement de la page.

Le lecteur ne fait que consulter Drive. Sa portée OAuth `drive.file` inclut toutefois la gestion des fichiers de l’application : les droits demandés sont explicités sur la page de connexion. Le jeton reste en mémoire, sans clé privée dans le site.

## Vérification locale

Avec Node.js 22 ou plus récent :

```sh
npm test
```

Aucune installation de dépendance n’est nécessaire. Les trois suites exécutent le code du lecteur avec des réponses Google simulées et des données synthétiques : intégrité, refus d’accès, expiration, déconnexion, réponses arrivant dans le désordre, PDF interrompu et préférence d’apparence. Elles ne prouvent pas l’accès à Google ni le rendu matériel sur iPhone.

Les changements d’interface doivent aussi être contrôlés dans un navigateur : thèmes clair et sombre, petit écran, paysage, lecture, quiz et pages publiques. Les ressources modifiées portent un identifiant de version dans les liens HTML pour éviter une ancienne interface en cache.

## Confidentialité et livraison

Ne jamais déposer ici les exports d’articles, un dossier de contrôle local, un PDF privé, un JSON Google d’authentification, un abonnement Web Push ou une clé VAPID privée. La clé publique VAPID et l’identifiant public OAuth peuvent être publiés. Les chemins de publication des contenus et leurs secrets restent dans le dépôt privé du journal.

Les liens de présentation et de confidentialité utilisés par Google Auth Platform sont conservés. La génération quotidienne et les appels IA sont gérés séparément de cette interface.
