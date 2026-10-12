# LP Radar

Application privée de diagnostic SEA × CRO/UX × Shopify.

## Sécurité requise avant déploiement

Les clés de fournisseurs ne doivent jamais être saisies dans le navigateur, dans un fichier `VITE_*`, dans Git ou dans le stockage local du navigateur. L’application accepte désormais ces valeurs uniquement côté serveur. Le dashboard est fermé tant que les deux secrets d’accès ci-dessous ne sont pas définis.

Dans le panneau de configuration de ton hébergeur, ajoute ces variables au serveur (pas aux variables publiques du front-end) :

- `APP_ACCESS_PASSWORD` : ton mot de passe unique, au moins 16 caractères.
- `APP_SESSION_SECRET` : secret aléatoire d’au moins 32 caractères. Le changer invalide toutes les sessions.
- Google Ads : `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID` et, si nécessaire, `GOOGLE_ADS_LOGIN_CUSTOMER_ID`.
- Shopify / GA4 / Search Console : credentials de leurs adaptateurs serveur respectifs (`SHOPIFY_ACCESS_TOKEN`, `GA4_API_KEY`, `SEARCH_CONSOLE_API_KEY`).

Générer une valeur de session localement avec Node.js :

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Ne partage jamais leurs valeurs dans un ticket, une capture d’écran ou une conversation et ne les préfixe jamais par `VITE_`. Le connecteur Google Ads natif utilise `GOOGLE_ADS_API_VERSION` (par défaut `v25`) et ne nécessite ni `GOOGLE_ADS_API_URL` ni clé API classique. Les adaptateurs des autres sources utilisent les URLs serveur `SHOPIFY_API_URL`, `GA4_API_URL` et `SEARCH_CONSOLE_API_URL`; leurs hôtes HTTPS doivent être listés dans `DATA_API_ALLOWED_HOSTS` (noms d’hôte séparés par des virgules).

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

## Connexion Google Ads

Pour obtenir les valeurs, active Google Ads API sur un projet Google Cloud et crée un client OAuth de type application Web. Autorise l’accès Google Ads avec le scope `https://www.googleapis.com/auth/adwords`, puis obtiens un refresh token avec accès hors ligne. Dans Google Ads, récupère le developer token depuis API Center et le Customer ID du compte à lire. Attribue au compte Google OAuth un rôle de lecture seule si cela suffit à ton audit.

Ajoute dans Vercel `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN` et `GOOGLE_ADS_CUSTOMER_ID`; ajoute `GOOGLE_ADS_LOGIN_CUSTOMER_ID` seulement si le compte est consulté via un compte administrateur. Mets `ANALYSIS_MODE=live`, puis redéploie. Ne saisis aucune de ces valeurs dans l’interface web et ne les transmets pas dans le chat.

Le serveur échange le refresh token contre un access token auprès de Google OAuth, puis interroge l’API Google Ads REST v25 avec `landing_page_view` sur les 30 derniers jours. Il agrège dépenses, impressions, clics, CTR et conversions par URL finale. Le developer token doit avoir l’accès API nécessaire au compte; Google peut limiter un token en mode test ou exiger une demande d’accès supérieur.

Les résultats Google Ads ont une couverture **SEA uniquement**. Les vues CRO/UX, Shopify, recommandation et devis restent masquées avec cette seule source; elles ne sont pas estimées à partir de valeurs fictives.

Les URLs Shopify, GA4 et Search Console configurées doivent pointer vers des adaptateurs backend de confiance qui renvoient des landing pages au format utilisé par l’application : tableau JSON direct, ou propriété `lps`, `landingPages` ou `data`.

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

## Déploiement Vercel

```sh
npm run build
```

Le build utilise le preset Vercel de Nitro et génère `.vercel/output` avec les fichiers statiques et la fonction SSR. `vercel.json` déclare ce dossier. Dans les paramètres du projet Vercel, laisse la sortie détectée automatiquement ou mets `.vercel/output` ; ne la laisse pas sur `dist`.

Ajoute `APP_ACCESS_PASSWORD`, `APP_SESSION_SECRET` et les identifiants API comme variables d’environnement serveur dans les paramètres Vercel, pour les environnements Production et Preview nécessaires. Ne les définis jamais comme variables préfixées `VITE_`.

## Vérification

```sh
npm test -- --run
npm run build
```
