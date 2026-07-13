# Stratégie d'intégration des avocats — LIQUID+

> Document de travail / brainstorming. Objectif : trancher le modèle avocat de LIQUID+
> (offre fondateur, offre avocat partenaire, tarification, sélection, mode d'attribution,
> intégration produit). Les recommandations sont opinionées et à valider avec un avocat /
> l'Ordre avant mise en production (voir §1, avertissement déontologique).

---

## 0. Le vrai problème n'est pas « l'outil est mal intégré » — c'est qu'il raconte deux histoires

En l'état, deux surfaces du produit disent des choses **contradictoires** sur l'avocat :

| Surface | Ce qu'elle promet | Prix |
|---|---|---|
| `offre.html` (marketing) | « Forfait **tout compris** 700–1 500 € / levée », documents « produits **et validés par un avocat** » | 1 prix unique, avocat **inclus** |
| `avocat.html` (SaaS) | Prestations **à la carte** facturées **en plus** (W&R 890 €, pacte 1 190 €, term sheet 490 €…) | 150–1 190 € **par acte** |

Un fondateur qui a besoin de faire valider W&R (890) + pacte (1 190) + term sheet (490) est
à **2 570 €** à la carte — soit très **au-dessus** du forfait « tout compris » de 1 500 € annoncé
en page d'offre. Le fondateur ne comprend pas ce qui est inclus, l'avocat ne sait pas ce qu'il
vend, et toi tu ne sais pas quoi facturer. **C'est ça, la sensation de « mal intégré ».**

Le sujet n'est donc pas cosmétique (mieux placer un bouton), c'est un **choix de modèle** :
qui facture quoi, qui touche quoi, qu'est-ce qui est inclus. Une fois ce choix tranché,
l'intégration UI/UX et le mode guidé découlent naturellement.

---

## 1. Le cadre déontologique décide (presque) tout — à connaître avant de brainstormer l'offre

Trois règles françaises structurent **tout** le modèle. On ne les contourne pas ; on conçoit avec.

1. **Interdiction de la rémunération d'apport d'affaires / du partage d'honoraires avec un non‑avocat.**
   L'avocat ne perçoit d'honoraires **que de son client** (RIN art. 11.3). Une société commerciale
   (LIQUID+) **ne peut pas** toucher une commission ou un pourcentage sur les honoraires de l'avocat.
   → **Ton instinct « on ne peut pas prendre de rétrocession » est juste.** Ce n'est pas une option, c'est le point de départ.

2. **La consultation juridique personnalisée est réservée** (loi de 1971, art. 54). L'IA et LIQUID+
   peuvent **préparer, informer, dégrossir, structurer** — mais l'**avis juridique** et la **validation**
   qui engage une responsabilité restent le monopole de l'avocat. (Le code le sait déjà : cf. commentaire
   `server.js` §Avocat.)

3. **Le mandat émane directement du client.** La lettre de mission / convention d'honoraires se noue
   **fondateur ↔ avocat en direct**, pas « LIQUID+ mandate l'avocat ». LIQUID+ est un **intermédiaire /
   éditeur d'outils**, jamais le donneur d'ordre. (La Cour de cassation l'a rappelé.)

**Corollaires directement actionnables :**

- ❌ Pas de commission sur les honoraires. ❌ Pas de forfait où LIQUID+ « revend » la prestation avocat avec marge.
- ❌ Pas de **comparateur / notation / classement** d'avocats (la CA de Paris l'a sanctionné) → cela **tranche**
  la question « je les mets en concurrence ? » : **non**.
- ✅ LIQUID+ peut se faire payer par l'avocat un **abonnement fixe** (accès aux outils + référencement),
  **à condition qu'il ne soit pas indexé** sur le volume de dossiers ou les honoraires générés
  (sinon = apport d'affaires déguisé). C'est le **modèle Doctolib** : abonnement forfaitaire, jamais de commission à l'acte.
- ✅ LIQUID+ peut se faire payer par le **fondateur** pour le **logiciel + la production documentaire +
  l'accompagnement** (activités **non réservées**). Les honoraires d'avocat, eux, transitent en direct
  fondateur → avocat (ou en pur encaissement pour compte, marge 0 %).

> ⚠️ **Avertissement.** Ces règles évoluent (le CNB travaille à un régime d'apport d'affaires plus ouvert et
> transparent). Avant lancement, fais valider le montage exact par un avocat + le barreau, en t'appuyant sur
> le **« Guide pratique — participation des avocats aux plateformes détenues par des tiers »** du CNB.

### 1.1 — Deux pièges fréquents (précisions)

**Piège n°1 — « un montant FIXE prélevé sur la relecture, ça passe ».** Non. Ce n'est **pas** le
« fixe vs pourcentage » qui rend le montage légal, c'est **d'où vient l'argent que LIQUID+ garde** :

- ❌ Fondateur paie 890 €, LIQUID+ garde 100 €, l'avocat touche 790 € → **interdit**, même en montant fixe.
  On a prélevé 100 € **sur les honoraires de l'avocat** = partage d'honoraires / apport d'affaires (prohibé
  quelle que soit la forme).
