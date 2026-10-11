# LP Radar

Application de diagnostic SEA × CRO/UX × Shopify pour prioriser les landing pages et générer un devis d’optimisation.

## Production setup

Ce projet est déjà préparé pour passer en production sans réécrire la logique métier. Il suffit de brancher les URLs API et les tokens côté backend.

### Variables d’environnement

Copiez le fichier [.env.example](.env.example) vers `.env.local` puis renseignez vos valeurs :

```bash
cp .env.example .env.local
```

Variables principales :

- `VITE_ANALYSIS_MODE` : `demo`, `hybrid` ou `live`
- `VITE_GOOGLE_ADS_API_URL` : URL backend de Google Ads
- `VITE_SHOPIFY_API_URL` : URL backend Shopify Admin
- `VITE_GA4_API_URL` : URL backend GA4
- `VITE_SEARCH_CONSOLE_API_URL` : URL backend Search Console
- `VITE_ANALYSIS_BATCH_SIZE` : taille des lots d’analyse
- `VITE_ENABLE_AUTO_ANALYSIS` : activation du lancement automatique de l’analyse

### Mode de fonctionnement

- `demo` : données statiques de démonstration
- `hybrid` : mélange démonstration + données live
- `live` : analyse complète sur données réelles

### Ajout d’une source API

1. Créer un endpoint backend protégé
2. Exposer la route de données côté serveur
3. Renseigner l’URL dans le fichier `.env.local`
4. Vérifier que l’analyse est bien activée via `VITE_ANALYSIS_MODE`

## Développement

```sh
npm install
npm run dev
```

## Vérification

```sh
npm test -- --run
npm run build
```

## Points d’extension

- importer les comptes Google Ads
- synchroniser les pages Shopify et les templates
- enrichir les scores avec des données live
- générer automatiquement les devis de phase 2
