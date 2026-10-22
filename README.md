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

## Cahier des cours

`app/learning.js` gère les séries de questions, les corrigés, leurs extraits de référence et les bilans. Les réponses ne sont conservées que dans la mémoire de la fenêtre et sont effacées à la déconnexion ou au changement d’édition. Le lecteur présente les extraits publiés ; il ne fournit pas d’accès direct aux documents de cours complets. `tests/learning.cjs` vérifie les QCM et vrai/faux, les doubles réponses, la reprise des erreurs et l’échappement des contenus.

## Navigation et connexion — 0.14.0

Les pages Présentation, Notifications, Confidentialité et ouverture du PDF partagent une navigation basse dans `shell.css`. Le lecteur conserve sa navigation de lecture et propose les mêmes pages dans ses réglages et rubriques. Les réglages sont accessibles sans connexion. Le badge « Privé » a été retiré de l’en-tête.

Sur GitHub Pages, la connexion utilise toujours le jeton temporaire en mémoire ; le choix du compte n’est plus imposé à chaque demande. La connexion durable est préparée dans `session-server/`, avec cookie HttpOnly, autorisations Google chiffrées et stockage Firestore privé. Elle nécessite un hébergement du lecteur et du serveur sur **la même origine**. Aucun service Google Cloud ni nouvelle autorisation n’est créé par la publication de ce code. Voir [la procédure de mise en service](session-server/README.md).

`npm test` exécute sept suites sans accès à Google. `npm --prefix session-server test` contrôle le serveur avec des échanges HTTP locaux, un stockage et un fournisseur simulés ; les dépendances du serveur doivent d’abord être installées avec `npm ci --ignore-scripts --prefix session-server`. Le workflow de vérification inclut ces contrôles et la construction du conteneur, sans déploiement ni secret.