- ✅ L'avocat facture 890 € et **touche 890 €** ; LIQUID+ facture **en plus** au fondateur ses **propres**
  frais (logiciel, préparation du dossier, coordination) → **autorisé**, c'est la prestation de LIQUID+,
  pas une part de celle de l'avocat.

> Ligne rouge : « je prends dans la poche de l'avocat » (interdit) vs « je facture ma propre valeur au
> fondateur, l'avocat garde 100 % » (OK). **Le moteur sûr est l'abonnement fixe** (récurrent, pour un
> service, non indexé) — **pas un péage à l'acte**, même fixe, qui reste plus exposé à la requalification
> en apport d'affaires.

**Piège n°2 — maniement de fonds (CARPA).** Éviter que LIQUID+ **encaisse / détienne** les honoraires de
l'avocat : le maniement de fonds d'un avocat est encadré (CARPA). Le plus propre : **l'avocat facture et
encaisse en direct** ses honoraires ; LIQUID+ facture sa prestation séparément et ne s'assied jamais dans
le flux des honoraires. (Une facilitation de paiement type Stripe Connect reversant 100 % à l'avocat reste
possible, mais l'option « l'avocat encaisse en direct » est la moins risquée.)

---

## 2. Le modèle recommandé, de bout en bout

**Trois flux d'argent, tous conformes, jamais mélangés :**

```
  Fondateur ──(1) abonnement/forfait logiciel + accompagnement──▶ LIQUID+
  Fondateur ──(2) honoraires (convention directe, grille transparente)──▶ Avocat
  Avocat    ──(3) abonnement fixe outils + référencement (Doctolib-like)──▶ LIQUID+

  LIQUID+ ne touche JAMAIS un % du flux (2).
```

- **(1)** est ta marge principale et 100 % à toi.
- **(2)** ne te rapporte rien directement — mais c'est ta **proposition de valeur** (« sécurité d'un avocat »)
  et ce qui **fidélise l'avocat** (tu lui apportes du dealflow **pré‑dégrossi par l'IA**, donc rentable pour lui).
- **(3)** est un revenu secondaire, à **activer plus tard** (voir §6, amorçage marketplace).

