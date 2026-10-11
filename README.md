# LP Radar

Application privée de diagnostic SEA × CRO/UX × Shopify.

## Sécurité requise avant déploiement

Les clés de fournisseurs ne doivent jamais être saisies dans le navigateur, dans un fichier `VITE_*`, dans Git ou dans le stockage local du navigateur. L’application accepte désormais ces valeurs uniquement côté serveur. Le dashboard est fermé tant que les deux secrets d’accès ci-dessous ne sont pas définis.

Dans le panneau de configuration de ton hébergeur, ajoute ces variables au serveur (pas aux variables publiques du front-end) :

- `APP_ACCESS_PASSWORD` : ton mot de passe unique, au moins 16 caractères.
- `APP_SESSION_SECRET` : secret aléatoire d’au moins 32 caractères. Le changer invalide toutes les sessions.
- `GOOGLE_ADS_API_KEY`, `SHOPIFY_ACCESS_TOKEN`, `GA4_API_KEY`, `SEARCH_CONSOLE_API_KEY` : credentials de leurs adaptateurs serveur respectifs.

Générer une valeur de session localement avec Node.js :

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Ne partage jamais leurs valeurs dans un ticket, une capture d’écran ou une conversation et ne les préfixe jamais par `VITE_`. Les URLs non secrètes sont également des variables serveur : `ANALYSIS_MODE`, `GOOGLE_ADS_API_URL`, `SHOPIFY_API_URL`, `GA4_API_URL`, `SEARCH_CONSOLE_API_URL` et `DATA_API_ALLOWED_HOSTS`. Les URLs doivent être en HTTPS et leur nom d’hôte exact doit être inscrit dans `DATA_API_ALLOWED_HOSTS` (liste séparée par des virgules). Cela réduit le risque de requêtes SSRF vers des ressources internes.

## Protections incluses

- Toutes les pages SSR et l’endpoint d’analyse exigent une session valide.
- Le mot de passe n’est jamais conservé en cookie : la session est un jeton HMAC à durée limitée, dans un cookie `HttpOnly`, `Secure`, `SameSite=Strict` et préfixé `__Host-`.
- Session expirée après 8 heures ; déconnexion disponible dans la navigation.
- L’analyse est exécutée côté serveur. Le navigateur ne reçoit pas les clés de fournisseurs.
- Vérification de l’origine sur les requêtes de connexion et d’analyse, réponses privées sans cache, corps de requête plafonnés, limitation de tentatives en mémoire et en-têtes de sécurité.
- Les URLs d’API doivent utiliser HTTPS et un hôte explicitement autorisé.
- En mode `live`, une absence de données API renvoie une erreur, au lieu de présenter silencieusement les données de démonstration comme des données réelles.

## Mesures d’hébergement indispensables

La limitation locale des tentatives est best-effort et ne remplace pas une règle distribuée. Si ton hébergeur propose un pare-feu ou un rate limiting, limite `POST /api/auth/login` (par exemple 5 requêtes par adresse IP sur 15 minutes) et force HTTPS. Si l’application passe par un reverse proxy, configure-le pour écraser les en-têtes `x-real-ip` / `x-forwarded-for` entrants avec l’adresse client réelle ; ne fais pas confiance à ces en-têtes quand ils peuvent être fournis par le visiteur.

Les rapports affichent des données métier aux utilisateurs connectés. N’accordez donc l’accès qu’aux personnes autorisées et ne mettez pas de données personnelles inutiles dans les réponses des adaptateurs.

## Contrat des adaptateurs API

Chaque URL configurée doit pointer vers un adaptateur backend de confiance qui renvoie des landing pages au format utilisé par l’application : tableau JSON direct, ou propriété `lps`, `landingPages` ou `data`. Les clés sont transmises de serveur à serveur dans les en-têtes d’authentification. Ne branchez pas directement des identifiants Google Ads comme s’il s’agissait d’une simple clé API : Google Ads requiert notamment OAuth et un developer token. Les intégrations officielles doivent être implémentées dans les adaptateurs serveur correspondants.

## Développement local

Les secrets sans préfixe `VITE_` doivent être disponibles dans l’environnement du processus serveur. Dans PowerShell, saisir les valeurs dans les invites avant de démarrer Vite :

```powershell
$env:APP_ACCESS_PASSWORD = Read-Host "Mot de passe privé (16 caractères minimum)"
$env:APP_SESSION_SECRET = Read-Host "Secret de session (32 caractères minimum)"
npm run dev
```

Ajoutez de la même manière les variables API nécessaires au test local. Le fichier `.env.example` est un aide-mémoire ; il n’est pas une invitation à exposer ces valeurs dans le bundle client.

```sh
npm install
npm run dev
```

La route racine redirige vers `/login`; après connexion, le bouton du dashboard lance l’analyse sur le serveur.

## Build et démarrage Node

```sh
npm run build
npm start
```

Le build utilise `node-server` par défaut. Si ton hébergeur exige un preset Nitro dédié, configure `NITRO_PRESET` pendant le build (par exemple dans les variables CI de l’hébergeur). Le processus écoute sur le port fourni par `PORT` lorsqu’il est défini.

## Vérification

```sh
npm test -- --run
npm run build
```
