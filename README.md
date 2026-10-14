# LP Radar

Application privée de diagnostic SEA × CRO/UX × Shopify.

## Sécurité requise avant déploiement

Les clés de fournisseurs ne doivent jamais être saisies dans le navigateur, dans un fichier `VITE_*`, dans Git ou dans le stockage local du navigateur. L’application accepte désormais ces valeurs uniquement côté serveur. Le dashboard est fermé tant que les deux secrets d’accès ci-dessous ne sont pas définis.

Dans le panneau de configuration de ton hébergeur, ajoute ces variables au serveur (pas aux variables publiques du front-end) :

- `APP_ACCESS_PASSWORD` : ton mot de passe unique, au moins 16 caractères.
- `APP_SESSION_SECRET` : secret aléatoire d’au moins 32 caractères. Le changer invalide toutes les sessions.
- Google Ads : `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID` et, si nécessaire, `GOOGLE_ADS_LOGIN_CUSTOMER_ID`.
- Shopify / GA4 / Search Console : URLs et tokens Bearer de tes adaptateurs privés (`*_ADAPTER_URL`, `*_ADAPTER_TOKEN`). Ces tokens authentifient l’adaptateur LP Radar, pas Shopify ou Google.

Générer une valeur de session localement avec Node.js :

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Ne partage jamais leurs valeurs dans un ticket, une capture d’écran ou une conversation et ne les préfixe jamais par `VITE_`. Le connecteur Google Ads natif utilise `GOOGLE_ADS_API_VERSION` (par défaut `v25`) et ne nécessite ni `GOOGLE_ADS_API_URL` ni clé API classique. Les variables `SHOPIFY_ADAPTER_URL`, `GA4_ADAPTER_URL` et `SEARCH_CONSOLE_ADAPTER_URL` doivent désigner tes propres adaptateurs backend HTTPS; leurs hôtes exacts sont inscrits dans `DATA_API_ALLOWED_HOSTS` (liste séparée par des virgules). Les tokens `*_ADAPTER_TOKEN` sont des Bearer tokens pour ces adaptateurs, pas des tokens Shopify/Google.

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

Tu peux coller le developer token, les identifiants OAuth et le Customer ID dans le panneau **Connexion Google Ads** du dashboard, puis cliquer sur **Lancer l’analyse**. Le formulaire transmet les valeurs à l’endpoint serveur authentifié pour cette seule requête; elles ne sont ni mises dans `localStorage` ni persistées, et les champs sont vidés après une réponse Google Ads valide. Utilise HTTPS et ne partage pas les valeurs dans une capture d’écran ou une conversation. Le Manager Customer ID est facultatif et ne sert que pour un accès via MCC.

Alternative pour ne pas les ressaisir : ajoute les mêmes variables `GOOGLE_ADS_*` au serveur dans Vercel et redéploie. Elles peuvent alors être utilisées lorsque le formulaire est vide. Les deux variables d’accès à l’application (`APP_ACCESS_PASSWORD` et `APP_SESSION_SECRET`) restent nécessaires dans Vercel dans les deux cas.

Le serveur échange le refresh token contre un access token auprès de Google OAuth, puis interroge l’API Google Ads REST v25 avec `landing_page_view` sur les 30 derniers jours. Il agrège dépenses, impressions, clics, CTR et conversions par URL finale. Le developer token doit avoir l’accès API nécessaire au compte; Google peut limiter un token en mode test ou exiger une demande d’accès supérieur.

Les résultats Google Ads ont une couverture **SEA uniquement**. Les vues CRO/UX, Shopify, recommandation et devis restent masquées avec cette seule source; elles ne sont pas estimées à partir de valeurs fictives.

**État des autres connexions :** elles ne sont pas des connecteurs natifs dans cette version. Shopify doit être appelé par l’adaptateur avec OAuth Shopify et un scope Admin en lecture seule approprié; Shopify Admin GraphQL attend `X-Shopify-Access-Token` et `POST` vers `/admin/api/{version}/graphql.json`. GA4 Data API `runReport` nécessite une propriété (`properties/{id}`) et un access token OAuth ayant le scope `https://www.googleapis.com/auth/analytics.readonly`. Search Console Search Analytics nécessite un `siteUrl`, un corps de requête daté et OAuth avec le scope `https://www.googleapis.com/auth/webmasters.readonly`; une API key n’autorise pas les données privées. Ces adaptateurs doivent exécuter ces appels côté serveur puis renvoyer les landing pages normalisées au format JSON accepté ici : tableau direct ou propriété `lps`, `landingPages` ou `data`. Ils ne doivent jamais journaliser les secrets.

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
