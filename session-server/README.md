# Connexion durable — préparation GitHub

Le code est préparé pour héberger **le lecteur et son service de session sur la
même origine HTTPS**. GitHub Pages ne peut pas exécuter ce serveur : publier les
fichiers de ce dossier ne rend donc pas encore la connexion durable active.

## Fonctionnement

Le propriétaire se connecte à Google une première fois. Le serveur vérifie le
compte autorisé et garde les autorisations Google chiffrées dans Firestore.
Le navigateur reçoit uniquement un identifiant de session aléatoire dans un
cookie `__Host-`, `HttpOnly`, `Secure`, `SameSite=Lax`. Ni jeton Google ni secret
client ne sont mis dans le stockage JavaScript du navigateur.

À la réouverture, le lecteur retrouve la session. La bibliothèque officielle
Google renouvelle l’accès lorsque nécessaire. La session est prolongée lors de
l’ouverture du lecteur, avec trente jours d’inactivité autorisés. Google peut
révoquer ou limiter une autorisation : cette préparation ne promet pas une
connexion illimitée dans toutes les situations.

La portée reste `drive.file`. Le relais Drive ne propose que des requêtes GET ;
la connexion d’archivage de GitHub et celle des cours restent distinctes.
Se déconnecter supprime la session serveur, sans supprimer les journaux Drive
ni révoquer l’autorisation du composant d’archivage.

## Ce qui est déjà testable

Depuis la racine :

```sh
npm test
npm ci --ignore-scripts --prefix session-server
npm test --prefix session-server
docker build -f Dockerfile.session -t journal-session .
```

Le workflow `interface.yml` exécute ces étapes sans secret et sans déploiement.
Les échanges du serveur sont testés sur un port local avec Google et le
stockage simulés. La construction du conteneur vérifie le conditionnement,
pas une autorisation Google réelle ni le fonctionnement de Firestore distant.

## Configuration nécessaire avant mise en service

| Paramètre serveur          | Utilité                                                                          |
| -------------------------- | -------------------------------------------------------------------------------- |
| `APP_ORIGIN`               | Origine HTTPS exacte de la nouvelle application, sans chemin ni slash final.     |
| `GOOGLE_WEB_CLIENT_ID`     | Identifiant du client OAuth Web du projet du journal.                            |
| `GOOGLE_WEB_CLIENT_SECRET` | Secret de ce client Web, placé dans le gestionnaire de secrets de l’hébergement. |
| `SESSION_ENCRYPTION_KEY`   | Clé aléatoire de 32 octets encodée en base64, placée dans ce même gestionnaire.  |
| `OWNER_GOOGLE_EMAIL`       | Compte propriétaire autorisé, défini uniquement dans la configuration privée.    |
| `PORT`                     | Port fourni par l’hébergeur, 8080 par défaut.                                    |

Ne jamais enregistrer ces valeurs privées dans un fichier du dépôt, une capture
publique, le site ou le chat. Ne pas réutiliser le JSON d’archivage ou la clé du
lecteur des cours pour remplir ces paramètres. Le serveur utilise son identité
de service pour Firestore ; il ne nécessite pas de nouvelle clé de compte de
service téléchargée dans le code.

## Mise en place sur Google Cloud, à terminer par le propriétaire

1. Choisir l’hébergement HTTPS, par exemple Cloud Run, et examiner son coût ainsi
   que celui de Firestore et de la construction du conteneur. **Aucune dépense
   ni activation de facturation n’est autorisée ou effectuée par ce guide.**
2. Préparer une base Firestore et une identité d’exécution dédiée à ce lecteur.
   Lui donner uniquement les accès nécessaires à la collection privée de
   sessions et aux secrets configurés. L’accès Firestore par le SDK serveur
   dépend de l’IAM : les règles des clients web ne le remplacent pas.
3. Activer une politique TTL sur `expiresAt` pour la collection
   `journal-reader-sessions`. Le serveur refuse les enregistrements expirés sans
   attendre leur suppression par le service TTL.
4. Déployer le conteneur construit par `Dockerfile.session`, avec les paramètres
   privés ci-dessus. Pour cette version, conserver **une seule instance serveur**
   et un seul processus Node ; la sérialisation des renouvellements est locale
   au processus. Prévoir une révision de ce verrouillage avant toute montée en
   charge. La base reste distante et survit au redémarrage de l’instance.
5. Renseigner l’URL réelle dans `APP_ORIGIN`. Dans le client OAuth Google Web,
   autoriser exactement `APP_ORIGIN/auth/google/callback` comme URI de retour.
   Le propriétaire doit valider lui-même les changements d’identifiants et la
   nouvelle autorisation Google.
6. Ouvrir la nouvelle origine HTTPS et connecter le compte propriétaire.
   Vérifier la présence des éditions, les contrôles d’empreintes, la fermeture
   puis réouverture du lecteur et la déconnexion. Vérifier également une
   expiration d’accès nécessitant un renouvellement réel.
7. Sur l’iPhone, installer l’application de cette nouvelle origine. Une icône
   déjà installée depuis GitHub Pages reste liée à son ancienne origine.
   Réautoriser les notifications et remplacer l’abonnement privé Web Push si
   elles doivent passer sur la nouvelle application. Aucun changement de ce
   type n’est effectué automatiquement par le code ou par les tests.

Le serveur sert le même site et remplace seulement la réponse
`/app/reader-config.json` par `{"schema":1,"authMode":"server"}`. La configuration
publique de GitHub Pages reste inchangée et utilise le parcours temporaire
existant tant que le nouvel hébergement n’est pas configuré et vérifié.

## Limites de cette livraison

Les tests locaux et GitHub ne certifient pas la sécurité universelle du service.
La création de l’hébergement, les accès IAM, les secrets, le consentement Google,
la politique TTL et un essai réel sur iPhone restent nécessaires. Les erreurs
du fournisseur ne sont pas journalisées avec leur corps brut, pour ne pas
exposer de code OAuth, de jeton ou de donnée du compte.
