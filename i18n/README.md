# Bascule FR / EN

Le site et l'outil sont écrits en français. L'anglais est produit à l'exécution :
un moteur parcourt le DOM et remplace chaque texte connu par sa traduction.

```
i18n/fr-en/*.json   dictionnaires source, { "texte français": "english text" }
i18n/patterns.js    libellés construits à l'exécution (compteurs, dates, noms)
i18n/build.js       assemble le tout dans i18n-en.js
i18n/check.js       rend les pages en anglais et liste ce qui reste en français
i18n-en.js          généré — chargé par les pages, ne pas éditer à la main
i18n.js             le moteur et le bouton FR / EN
```

## Ajouter du texte au site

1. Écrire la page en français, comme d'habitude.
2. `node i18n/check.js` liste les textes sans traduction.
3. Les ajouter à un fichier de `i18n/fr-en/`, puis `node i18n/build.js`.

Le découpage des fichiers suit les zones du produit (`10-site-*` pour le site
vitrine, `2x-app-*` pour l'outil, `29-server` pour les messages de l'API). Un
même texte peut figurer dans plusieurs fichiers : la dernière valeur l'emporte
et `build.js` signale les doublons divergents.

## Ce qui n'est jamais traduit

Le moteur ne touche qu'aux textes présents au dictionnaire. Tout le reste passe
sans être modifié — c'est ce qui protège les données saisies par l'utilisateur
(noms de société, de documents, montants).

Trois zones sont exclues d'office, même si leur texte figurait au dictionnaire :

- `#page` et `.rl-doc` — le corps du document dans l'éditeur, c'est-à-dire les
  actes juridiques de l'utilisateur ;
- tout élément `contenteditable`, `code`, `pre`, `textarea` ;
- tout élément portant `data-i18n-skip`, `translate="no"` ou `.notranslate`.

Les modèles d'actes (`Saas/ressources/modeles/`) restent en français : ce sont
des documents de droit français, dont la traduction changerait la portée
juridique.

## Comment le texte arrive à l'écran

Le moteur traduit au chargement, puis surveille le DOM : un fragment injecté
par l'éditeur, le tableau de bord ou une réponse de l'API est traduit dès son
insertion. C'est pourquoi les messages du serveur figurent eux aussi au
dictionnaire (`29-server.json`).

Basculer de langue recharge la page : le DOM est modifié en place, et un
rechargement est le moyen le plus sûr de revenir à des libellés propres.
La langue est retenue dans `localStorage` sous la clé `liquidLang`.