**Positionnement à afficher (corrige l'incohérence du §0) :**
LIQUID+ = **le logiciel qui prépare 80 % du travail juridique + l'avocat nommé qui valide les 20 % à risque,
à prix affiché.** On arrête de dire « avocat inclus dans 1 500 € ». On dit :
**« l'outil à partir de X €, la validation avocat à prix fixe et transparent, en un clic, sans chercher de cabinet. »**

---

## 3. L'offre AVOCAT (le produit qu'on vend au fondateur) — l'échelle de prestations

Le nœud que tu poses (« c'est de la relecture ou c'est plus ? peut‑être juste la lecture ? ») a une
réponse déontologique nette :

> **Il n'existe pas de « simple lecture » à petit prix qui n'engage pas la responsabilité.**
> Dès que l'avocat émet **un avis** (« cette clause est dangereuse »), il engage sa RCP. Une lecture
> « sans responsabilité » serait à la fois **sans valeur** pour le fondateur **et** juridiquement bancale.
> Le levier de prix n'est donc **pas** « lire vs conseiller » — c'est le **périmètre de la mission**
> (étroit vs large), défini dans la lettre de mission.

D'où une **échelle à 5 barreaux** (product ladder), du gratuit au premium :

| # | Prestation | Qui la rend | Responsabilité | Prix indicatif | Inclus dans la base ? |
|---|---|---|---|---|---|
| 0 | **Auto‑diagnostic de risque** (badge critique/conseillé/faible, points d'attention) | IA | Aucune (info, pas conseil) | 0 € | ✅ **Inclus** |
| 1 | **Revue de vigilance (« flash »)** : périmètre borné, on signale les *red flags* d'un doc, sans réécriture ni garantie exhaustive | Avocat | Bornée par le périmètre écrit | ~150–290 € | ❌ En plus |
| 2 | **Sécurisation / validation** : revue complète + validation d'un doc critique, engage la RCP | Avocat | Pleine, lettre de mission nominative | ~490–1 190 € (selon doc) | ❌ En plus |
| 3 | **Négociation / accompagnement** : l'avocat agit pour le fondateur (calls avec l'avocat de l'investisseur, contre‑proposition) | Avocat | Pleine, mission étendue | Forfait ou horaire | ❌ En plus (premium) |
| 4 | **Pack levée** : tous les docs critiques du tour sécurisés, forfait remisé | Avocat | Pleine | Bundle (< somme des actes) | ❌ En plus (le plus vendu) |

**Ce que ça règle pour toi :**

- **« Est‑ce que ça peut être juste la lecture ? »** → Oui, sous la forme du **barreau 1 (revue de vigilance
  à périmètre borné)**, pas sous la forme d'une « lecture sans responsabilité ». On borne le **scope**, pas la responsabilité.
- **« Est‑ce qu'on fait des packs ? »** → **Oui, le barreau 4 est ton meilleur produit** : prévisible pour
  l'avocat (grosse mission d'un coup), rassurant pour le fondateur (tranquillité totale), et c'est le
  format qui « ressemble » le plus au « tout compris » que tu avais en tête — sauf qu'il est facturé par
  l'avocat, pas par toi.
- **« Qu'est‑ce qui est dans l'offre de base ? »** → voir §4.

---

## 4. Base vs payant — la ligne de partage

**Dans l'offre de base (ce que le fondateur paie à LIQUID+, ou le tier gratuit) :**

- Tout l'outillage IA : rédaction, explication de clauses, **diagnostic de risque** (barreau 0), templates, data room, gestion de dossier.
- **L'attribution d'un avocat NOMMÉ** (pas la prestation, juste la mise en relation + le fait de savoir qui te suivra). Avoir « son » avocat affiché = gratuit et rassurant.
- **1 appel découverte offert** (15 min) avec l'avocat attribué — sert de *lead‑gen*, désamorce la peur du premier contact, et c'est ce que les avocats offrent déjà souvent (premier RDV).

**Payant, en plus, facturé par l'avocat (LIQUID+ ne prend rien dessus) :**

- Toute **relecture / validation** réelle (barreaux 1 à 3).
- Les **packs** (barreau 4).

> Principe : **« l'outil te dit CE QUI est risqué gratuitement ; l'avocat te dit QUE FAIRE, et ça, ça se paie. »**
> C'est honnête, lisible, et ça respecte la ligne loi‑1971 (info gratuite vs conseil payant réservé).

---

## 5. Tarification — des repères chiffrés

### Côté fondateur (LIQUID+, flux 1)

Une levée est un **événement ponctuel** (tous les 12–18 mois), pas un besoin récurrent → privilégier un
**forfait / accès temps‑borné** plutôt qu'un abonnement mensuel perpétuel. Échelle proposée :

| Tier | Cible | Contenu | Prix |
|---|---|---|---|
| **Solo** (freemium) | Fondateur qui veut juste les modèles | Templates + IA limitée + diagnostic de risque | 0 € / très bas |
| **Pro** (mode guidé) | Le cœur de cible | IA complète, data room, exports, **mode guidé**, avocat nommé + appel découverte | ~490–990 € / levée (accès 6 mois) |
| **Concierge** (done‑with‑you) | Fondateur pressé | Pro + coordination de la mission avocat, relecture priorisée, accompagnement humain | 1 500 € + / levée |

Honoraires d'avocat **toujours en plus, à prix affiché** (§3). On ne les noie plus dans le forfait.

### Côté avocat (LIQUID+, flux 3)

- **Au lancement : GRATUIT pour l'avocat.** L'avocat est le côté **rare et à forte valeur** de la marketplace ;
  on subventionne le côté rare pour amorcer (cf. §6). Aucun frein à l'inscription tant qu'il n'y a pas de dealflow.
- **Plus tard : abonnement FIXE** (jamais à la commission) type :
  - *Référencement* : gratuit — reçoit les demandes.
  - *Premium* : ~99–199 € / mois — mise en avant, **outils IA de préparation de dossier** (le vrai cadeau :
    l'IA lui pré‑mâche le dossier → il traite plus de dossiers à l'heure), CRM clients, priorité d'attribution.
- **Interdiction absolue :** tout frais **indexé** sur le nombre de dossiers ou le montant des honoraires.

### Honoraires avocat (flux 2, fixés PAR l'avocat, mais on négocie une grille)

Tu ne les encaisses pas, mais tu peux **négocier une grille de référence** avec les partenaires (transparence
fondateur) et l'**afficher** — c'est autorisé tant que tu ne prends pas de marge dessus. Les montants déjà dans
`avocat.html` (question 150 € / term sheet 490 € / BSA‑AIR 590 € / W&R 890 € / pacte 1 190 €) sont un bon
point de départ. La convention d'honoraires se matérialise **avocat ↔ fondateur**.

---

## 5 bis. Business model : comment être « moins cher qu'un avocat » sans marge sur ses honoraires

**La tension à résoudre :** si le fondateur paie « prestation LIQUID+ **+** honoraires d'avocat à 100 % »,
le total peut être **plus cher** qu'un avocat seul — ce qui tue la promesse « moins cher ». On ne peut ni
prélever sur l'avocat (§1) ni le faire baisser son taux (il part). **La sortie : réduire ses HEURES.**

Une facture d'avocat = **heures × taux**. L'IA + l'outillage font ~80 % du travail (rédaction, structuration,
dossier prêt à relire) → il ne reste à l'avocat que la **validation** à forte valeur → **moins d'heures →
facture plus basse en valeur absolue**, sans toucher à son taux horaire.

