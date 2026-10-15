# Integration Google Sheets — audit Shopify

Le fichier `ShopifyAudit.gs` ajoute un menu **Analyse Shopify** au tableur. Il lit les URL HTTPS de l'onglet `LP_Detail` (ou, si cet onglet n'existe pas, d'un onglet comportant une colonne `LandingPage` / `Landing page`), puis crée un onglet `Shopify_Audit` avec les colonnes Google Ads d'origine et les mesures du crawl côte à côte.

Les URL identiques ne sont scrappées qu'une fois par exécution ; les résultats sont reportés sur chaque ligne Ads correspondante. L'audit est exécuté par lots de quatre URL pour rester sous la durée maximale d'une exécution Apps Script. Lighthouse est désactivé dans le script Sheets pour éviter les délais d'exécution ; les colonnes Lighthouse restent vides. Les lots suivants sont automatiquement planifiés par déclencheur Apps Script. En cas d'erreur, les lignes déjà traitées restent dans la feuille ; le menu **Reprendre l'audit en cours** permet de relancer les URL en attente.

## Pré-requis

1. Pousser dans le dépôt GitHub les fichiers du connecteur et de l'intégration, puis créer un nouveau **Web Service** Render relié à ce dépôt. Choisir le répertoire racine `connectors`, le runtime Docker et le `Dockerfile` fourni. Configurer `SHOPIFY_SITE_URL` avec `https://shop.carea-cuisine-bain.fr`, `SHOPIFY_ALLOWED_HOSTS` avec les autres domaines utilisés par les landing pages (par exemple `carea-kueche-bad.de`), et définir `SHOPIFY_ADAPTER_TOKEN` comme un secret long et unique. Render fournit le port `PORT`. Après le premier déploiement, vérifier `https://<nom-du-service>.onrender.com/health` puis utiliser `https://<nom-du-service>.onrender.com/shopify` comme URL de l'adaptateur. Le guide général est dans [`../README.md`](../README.md).
2. Le service prend en charge le paramètre `lighthouseMaxPages` dans la requête `POST /shopify`. Le paramètre accepte une valeur entière de 0 à 5 et permet à Apps Script de limiter Lighthouse à deux pages pour l'audit.
3. Dans le Google Sheet, ouvrir **Extensions → Apps Script**, ajouter un fichier de script `ShopifyAudit.gs`, y coller le contenu du fichier de ce dépôt, puis enregistrer le projet. Le menu existant `Analyse LP` est conservé ; le menu de scraping s'appellera `Analyse Shopify`.
4. Dans Apps Script, ouvrir **Paramètres du projet → Propriétés du script** et définir :

| Propriété | Valeur |
|---|---|
| `SHOPIFY_ADAPTER_URL` | URL HTTPS complète du connecteur, par exemple `https://connecteur.example.com/shopify` |
| `SHOPIFY_ADAPTER_TOKEN` | Même secret que `SHOPIFY_ADAPTER_TOKEN` sur le service |
| `SHOPIFY_SOURCE_SHEET` | `LP_Detail` (facultatif ; c'est la valeur par défaut) |

Ne place pas le token dans une cellule, une formule ou le code. Les éditeurs du projet Apps Script peuvent lire ses propriétés : limite l'accès éditeur aux personnes autorisées.

5. Dans l'éditeur Apps Script, sélectionner la fonction `installShopifyAuditMenu`, puis cliquer sur **Exécuter** et autoriser les accès demandés. Recharge le Google Sheet : le menu `Analyse Shopify` apparaît à côté du menu `Analyse LP`.

## Lancer l'analyse

Recharge le Google Sheet, puis sélectionne **Analyse Shopify → Démarrer / actualiser l'audit**. À la première exécution, Google demandera d'autoriser le script à lire et modifier le tableur et à appeler le service externe. Confirme le remplacement si `Shopify_Audit` existe déjà.

L'exécution traite quatre URL par lot. Les déclencheurs continuent automatiquement jusqu'à la fin. En cas d'interruption ou d'erreur réseau, corrige le service puis choisis **Reprendre l'audit en cours**. Une nouvelle actualisation repart du début et remplace les données générées dans `Shopify_Audit`.

La feuille conserve les colonnes Ads de `LP_Detail` pour comparer campagnes, coûts, clics et conversions avec l'URL finale Shopify, le template, les CTA, les sections et les signaux de confiance. Lighthouse est désactivé dans le script Sheets pour réduire le risque de délai d'exécution ; il pourra être relancé séparément si les scores de performance sont nécessaires. Elle n'invente pas les données manquantes : les metafields publics ne sont pas fournis par le scraper et les conversions / ventes doivent venir de la source Ads ou GA4.
