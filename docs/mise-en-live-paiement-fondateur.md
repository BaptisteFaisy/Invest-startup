# Mise en live du paiement fondateur → Liquid+

Le code du paiement fondateur → Liquid+ est **complet et vérifié** (Checkout serveur,
webhook signé, activation de l'accès, remboursements/litiges, idempotence). Il ne
reste que la **configuration de production**, à faire une seule fois. Ces étapes
touchent des identifiants financiers et les réglages du compte Stripe : elles ne
peuvent être faites que par toi, depuis les tableaux de bord Stripe et Railway.

> État constaté le 2026-07-17 : la prod tourne mais le webhook renvoie **503**,
> donc Stripe n'y est pas encore configuré. Tant que ce n'est pas fait, un client
> réel reçoit « Le paiement en ligne est en cours d'activation ».

Le paiement fondateur → avocat (Stripe Connect) n'est **pas** concerné ici : il
reste désactivé tant que `STRIPE_CONNECT_WEBHOOK_SECRET` n'est pas posé, ce qui est
sans effet sur le paiement fondateur → Liquid+.

---

## 1. Activer le compte Stripe en mode « live »

Dans le tableau de bord Stripe (https://dashboard.stripe.com) :

1. Bascule en **mode Live** (interrupteur en haut à droite, « Test » → « Live »).
2. **Activer le compte** : renseigner l'entité (société), le représentant, l'objet
   de l'activité, et surtout **un IBAN de versement** (sinon l'argent est encaissé
   mais jamais reversé).
3. **Informations de facturation** (Réglages → Facturation / « Public business
   information ») : nom légal, adresse, SIREN, mentions — elles apparaissent sur la
   facture PDF envoyée au client (le code active `invoice_creation`).

## 2. Récupérer la clé secrète live

Réglages → Développeurs → **Clés API**, en mode Live : copier la **clé secrète**
`sk_live_…`.

> Ne me la transmets pas et ne la mets pas dans un fichier versionné. Elle se colle
> uniquement dans les variables Railway (étape 4).

## 3. Créer le webhook live (plateforme)

Développeurs → **Webhooks** → « Ajouter un endpoint », en mode Live :

- **URL** : `https://liquidplus.fr/api/billing/stripe-webhook`
- **Événements à écouter** :
  - `checkout.session.completed`  *(indispensable — active l'accès)*
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.expired`
  - `checkout.session.async_payment_failed`
  - `charge.refunded`
  - `charge.dispute.created`
- Après création, copier le **secret de signature** `whsec_…` de CET endpoint.

## 4. Poser les variables dans Railway

Railway → service → onglet **Variables** (valeurs LIVE, pas test) :

| Variable | Valeur |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_…` (étape 2) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` du webhook live (étape 3) |
| `BASE_URL` | `https://liquidplus.fr` |
| `MODE_ENV` | `production` |

`BASE_URL` doit être en HTTPS et pointer le domaine public : le serveur refuse de
démarrer en production sinon, et c'est lui qui construit les URL de retour
`?payment=success` / `?payment=cancelled`.

Après enregistrement, Railway redéploie. Vérifier que le service **démarre** (pas de
« Démarrage refusé — secrets manquants »).

## 5. Vérifier en live

1. `curl -s -o /dev/null -w "%{http_code}" -X POST https://liquidplus.fr/api/billing/stripe-webhook -d '{}'`
   → doit renvoyer **400** (« Signature invalide »), plus 503.
2. Depuis un compte fondateur réel : onglet **Facturation** → « Payer … HT » →
   régler avec une **vraie carte** → retour sur la page avec « accès activé ».
3. Dans Stripe (mode Live) : le paiement apparaît, la facture est émise, le webhook
   affiche une réponse **200**.

---

## Point à trancher avant le premier vrai client : TVA

Le montant facturé est celui de la grille (ex. 790 € pour une levée classique),
libellé **HT** côté client, avec `tax_behavior: 'inclusive'` sur la ligne Stripe
(`server.js`, création de la session Checkout). Concrètement, le client est débité
de ce montant exact, **sans TVA ajoutée**.

- Si Liquid+ est en **franchise en base de TVA** : c'est cohérent, mais la facture
  doit porter la mention « TVA non applicable, art. 293 B du CGI ».
- Si Liquid+ est **assujetti à la TVA** : il faut soit ajouter 20 % (le client paie
  948 € TTC), soit requalifier le prix affiché en TTC. En l'état, la facture serait
  non conforme.

À valider avec ton expert-comptable ; l'ajustement (mentions de facture Stripe ou
taux de TVA) se fait ensuite en un point du code + la config facture Stripe.