**Unit economics (pacte + W&R sur une seed, illustratif) :**

| | Heures avocat | Facture avocat | Prestation LIQUID+ | **Total fondateur** |
|---|---|---|---|---|
| Avocat classique | ~15 h × 300 €/h | 4 500 € | — | **4 500 €** |
| LIQUID+ (IA prépare, avocat valide) | ~3 h × 300 €/h | 900 € | 690 € | **1 590 €** |

- **Fondateur** : ~65 % moins cher. **Avocat** : garde 300 €/h, traite plus de dossiers/h → gagne plus au total.
- **LIQUID+** : 690 € à coût marginal quasi nul. **Déonto** : LIQUID+ n'a jamais touché aux 900 €.

→ **Le moteur = la compression du travail par l'IA, pas la compression de marge.** C'est un avantage qui
**se compose** (meilleure IA → moins d'heures → plus attractif) : c'est là qu'est le moat et la priorité R&D.

**Repères de prix concurrents (France, seed) :**

| Option | Coût seed | Avocat qui couvre ? |
|---|---|---|
| Avocat / cabinet | pacte seul **1 500–5 000 €** ; levée **3 000–15 000 €** (jusqu'à 50 000 € complexe) | ✅ mais cher + friction |
| SeedLegals | logiciel **dès 0 €/mois**, forfait levée en sus | ⚠️ DIY‑first, le fondateur porte le risque |
| **LIQUID+ (cible)** | **~1 100–2 500 € tout compris** | ✅ avocat nommé qui valide |

**Positionnement (à corriger vs « le moins cher de tous ») :**

- Contre l'**avocat traditionnel** : **2 à 6× moins cher** — vrai, gagnable, c'est **la** promesse.
- Contre **SeedLegals** : on **ne peut pas** battre un pur DIY sans avocat sur le prix (leur plancher est
  sous le nôtre). Objectif = **« le prix le plus bas pour une sécurité d'avocat »**, pas « le moins cher tout court ».
  vs SeedLegals : *« à peu près le même prix, mais un avocat te couvre »*.

**Leviers business model (tous légaux) :** (1) compression IA [cœur] ; (2) **monétisation à deux faces**
(forfait fondateur + abonnement avocat) → l'abonnement avocat subventionne le prix fondateur, sans commission ;
(3) **coût marginal ~nul** → gagner au volume, pas à la marge/deal ; (4) **débundler** (l'avocat n'est payé que
sur W&R/pacte, le reste en autonomie) ; (5) **forfait fixe** = sensation de moins cher + zéro risque ;
(6) **grille négociée** à laquelle l'avocat **adhère librement** (forfait réduit justifié par le dossier
pré‑mâché + le volume — LIQUID+ ne prend pas de marge, garder la liberté de l'avocat de fixer ses honoraires
et la convention d'honoraires avec le client).

> **Garde‑fou de positionnement.** Ne pas mettre « le moins cher » en tête d'affiche : sur un achat où la
> **responsabilité personnelle du fondateur** est en jeu, la peur est « suis‑je couvert ? », pas « c'est cher ».
> Mener avec **sécurité + certitude** ; le « 2 à 6× moins cher qu'un avocat » est la **bonne surprise**, pas le slogan.

---

## 6. Sélection & attribution des avocats

### Concurrence ou attribution directe ? → **Attribution curée. Pas de mise en concurrence.**

Raisons (convergentes) :
1. **Déontologie** : comparateur/notation/classement d'avocats = sanctionné (CA Paris). Une marketplace
   d'enchères t'expose.
2. **Promesse produit** : ton pitch est le **gain de temps**. Faire « shopper » 3 avocats détruit la promesse.
3. **Pas besoin d'enchères** : si l'avocat **s'engage sur une grille** en entrant dans le réseau, il n'y a
   rien à mettre en concurrence — le prix est déjà connu et fixe.
4. **Qualité** : un réseau curé et restreint > un annuaire ouvert.

→ **Garde le modèle actuel du code** (attribution par défaut, nommé, changeable, ou « je déclare le mien »).
C'est le bon. Il faut juste le **rendre visible et guidé** (§7).

#### Peut‑on quand même attribuer « selon le tarif » ? — nuance

Trois niveaux de risque distincts :

- **Enchères / comparateur de prix affiché au fondateur** (« 3 avocats classés du moins cher au plus cher »)
  → **à éviter** (c'est le comparateur/notation sanctionné par la CA de Paris, + méfiance sur la concurrence
  par les prix).
- **Pondérer le prix dans l'attribution INTERNE** (LIQUID+ choisit, et « meilleur tarif sur ce type de doc »
  est l'un des critères) → **plus défendable** (pas de comparateur public), mais sélectionne le *moins cher*,
  pas le *meilleur*.
- **Grille unique commune acceptée par tous les partenaires à l'entrée** → **recommandé** : il n'y a alors
  **plus de concurrence par les prix** (prix fixe identique sur tout le réseau) et on attribue sur le **fit**
  (spécialité, stade, région, dispo, qualité).

Pourquoi éviter la course au moins‑disant : (1) sur un W&R / pacte, la **responsabilité personnelle du
fondateur** est en jeu → on veut le meilleur, pas le moins cher (une relecture bâclée est **pire que rien**) ;
(2) ça **fait fuir les bons avocats**, le côté rare de la marketplace ; (3) ça **détruit le positionnement
premium**. Si différenciation de prix souhaitée : **paliers** (junior / senior) à tarifs fixes publiés, le
**fondateur choisit son palier** — un choix de gamme, pas une enchère.

### Quels avocats ? → **Spécialistes venture uniquement, réseau boutique restreint**

- **Spécialités éligibles** : droit des sociétés, droit des affaires, venture/capital‑risque, M&A, private
  equity. **Pas** de généraliste. (L'onboarding collecte déjà `specialty` — il faut **filtrer** dessus pour
  l'attribution active.)
- **Vetting** : inscription au barreau (à vérifier via l'annuaire CNB), **RCP à jour** (attestation),
  **ancienneté** (`oath_date` déjà collectée), **track record de levées** (nb de deals, montants),
  entretien manuel, **engagement sur la grille tarifaire et les délais**.
- **Taille** : commence **petit et curé** (5–10 cabinets), qualité > quantité. Un réseau restreint mais
  fiable rend la promesse ; un annuaire pléthorique la dilue.
- **À ajouter à l'onboarding avocat** (aujourd'hui : prénom/nom/serment/ville/spécialité) : attestation RCP,
  barreau + n° toque, track record levées, **acceptation de la grille**, engagement de délais, capacité
  (nb de dossiers/mois).

### Amorçage de la marketplace (cold‑start)

Côté rare = **les avocats de qualité**. Séquence :
1. Recrute 5–10 cabinets à la main, **gratuitement**, en leur vendant « du dealflow pré‑qualifié et
   pré‑dégrossi par l'IA » (moins de temps perdu pour eux = plus rentable).
2. Fais tourner du volume fondateur (flux 1).
3. **Ensuite seulement**, introduis l'abonnement outils avocat (flux 3).

---

## 7. L'intégration produit : passer de « page à part » à « étape guidée »

Aujourd'hui, `avocat.html` est une **page qu'on doit aller chercher** dans le drawer. D'où la sensation
« pas assez intégré / pas assez guidé ». Le correctif : rendre l'avocat **contextuel et séquencé**.

### En mode GUIDÉ (ce que tu es en train d'écrire)

- **Ajouter une phase dédiée dans la frise / checklist** : après « Documentation », une étape
  **« Sécurisation juridique »** qui liste les docs **critiques** à faire valider + l'avocat attribué.
  Aujourd'hui les phases s'arrêtent au juridique interne ; il manque le **checkpoint avocat** explicite.
- **Déclencheur au bon moment** : quand un fondateur passe un doc **« critique »** en `final` dans l'éditeur,
  le flux guidé propose *inline* : « Ce document engage votre responsabilité. Faites‑le sécuriser par
  Me X avant signature (à partir de 890 €). » On a **déjà** la classification de risque
  (`documentRiskLevel`) et la presta adaptée (`documentAvocatPresta`) — il suffit de les **brancher sur
  l'UI de l'éditeur / du tableau de bord**, pas seulement sur la page avocat.
- **Le fondateur n'a jamais à “penser à l'avocat”** : le parcours l'y amène pile au moment critique.

### En mode AUTONOME

- La page avocat + les **badges de risque** contextuels (déjà là) restent, mais le fondateur **initie**.
- On garde des **nudges** discrets (badge « Avocat avant signature » sur les docs critiques → bouton
  « Faire relire ») sans forcer.

### Micro‑irritants à corriger côté page avocat

- Réconcilier le **wording** avec le nouveau modèle (« validation à prix affiché, en plus », pas « inclus »).
- Afficher **la grille** et le **délai** de façon homogène avec ce que promet `offre.html`.
- Rendre le **lien doc → demande de relecture** systématique depuis l'éditeur et la page Documents
  (le deep‑link `avocat.html?doc=<id>` existe déjà — l'exposer partout où un doc critique apparaît).

---

## 8. Ce que je ferais, dans l'ordre (reco finale)

1. **Trancher le modèle** (§2) : logiciel payé par le fondateur + honoraires directs avocat→fondateur +
   (plus tard) abonnement fixe avocat. **Zéro commission.**
2. **Réécrire l'offre** (`offre.html`) pour arrêter le « avocat inclus dans 700–1 500 € » et afficher
   **outil à partir de X € / validation avocat à prix fixe en plus**. Corrige l'incohérence du §0.
3. **Poser l'échelle de prestations à 5 barreaux** (§3) dans `avocat.html` et le serveur, avec le
   **barreau 1 (revue de vigilance)** comme porte d'entrée et le **barreau 4 (pack)** comme produit phare.
4. **Définir base vs payant** (§4) et l'écrire noir sur blanc dans le produit (help‑bulb, CGU, page offre).
5. **Garder l'attribution curée** (§6), **filtrer sur spécialité venture**, enrichir l'onboarding avocat
   (RCP, barreau, track record, grille), démarrer à 5–10 cabinets gratuits.
6. **Intégrer l'avocat dans le mode guidé** (§7) : phase « Sécurisation juridique » + déclencheur *inline*
   sur les docs critiques, en réutilisant `documentRiskLevel` / `documentAvocatPresta` déjà codés.
7. **Faire valider le montage déontologique** par un avocat / le barreau avant prod (§1).

---

### Annexe — sources déontologiques à vérifier avant lancement

- Loi n° 71‑1130 du 31 déc. 1971 (art. 54 : consultation juridique réservée).
- RIN, art. 11.3 (honoraires perçus du seul client ; interdiction de la rémunération d'apport d'affaires).
- Interdiction du partage d'honoraires avec un non‑avocat.
- CNB — *Guide pratique : participation des avocats aux plateformes détenues par des tiers*.
- Jurisprudence : mandat émanant directement du client (Cass.) ; interdiction des comparateurs/notations
  d'avocats (CA Paris).
