/* =========================================================
   liquid + — Traitement de texte pour term sheet
   Lettre d'intention reconstituée (modèle BOLD VC) puis
   complétée, avec startup et investisseurs fictifs.
   Éditeur riche (façon Word) + décrypteur clause par clause.
   ========================================================= */

/* Société fictive : LUMIO SAS — éditeur d'un logiciel de pilotage
   financier pour PME. Investisseur lead fictif : Orbit Ventures. */

let TERMSHEET = [
  /* ----- PARTIES ----- */
  {
    key: 'societe', group: 'Parties', label: 'Société', risk: 'low',
    html: `<p>LUMIO, société par actions simplifiée au capital de 1.000 euros, dont le siège social est situé 12 rue de Paradis – 75010 Paris, immatriculée au Registre du Commerce et des Sociétés de Paris sous le numéro 902 145 678 (ci-après la « <strong>Société</strong> »).</p>
           <p>Le capital de la Société est constitué de 100.000 actions d'une valeur nominale de 0,01 euro chacune, tel qu'il est décrit dans la table de capitalisation jointe en Annexe.</p>`,
    plain: `Identifie juridiquement la société cible (LUMIO SAS) et son capital actuel : 100.000 actions à 0,01 € de nominal.`,
    why: `C'est la base sur laquelle tous les pourcentages et la dilution seront calculés.`,
    watch: `Vérifiez que la table de capitalisation en annexe est exacte et complète (BSPCE, BSA ou options déjà émis inclus).`,
  },
  {
    key: 'fondateurs', group: 'Parties', label: 'Fondateurs', risk: 'low',
    html: `<p>Camille Mercier ;<br />La société HELIOS HOLDING (holding personnelle de Thomas Lefebvre).</p><p>Ensemble, les « <strong>Fondateurs</strong> ».</p>`,
    plain: `Les personnes (et la holding) qualifiées de Fondateurs. Ce statut entraîne des obligations renforcées dans tout le reste du document.`,
    why: `L'investisseur mise d'abord sur l'équipe : les Fondateurs portent les engagements de lock-up, leaver, implication et non-concurrence.`,
    watch: `Être nommé « Fondateur » déclenche le lock-up, le vesting/leaver et la non-concurrence. Vérifiez bien qui est inclus — loger ses titres dans une holding est fréquent.`,
  },
  {
    key: 'investisseur', group: 'Parties', label: 'Investisseur', risk: 'low',
    html: `<p>ORBIT VENTURES (l'« <strong>Investisseur Majoritaire</strong> »), le cas échéant accompagné d'un ou plusieurs autres investisseurs (SEEDLINE CAPITAL et certains business angels, les « <strong>Investisseurs Minoritaires</strong> ») et, avec l'Investisseur Majoritaire, les « <strong>Investisseurs</strong> ».</p>`,
    plain: `Qui investit. Orbit Ventures mène le tour (« lead ») et concentre les droits clés ; les minoritaires suivent.`,
    why: `On distingue le lead des minoritaires car beaucoup de droits forts (vetos, déclenchement du drag-along) sont réservés au seul Investisseur Majoritaire.`,
    watch: `Repérez les droits attribués au seul « Investisseur Majoritaire » : c'est lui qui détient le vrai pouvoir de blocage.`,
  },

  /* ----- OPÉRATION ----- */
  {
    key: 'investissement', group: 'L’opération', label: 'Investissement', risk: 'high',
    html: `<p>Sur la base des informations transmises à ce jour, la valorisation <em>pre-money</em> sur une base « non <em>fully diluted</em> » de la Société serait de 6.000.000 euros (la « <strong>Valorisation</strong> »).</p>
           <p>Investissement de l'ordre de 1.000.000 euros sur une valorisation égale à la Valorisation, soit pour un prix de souscription de 60 euros par Action A (le « <strong>Prix de Souscription</strong> »), ainsi qu'il est décrit dans la table de capitalisation jointe en Annexe.</p>`,
    plain: `1.000.000 € investis sur une pre-money de 6.000.000 € → post-money 7.000.000 €, soit ~14,3 % du capital pour les Investisseurs. Prix : 60 € par action.`,
    why: `C'est le cœur économique du deal : combien d'argent, à quelle valeur, et donc quel pourcentage vous cédez.`,
    watch: `« non fully diluted » : la valo ignore les BSPCE/options à créer. Votre dilution réelle sera plus forte une fois le pool intégré — calculez toujours en « fully diluted ».`,
    example: `<p class="example__cap">Capital après l'opération : <strong>116 667 actions</strong>, dont 16 667 Actions A pour 1 M€ (≈ 14,3 % du capital cédés aux Investisseurs, 85,7 % conservés par les Fondateurs).</p>`,
  },
  {
    key: 'titre', group: 'L’opération', label: 'Titre émis', risk: 'mid',
    html: `<p>Actions ordinaires dites de catégorie A à des fins d'identification exclusivement (les « <strong>Actions A</strong> »).</p>`,
    plain: `Les Investisseurs reçoivent des « Actions A ». Elles sont dites ordinaires : la catégorie sert surtout à les identifier pour leur appliquer les droits du pacte.`,
    why: `Créer une catégorie distincte permet de rattacher des droits spécifiques (liquidation préférentielle, ratchet…) aux seules actions des Investisseurs.`,
    watch: `Même « dites ordinaires », ces Actions A portent des droits préférentiels via le pacte. Lisez les clauses financières ci-dessous.`,
  },

  /* ----- DROITS FINANCIERS ----- */
  {
    key: 'liquidation', group: 'Droits financiers des Investisseurs', label: 'Clause de liquidation préférentielle', risk: 'high',
    html: `<p>En cas de cession de la Société, le prix de cession est réparti entre les Investisseurs comme suit :</p>
           <ol type="i">
             <li>en premier lieu, à hauteur de 10% entre tous les Associés au prorata de leur participation dans le capital de la Société ;</li>
             <li>en second lieu, remboursement du prix de souscription ou d'acquisition des actions détenues par les Investisseurs, déduction faite des versements reçus en premier lieu ;</li>
             <li>en troisième lieu, partage du boni entre les Associés autres que les Investisseurs au prorata de leur participation au capital de la Société.</li>
           </ol>
           <p>Les Investisseurs pourront chacun pour ce qui les concerne renoncer à cette clause préférentielle. La même règle de répartition s'appliquerait en cas de liquidation ou dissolution de la Société (dans la limite du boni de liquidation) et de fusion-absorption ou apport partiel ou total d'actifs.</p>`,
    plain: `En cas de vente, le prix est réparti dans un ordre précis : 10 % d'abord partagé entre tous au prorata, puis les Investisseurs récupèrent leur mise, puis le solde (« boni ») revient aux autres associés.`,
    why: `Protège l'investisseur (il récupère son argent avant le partage) tout en laissant 10 % aux fondateurs même en cas de sortie modeste : c'est une préférence « 1x non participative » avec carve-out de 10 %.`,
    watch: `Version plutôt équilibrée. Vérifiez qu'elle reste « 1x » et non participative, et qu'elle ne se cumule pas avec d'autres préférences lors de tours futurs (empilement = vous touchez moins).`,
    example: `<p class="example__cap">En cas de sortie à <strong>3 000 000 €</strong> : grâce à la préférence, les Investisseurs récupèrent <strong>1 M€</strong> (leur mise) au lieu de 0,43 M€ s'ils partageaient simplement au prorata de leurs 14,3 %.</p>`,
  },
  {
    key: 'ratchet', group: 'Droits financiers des Investisseurs', label: 'BSA Ratchet', risk: 'mid',
    html: `<p>Au bénéfice des Investisseurs et pendant une période de 12 mois, leur permettant en cas de futures opérations sur le capital à un prix inférieur au prix de souscription de l'Investissement — et à la condition de participer auxdites futures opérations au prorata de leur détention capitalistique — de souscrire, à leur valeur nominale, un nombre d'actions supplémentaire (dans une limite de 5 actions nouvelles pour 1 ABSA) calculé sur la base d'une formule dite « <em>broad-based</em> ».</p>`,
    plain: `Protection « down round » : pendant 12 mois, si la société lève moins cher que 60 €, les Investisseurs peuvent souscrire des actions à la valeur nominale pour compenser la baisse (plafond : 5 actions pour 1 ABSA, formule « broad-based »).`,
    why: `Assure l'investisseur contre une chute de valorisation juste après son entrée.`,
    watch: `Formule « broad-based » plafonnée et limitée à 12 mois = version modérée (bien). Refusez un « full ratchet » sans plafond, bien plus dilutif pour vous en cas de down round.`,
  },
  {
    key: 'antidilution', group: 'Droits financiers des Investisseurs', label: 'Clause d’anti-dilution', risk: 'low',
    html: `<p>L'Investisseur Majoritaire dispose d'un droit lui permettant, lors des financements futurs de la Société, de conserver sa détention en participant auxdits financements.</p>`,
    plain: `Droit de l'Investisseur Majoritaire de participer aux futures levées pour maintenir son pourcentage (droit de pro rata / souscription préférentielle).`,
    why: `Lui permet de ne pas être dilué aux tours suivants en réinvestissant à ses côtés.`,
    watch: `Peu risqué : c'est un droit de « suivre », pas une compensation gratuite. Vérifiez qu'il se limite à son pro rata et ne lui réserve pas une part disproportionnée des prochains tours.`,
  },

  /* ----- TRANSFERTS DE TITRES ----- */
  {
    key: 'lockup', group: 'Transferts de titres', label: 'Inaliénabilité (Lock-up)', risk: 'mid',
    html: `<p>Engagement d'inaliénabilité d'une durée de 4 ans des Fondateurs, sauf hypothèse (i) de déclenchement du droit d'entraînement, (ii) de mise en œuvre des promesses des Fondateurs et (iii) de la faculté de respiration permettant à chaque Fondateur de céder librement au maximum 10% des titres qu'il détient au jour de l'Investissement.</p>`,
    plain: `Les Fondateurs s'engagent à ne pas vendre leurs titres pendant 4 ans, sauf : déclenchement du drag-along, mise en œuvre des promesses (leaver), et une « respiration » autorisant la cession de 10 % maximum de leurs titres.`,
    why: `Garde les fondateurs au capital et engagés sur la durée ; rassure l'investisseur sur la stabilité de l'équipe.`,
    watch: `4 ans, c'est long. Préservez (voire élargissez) la « respiration » de 10 % pour un peu de liquidité, et vérifiez les exceptions.`,
  },
  {
    key: 'preemption', group: 'Transferts de titres', label: 'Droit de préemption', risk: 'low',
    html: `<p>Sous réserve des cas de Transferts Libres des Associés, en cas de cession de titres de la Société par l'un des Associés, les autres Associés détenant au moins 5% du capital social disposeront d'un droit de préemption comme suit :</p>
           <ol type="i">
             <li>en cas de transfert par un Fondateur, droit de préemption de premier rang au bénéfice des autres Fondateurs, et de deuxième rang au bénéfice des Investisseurs, au prorata de leur participation entre eux ; et</li>
             <li>en cas de transfert par un Investisseur, droit de préemption de premier rang au bénéfice des Investisseurs et de deuxième rang au bénéfice des Fondateurs, au prorata de leur participation entre eux.</li>
           </ol>`,
    plain: `Avant toute cession à un tiers, les autres associés (≥ 5 % du capital) peuvent racheter en priorité les titres vendus, selon un ordre de rang (fondateurs puis investisseurs, et inversement).`,
    why: `Évite l'entrée d'un tiers non souhaité et permet de garder la maîtrise de l'actionnariat.`,
    watch: `Clause standard. Vérifiez les rangs de priorité, le seuil de 5 % et que les transferts libres (holding patrimoniale, respiration) y échappent bien.`,
  },
  {
    key: 'fulltag', group: 'Transferts de titres', label: 'Sortie conjointe totale (Full tag-along)', risk: 'low',
    html: `<p>Au cas où un ou plusieurs Associés envisageraient de céder tout ou partie de leurs Actions à un ou plusieurs Tiers, entraînant (i) un transfert du Contrôle de la Société ou (ii) l'entrée d'un Industriel, les autres Associés disposeront de la faculté de céder leurs actions, selon les mêmes modalités et aux mêmes conditions, notamment de prix, que celles offertes par le Cessionnaire Envisagé.</p>`,
    plain: `Si une cession entraîne un changement de contrôle ou l'entrée d'un industriel, tous les associés peuvent vendre leurs actions aux mêmes conditions de prix.`,
    why: `Protège les minoritaires : personne n'est « laissé derrière » lors d'une vente majeure.`,
    watch: `Protecteur pour vous aussi. Vérifiez les définitions de « Contrôle » et d'« Industriel » qui déclenchent ce droit.`,
  },
  {
    key: 'proptag', group: 'Transferts de titres', label: 'Sortie conjointe proportionnelle (Proportional tag-along)', risk: 'mid',
    html: `<p>Au cas où un ou plusieurs Associés envisageraient une Cession au profit d'un Tiers n'entraînant pas l'exercice du droit de sortie conjointe totale, le ou les Associés Cédants s'engagent à permettre à l'Investisseur Majoritaire, s'il le souhaite, de céder au Cessionnaire Envisagé le même pourcentage d'Actions, aux mêmes conditions, le nombre d'Actions à céder par le ou les Associés étant réduit à due concurrence.</p>
           <p>Le droit de sortie conjointe proportionnelle ne s'appliquera pas pour les cas de transferts libres et la faculté de respiration.</p>`,
    plain: `Pour une cession qui ne déclenche pas le tag total, l'Investisseur Majoritaire peut vendre le même pourcentage que le cédant (qui réduit d'autant sa propre vente). Hors transferts libres et respiration.`,
    why: `Permet à l'investisseur de « sortir un peu » au prorata chaque fois qu'un fondateur vend.`,
    watch: `Concrètement, si vous vendez, l'investisseur peut capter une partie de votre acheteur. Anticipez cet effet sur votre propre liquidité.`,
  },
  {
    key: 'drag', group: 'Transferts de titres', label: 'Droit d’entraînement (Drag-along)', risk: 'mid',
    html: `<p>Dans le cas d'une offre d'achat, émanant d'un tiers, portant sur au moins 95% des titres de la Société et acceptée par des Associés représentant au moins 70% du capital et des droits de vote, chacun des autres Associés sera tenu de céder ses titres au candidat acquéreur dans le cadre de l'offre, en donnant tout consentement nécessaire à la mise en œuvre de l'opération envisagée, dans les mêmes conditions que les Associés ayant accepté l'offre.</p>
           <p>L'approbation préalable de l'Investisseur Majoritaire est requise et le prix par action proposé est inférieur au Prix de Souscription (60 euros). Le droit de préemption ne s'appliquera pas en cas de mise en œuvre du droit d'entraînement.</p>`,
    plain: `Si un tiers offre de racheter ≥ 95 % de la société et qu'une majorité (≥ 70 % des votes) accepte, tous les autres sont obligés de vendre aux mêmes conditions. Nécessite l'accord de l'Investisseur Majoritaire et un prix ≥ Prix de Souscription.`,
    why: `Permet de livrer 100 % du capital à un acquéreur — indispensable pour conclure une vente.`,
    watch: `Vous pouvez être forcé de vendre. Bons garde-fous ici (seuil 70 %, prix plancher = 60 €). Vérifiez que ce plancher vous protège réellement contre une vente à perte.`,
  },
  {
    key: 'libres', group: 'Transferts de titres', label: 'Transferts libres', risk: 'low',
    html: `<p>Cession libre des titres de l'Investisseur Majoritaire au profit de toute personne morale ou entité de son groupe (entités qu'il contrôle, qui le contrôlent, sous contrôle commun, qu'il gère ou ayant la même société de gestion).</p>
           <p>Cession libre des titres des Fondateurs au profit de toute holding patrimoniale dédiée (et inversement), sous réserve que celle-ci soit (i) immatriculée dans l'Union européenne, (ii) représentée par le Fondateur concerné et (iii) détenue directement à plus de 70 % par ledit Fondateur (le solde par son conjoint et/ou ses ascendants ou descendants en ligne directe).</p>
           <p>Les transferts mis en œuvre au titre des droits de préemption, de sortie conjointe totale et proportionnelle, du droit d'entraînement et des clauses de leavers sont des transferts libres.</p>`,
    plain: `Certains transferts sont autorisés sans préemption ni tag : cessions de l'investisseur à ses entités affiliées/fonds, et cessions des fondateurs vers leur holding patrimoniale dédiée (sous conditions de détention > 70 %).`,
    why: `Fluidifie les réorganisations internes (mise en holding, fonds) sans déclencher les protections.`,
    watch: `Utile pour loger vos titres dans une holding patrimoniale. Respectez strictement les conditions (UE, > 70 %, représentation) sous peine de perdre le bénéfice du transfert libre.`,
  },

  /* ----- GOUVERNANCE ----- */
  {
    key: 'board', group: 'Gouvernance', label: 'Comité Stratégique', risk: 'mid',
    html: `<p>À la Date de Réalisation, il sera institué un comité au sein de la Société (le « <strong>Comité Stratégique</strong> »), lequel sera composé de 4 membres maximum, en ce compris :</p>
           <ol type="i">
             <li>2 membres qui seront proposés par les Fondateurs ;</li>
             <li>1 membre qui sera proposé par l'Investisseur Majoritaire ;</li>
             <li>1 membre indépendant qui sera proposé d'un commun accord entre les Associés Dirigeants et les Investisseurs, étant précisé que l'expérience et l'expertise de ce membre devront être cohérentes avec l'activité et les principaux enjeux de la Société.</li>
           </ol>`,
    plain: `À la réalisation, un Comité Stratégique de 4 membres max : 2 proposés par les Fondateurs, 1 par l'Investisseur Majoritaire, 1 indépendant nommé d'un commun accord.`,
    why: `Organe de suivi stratégique ; donne une voix à l'investisseur sans lui céder le contrôle.`,
    watch: `Vous gardez 2 sièges sur 4, mais l'indépendant peut faire basculer un vote. Assurez-vous qu'il soit réellement indépendant et compétent.`,
    example: `<p class="example__cap">Comité Stratégique — 4 sièges : <strong>2 Fondateurs</strong>, <strong>1 Investisseur</strong>, <strong>1 indépendant</strong>. Aucun camp n'a la majorité à lui seul : le membre indépendant joue l'arbitre.</p>`,
  },
  {
    key: 'decisions', group: 'Gouvernance', label: 'Décisions importantes (matières réservées)', risk: 'high',
    html: `<p>Les décisions importantes suivantes ne pourront être soumises à la collectivité des Associés ni mises en œuvre par les Associés Dirigeants, sans l'approbation préalable des membres du Comité Stratégique à la majorité simple de ses membres incluant le vote favorable d'au moins l'un des représentants des Investisseurs :</p>
           <ol type="i">
             <li>l'approbation du budget annuel et tout engagement supérieur à 30.000 euros hors budget ;</li>
             <li>l'approbation de la fixation ou de la modification de la rémunération des Dirigeants, ainsi que des salariés dont la rémunération fixe brute est supérieure à 60.000 euros ;</li>
             <li>toute décision d'augmentation de plus de 20 % de la rémunération des Dirigeants ;</li>
             <li>tout recrutement (hors budget) et tout recrutement ou licenciement d'un salarié reportant directement au Président ou au Directeur Général ;</li>
             <li>toute émission de valeurs mobilières donnant droit, immédiatement ou à terme, à une quotité du capital ou des droits de vote de la Société ou de filiales, l'approbation du règlement de ce plan d'intéressement des salariés et l'attribution de ces options ou bons à leurs bénéficiaires ;</li>
             <li>toute décision relative à la restructuration de la Société, toute modification statutaire (à l'exception du transfert de siège social dans la même département), toute distribution de dividendes ;</li>
             <li>toute cession d'un actif non prévu au budget d'une valeur supérieure à 30.000 euros ;</li>
             <li>toute souscription d'un emprunt ou autre contrat non prévu au budget comportant un engagement supérieur à 30.000 euros ;</li>
             <li>tout engagement hors bilan pris par la Société en dehors du fonctionnement normal des affaires courantes ;</li>
             <li>toute convention réglementée ;</li>
             <li>tout mandat de vente ou d'introduction en bourse de la Société (hors mandat de vente qui serait confié à un intermédiaire en application de la clause de liquidité visée ci-avant).</li>
           </ol>`,
    plain: `Une liste de décisions clés ne peut être prise sans l'accord favorable d'au moins un représentant des Investisseurs : budget et engagements hors budget > 30.000 €, rémunérations, recrutements de cadres clés, opérations sur le capital, modifications statutaires, dividendes, endettement, M&A, IPO…`,
    why: `Droits de veto protégeant l'investisseur minoritaire sur toutes les décisions structurantes.`,
    watch: `Le seuil de 30.000 € est bas et peut freiner la gestion courante. Négociez des seuils plus élevés et sortez de la liste les décisions purement opérationnelles.`,
  },

  /* ----- ENGAGEMENTS DES FONDATEURS ----- */
  {
    key: 'implication', group: 'Engagements des Fondateurs', label: 'Engagement d’implication', risk: 'mid',
    html: `<p>Les Fondateurs doivent dédier l'ensemble de leur temps de travail à la Société tant qu'ils exercent une fonction de dirigeant ou de salarié au sein de la Société.</p>
           <p>Cependant, l'exercice d'une autre activité, au titre de laquelle le Fondateur ne consacrerait pas plus de 10 heures par mois, ne pourrait être considéré comme constitutif d'un manquement au présent engagement d'implication.</p>`,
    plain: `Les Fondateurs doivent consacrer tout leur temps de travail à la société. Une activité accessoire ≤ 10 h/mois reste tolérée.`,
    why: `L'investisseur veut des fondateurs à plein temps et concentrés sur le projet.`,
    watch: `« Tout leur temps » est exigeant. Faites lister explicitement vos activités existantes (mandats, advisory) pour qu'elles ne soient pas requalifiées en manquement.`,
  },
  {
    key: 'noncompete', group: 'Engagements des Fondateurs', label: 'Non-concurrence et non-débauchage', risk: 'mid',
    html: `<p>Engagements classiques de non-débauchage et de non-concurrence pour les Fondateurs pendant une période maximale de 12 mois à compter de la fin de leurs fonctions.</p>
           <p>Ledit engagement sera rémunéré à hauteur de 30 % de leur dernière rémunération mensuelle brute fixe perçue au titre de leur mandat social ou contrat de travail.</p>`,
    plain: `Non-concurrence et non-débauchage pendant 12 mois après le départ, rémunérés à 30 % de la dernière rémunération mensuelle brute fixe.`,
    why: `Empêche un fondateur partant de lancer un concurrent ou de débaucher les équipes.`,
    watch: `Vérifiez le périmètre géographique et sectoriel et que l'indemnité (30 %) est bien due — une clause sans contrepartie est nulle en droit du travail.`,
  },
  {
    key: 'pi', group: 'Engagements des Fondateurs', label: 'Cession des droits de propriété intellectuelle', risk: 'low',
    html: `<p>Engagement des Fondateurs de céder tout droit de propriété intellectuelle développé par eux, à la Société.</p>`,
    plain: `Les Fondateurs s'engagent à céder à la société toute la propriété intellectuelle qu'ils développent.`,
    why: `Garantit que toute la techno et la marque appartiennent à la société, pas aux individus.`,
    watch: `Essentiel et standard. Assurez-vous que la cession de PI est réellement formalisée par acte : un simple engagement de principe ne suffit pas juridiquement à transférer la PI.`,
  },
  {
    key: 'leaver', group: 'Engagements des Fondateurs', label: 'Promesses de vente — clauses de leaver', risk: 'high',
    html: `<p><strong>Bad Leaver</strong> — pendant toute la durée du Pacte, en cas (a) de cessation des fonctions pour révocation pour faute lourde ou violation des engagements de non-concurrence, non-sollicitation, confidentialité, implication et cession des droits de PI : le Fondateur s'engage à céder l'intégralité de ses actions sous promesse, pour un prix « P » par Action où, selon le nombre de mois « M » écoulés depuis la Date de Réalisation : 0 < M ≤ 48 → P = valeur nominale ; 48 < M → P = Valeur de Marché × 0,70.</p>
           <p><strong>Medium Leaver</strong> — pendant 48 mois, en cas (a) de révocation ne constituant pas un Bad Leaver, ou (b) de départ à l'initiative du Fondateur pour une raison autre que la Force Majeure : 0 < M ≤ 12 → P = valeur nominale ; 12 < M ≤ 24 → P = Valeur de Marché × 0,10 ; 24 < M ≤ 36 → × 0,20 ; 36 < M ≤ 48 → × 0,30.</p>
           <p><strong>Good Leaver</strong> — pendant 48 mois, en cas de départ pour cause de Force Majeure (décès, invalidité permanente de 2ᵉ catégorie) : le Fondateur cède ses actions à leur Valeur de Marché.</p>`,
    plain: `Si un Fondateur quitte la société, il doit céder ses actions à un prix qui dépend du motif et de l'ancienneté : Bad Leaver (faute) → prix très bas ; Medium Leaver (révocation sans faute / départ volontaire) → décote dégressive ; Good Leaver (décès, invalidité) → pleine valeur de marché.`,
    why: `C'est le « vesting » à la française : il aligne les fondateurs sur la durée et sanctionne un départ négatif.`,
    watch: `Clause cruciale pour VOUS. Négociez : une qualification stricte du Bad Leaver, le rythme d'acquisition (48 mois ici), et une accélération en cas de cession de la société.`,
    example: `<p class="example__cap">Exemple « Medium Leaver » : un fondateur qui part après <strong>18 mois</strong> cède ses actions à <strong>10 %</strong> de leur valeur de marché. Un Good Leaver (décès, invalidité) touche 100 % ; un Bad Leaver (faute) touche ≈ 0 (valeur nominale).</p>`,
  },

  /* ----- RÉALISATION ET CONDITIONS (complété) ----- */
  {
    key: 'realisation', group: 'Réalisation et conditions', label: 'Réalisation (Date de Réalisation)', risk: 'low', added: true,
    html: `<p>La réalisation de l'Investissement (la « <strong>Réalisation</strong> » ou « <strong>Date de Réalisation</strong> ») interviendrait au plus tard le 30 septembre 2026, sous réserve de la levée des conditions suspensives ci-dessous. Les durées prévues au présent document (lock-up, leavers, comité) courent à compter de cette date.</p>`,
    plain: `Fixe la date butoir du closing (signature des actes + versement des fonds).`,
    why: `Donne un horizon de temps et sert de point de départ aux clauses calées sur la « Date de Réalisation » (lock-up, leaver, comité).`,
    watch: `Vérifiez la faisabilité du délai et prévoyez ce qui se passe s'il est dépassé (caducité de la lettre ?).`,
  },
  {
    key: 'conditions', group: 'Réalisation et conditions', label: 'Conditions suspensives', risk: 'mid', added: true,
    html: `<p>La Réalisation est soumise à la levée des conditions suivantes :</p>
           <ol type="i">
             <li>réalisation d'une due diligence juridique, financière, fiscale, sociale, technique et de propriété intellectuelle jugée satisfaisante par l'Investisseur Majoritaire ;</li>
             <li>signature du pacte d'associés, des statuts modifiés et des promesses de cession (leaver) ;</li>
             <li>adoption des décisions sociales nécessaires à l'augmentation de capital ;</li>
             <li>absence de changement défavorable significatif affectant la Société ;</li>
             <li>remise de la table de capitalisation définitive.</li>
           </ol>`,
    plain: `L'argent n'est versé que si ces conditions sont remplies : audit satisfaisant, contrats définitifs signés, décisions sociales adoptées, etc.`,
    why: `L'investisseur sécurise son entrée en vérifiant la société « sous le capot » avant de payer.`,
    watch: `« Due diligence satisfaisante » est une porte de sortie large pour l'investisseur. Préparez une data room propre et complète pour rendre cette phase rapide et sans surprise.`,
  },
  {
    key: 'garanties', group: 'Réalisation et conditions', label: 'Déclarations et garanties', risk: 'mid', added: true,
    html: `<p>Les Fondateurs consentiront une déclaration de garantie (garantie d'actif et de passif) usuelle au bénéfice des Investisseurs, plafonnée et limitée dans le temps, couvrant notamment la situation comptable, fiscale, sociale et la propriété intellectuelle de la Société.</p>`,
    plain: `Les Fondateurs garantissent l'exactitude de la situation de la société. Si un passif caché apparaît après le closing, ils indemnisent — dans des limites (plafond, durée).`,
    why: `Protège l'investisseur contre les mauvaises surprises postérieures à son entrée.`,
    watch: `Négociez le plafond (souvent un % du montant investi), la durée et une franchise. Refusez une garantie illimitée dans son montant ou sa durée.`,
  },

  /* ----- DISPOSITIONS DIVERSES (complété) ----- */
  {
    key: 'exclusivite', group: 'Dispositions diverses', label: 'Exclusivité (No-shop)', risk: 'mid', added: true,
    html: `<p>À compter de la signature de la présente lettre et jusqu'à la Date de Réalisation (et au plus tard pendant 60 jours), la Société et les Fondateurs s'engagent à ne pas solliciter, susciter ni négocier d'offre concurrente d'investissement ou d'acquisition. <strong>Cette clause est contraignante.</strong></p>`,
    plain: `Pendant la négociation (60 jours), vous ne pouvez pas chercher un autre investisseur. C'est l'une des rares clauses qui vous engage juridiquement dès la signature.`,
    why: `L'investisseur protège le temps et l'argent qu'il engage en due diligence ; il ne veut pas servir de levier pour faire monter les enchères.`,
    watch: `Limitez la durée (60 jours max ici) et prévoyez son expiration automatique si le deal n'aboutit pas, pour ne pas rester « gelé ».`,
  },
  {
    key: 'confidentialite', group: 'Dispositions diverses', label: 'Confidentialité', risk: 'low', added: true,
    html: `<p>Les parties s'engagent à garder confidentiels la présente lettre et son contenu, sauf accord écrit préalable ou obligation légale, et sous réserve de la communication à leurs conseils respectifs. <strong>Cette clause est contraignante.</strong></p>`,
    plain: `Ne pas divulguer publiquement les termes de la levée. Engageante dès la signature.`,
    why: `Protège la valorisation et les conditions vis-à-vis des concurrents et du marché.`,
    watch: `Vérifiez l'exception permettant d'en parler à vos conseils (avocat, expert-comptable) et à vos cofondateurs.`,
  },
  {
    key: 'frais', group: 'Dispositions diverses', label: 'Frais', risk: 'low', added: true,
    html: `<p>Chaque partie supporte ses propres frais. En cas de Réalisation, la Société pourra prendre en charge les frais raisonnables de conseil de l'Investisseur Majoritaire, dans la limite de 15.000 euros HT.</p>`,
    plain: `Qui paie les avocats : chacun les siens, mais la société rembourse ceux du lead jusqu'à 15.000 € si le deal se fait.`,
    why: `Usage de marché : l'investisseur fait souvent supporter une partie de ses frais par la société.`,
    watch: `Plafonnez ce remboursement (ici 15.000 €) et conditionnez-le strictement à la réalisation effective de l'opération.`,
  },
  {
    key: 'duree', group: 'Dispositions diverses', label: 'Durée de validité', risk: 'low', added: true,
    html: `<p>La présente lettre d'intention est valable jusqu'au 31 juillet 2026. Passé ce délai et à défaut de signature par l'ensemble des parties, elle deviendra caduque de plein droit.</p>`,
    plain: `Date limite pour signer cette lettre d'intention, sans quoi elle expire automatiquement.`,
    why: `Évite qu'une offre reste ouverte indéfiniment.`,
    watch: `Assurez-vous que le délai vous laisse le temps de comparer d'autres offres avant de vous engager dans l'exclusivité.`,
  },
  {
    key: 'nonbinding', group: 'Dispositions diverses', label: 'Caractère non contraignant', risk: 'low', added: true,
    html: `<p>À l'exception des clauses « Exclusivité », « Confidentialité » et « Frais », la présente lettre ne constitue pas un engagement ferme et irrévocable des parties de réaliser l'Investissement.</p>`,
    plain: `Rappel : seules l'exclusivité, la confidentialité et les frais engagent juridiquement ; tout le reste demeure une intention.`,
    why: `Laisse aux parties la liberté de renoncer si la due diligence révèle un problème majeur.`,
    watch: `Ne considérez l'opération comme acquise qu'une fois les actes définitifs signés et les fonds effectivement reçus sur le compte.`,
  },
  {
    key: 'droit', group: 'Dispositions diverses', label: 'Droit applicable et juridiction', risk: 'low', added: true,
    html: `<p>La présente lettre est soumise au droit français. Tout différend relatif à sa validité, son interprétation ou son exécution sera de la compétence exclusive du Tribunal de commerce de Paris.</p>`,
    plain: `En cas de litige, ce sont le droit français et le Tribunal de commerce de Paris qui s'appliquent.`,
    why: `Clause finale standard de tout contrat.`,
    watch: `Cohérent pour une société française. Rien de particulier à négocier ici.`,
  },

  /* ===== CLAUSES OPTIONNELLES — bibliothèque (hors contrat par défaut) ===== */
  {
    key: 'reporting', group: 'Gouvernance', label: 'Droit à l’information renforcé', risk: 'mid', inDoc: false,
    html: `<p>Les Investisseurs recevront, dans les 30 jours de la clôture de chaque trimestre, un reporting comprenant les comptes de gestion, la situation de trésorerie, le suivi du budget et les principaux indicateurs d'activité (KPIs), ainsi que les comptes annuels.</p>`,
    plain: `La société s'engage à transmettre chaque trimestre un reporting détaillé (compta, trésorerie, KPIs) aux investisseurs.`,
    why: `L'investisseur veut suivre de près la santé de la société et anticiper les besoins de financement.`,
    watch: `Charge de travail récurrente pour une petite équipe. Cadrez le format et la fréquence (trimestriel suffit souvent).`,
  },
  {
    key: 'observer', group: 'Gouvernance', label: 'Censeur (observateur au Comité)', risk: 'low', inDoc: false,
    html: `<p>L'Investisseur Majoritaire pourra désigner un censeur, assistant aux réunions du Comité Stratégique avec voix consultative, sans droit de vote, et tenu à la confidentialité.</p>`,
    plain: `L'investisseur peut envoyer un « observateur » au comité : il assiste et écoute, mais ne vote pas.`,
    why: `Permet de suivre la gouvernance sans alourdir les votes ni prendre un siège votant supplémentaire.`,
    watch: `Peu risqué. Vérifiez qu'il s'agit bien d'une voix consultative (pas de vote) et qu'il est soumis à la confidentialité.`,
  },
  {
    key: 'liquidite', group: 'Droits financiers des Investisseurs', label: 'Clause de liquidité', risk: 'mid', inDoc: false,
    html: `<p>À défaut de cession ou d'introduction en bourse dans un délai de 7 ans à compter de la Réalisation, les Investisseurs pourront demander la mise en œuvre d'un processus de liquidité organisé (mandat de cession confié à une banque d'affaires) afin de permettre leur sortie.</p>`,
    plain: `Si aucune sortie (vente ou bourse) n'a eu lieu sous 7 ans, l'investisseur peut forcer le lancement d'un processus de vente de la société.`,
    why: `Un fonds a une durée de vie limitée : il doit pouvoir sortir, même si les fondateurs préfèrent continuer seuls.`,
    watch: `Point sensible : vous pourriez être poussé à vendre alors que vous voulez continuer. Négociez le délai (7-10 ans) et un droit de préemption des fondateurs.`,
  },
  {
    key: 'rachat', group: 'Droits financiers des Investisseurs', label: 'Clause de rachat (Redemption)', risk: 'high', inDoc: false,
    html: `<p>À l'issue d'une période de 6 ans, les Investisseurs pourront demander à la Société le rachat de leurs actions à un prix égal au plus élevé entre le Prix de Souscription et la valeur de marché, sous réserve des sommes distribuables.</p>`,
    plain: `Au bout de 6 ans, l'investisseur peut demander à la société de lui racheter ses actions (au moins à son prix d'entrée).`,
    why: `C'est une porte de sortie garantie pour l'investisseur si aucune vente n'intervient.`,
    watch: `Très favorable à l'investisseur et dangereuse pour la trésorerie : la société doit sortir du cash. À éviter ou encadrer strictement.`,
  },
  {
    key: 'paytoplay', group: 'Droits financiers des Investisseurs', label: 'Clause de Pay-to-Play', risk: 'mid', inDoc: false,
    html: `<p>En cas de futur tour de financement, tout Investisseur ne participant pas à hauteur de son pro rata verrait ses actions de préférence converties en actions ordinaires, perdant le bénéfice des droits préférentiels.</p>`,
    plain: `Si un investisseur ne remet pas au pot lors des prochains tours, il perd ses droits préférentiels (ses actions deviennent ordinaires).`,
    why: `Incite les investisseurs à continuer de soutenir la société, surtout dans les tours difficiles.`,
    watch: `Plutôt favorable au fondateur : utile à proposer côté société, elle « sanctionne » les investisseurs passifs.`,
  },
  {
    key: 'mfn', group: 'Droits financiers des Investisseurs', label: 'Nation la plus favorisée (MFN)', risk: 'low', inDoc: false,
    html: `<p>Si la Société accordait à un futur investisseur des droits plus favorables que ceux consentis aux présents Investisseurs, ces derniers en bénéficieraient automatiquement.</p>`,
    plain: `Si un futur investisseur obtient de meilleures conditions, les investisseurs actuels en profitent automatiquement.`,
    why: `Évite à l'investisseur d'être « doublé » par un nouvel entrant mieux loti.`,
    watch: `Peu risqué pour vous, mais cela réduit votre marge pour offrir des conditions spéciales à un futur lead.`,
  },
  {
    key: 'dividprio', group: 'Droits financiers des Investisseurs', label: 'Dividende prioritaire cumulatif', risk: 'mid', inDoc: false,
    html: `<p>Les Actions A porteront un dividende prioritaire cumulatif de 8 % par an, capitalisé et payable en priorité lors de toute distribution ou cession.</p>`,
    plain: `Les actions de l'investisseur accumulent un dividende de 8 %/an, même non versé : il s'ajoute comme une dette à rembourser en priorité lors d'une sortie.`,
    why: `Garantit à l'investisseur un rendement minimum, qui s'empile au fil des années.`,
    watch: `Point sensible : un dividende cumulatif gonfle ce que l'investisseur récupère avant vous. Préférez un dividende non cumulatif, voire aucun.`,
  },
  {
    key: 'rofo', group: 'Transferts de titres', label: 'Droit de première offre (ROFO)', risk: 'low', inDoc: false,
    html: `<p>Avant toute cession de titres à un tiers, l'Associé cédant devra d'abord proposer ses titres aux autres Associés, qui disposeront d'un délai pour formuler une offre de rachat.</p>`,
    plain: `Avant de vendre à un tiers, vous devez d'abord proposer vos actions aux autres associés.`,
    why: `Permet aux associés existants de garder la main sur l'actionnariat avant qu'un tiers n'entre.`,
    watch: `Proche du droit de préemption. Vérifiez qu'il ne ralentit pas trop une cession (délais courts) et son articulation avec la préemption.`,
  },
  {
    key: 'nonsollicitation', group: 'Engagements des Fondateurs', label: 'Non-sollicitation de clients', risk: 'mid', inDoc: false,
    html: `<p>Pendant 12 mois après la fin de leurs fonctions, les Fondateurs s'interdisent de solliciter les clients et prospects de la Société pour une activité concurrente.</p>`,
    plain: `Après leur départ, les fondateurs ne peuvent pas démarcher les clients de la société pendant 12 mois.`,
    why: `Complète la non-concurrence en protégeant spécifiquement le portefeuille clients.`,
    watch: `Vérifiez le périmètre (clients « actifs » plutôt que tous prospects) et la durée, pour ne pas vous bloquer inutilement.`,
  },
  {
    key: 'hommecle', group: 'Engagements des Fondateurs', label: 'Assurance homme-clé', risk: 'low', inDoc: false,
    html: `<p>La Société souscrira une assurance « homme-clé » à son bénéfice sur la tête des Fondateurs, pour un capital à déterminer d'un commun accord.</p>`,
    plain: `La société assure les fondateurs : en cas de décès/incapacité, elle touche une indemnité pour encaisser le choc.`,
    why: `Protège la société (et indirectement l'investisseur) contre la perte d'un fondateur indispensable.`,
    watch: `Peu risqué et plutôt sain. Vérifiez que c'est bien la société (et non l'investisseur) qui est bénéficiaire, et le coût de la prime.`,
  },
  {
    key: 'mac', group: 'Réalisation et conditions', label: 'Changement défavorable significatif (MAC)', risk: 'mid', inDoc: false,
    html: `<p>Les Investisseurs pourront ne pas réaliser l'Investissement en cas de survenance, avant la Réalisation, d'un événement ayant un effet défavorable significatif sur l'activité, la situation financière ou les perspectives de la Société.</p>`,
    plain: `Si un événement grave touche la société avant le closing, l'investisseur peut se retirer.`,
    why: `Protège l'investisseur entre la signature et le versement des fonds contre une dégradation majeure.`,
    watch: `« Effet défavorable significatif » est flou et offre une large porte de sortie. Définissez-le précisément (seuils chiffrés) et excluez les événements de marché généraux.`,
  },
  {
    key: 'mediation', group: 'Dispositions diverses', label: 'Médiation préalable', risk: 'low', inDoc: false,
    html: `<p>En cas de différend, les parties s'engagent à tenter une médiation amiable préalable avant toute action judiciaire.</p>`,
    plain: `Avant d'aller au tribunal, les parties doivent d'abord tenter de régler le litige à l'amiable par un médiateur.`,
    why: `Permet d'éviter des contentieux longs et coûteux, et de préserver la relation.`,
    watch: `Peu risqué et souvent utile. Vérifiez que la médiation est encadrée dans le temps pour ne pas retarder une action urgente.`,
  },
];

const RISK_LABEL = { low: 'Risque faible', mid: 'À surveiller', high: 'Point sensible' };
let EXPLAIN = Object.fromEntries(TERMSHEET.map(c => [c.key, c]));
// Clés de la term sheet de démonstration : sert à détecter un autre type de document.
const ORIGINAL_TS_KEYS = new Set(TERMSHEET.map(c => c.key));

// Document « libre » (statuts, pacte, PV…) chargé via un modèle : on parle alors
// de « paragraphes » et l'onglet Conseil propose des pistes d'amélioration.
let isCustom = false;
let docAdviceCache = null; // conseils IA spécifiques au document chargé
const UNIT  = (n = 1) => (isCustom ? 'paragraphe' : 'clause') + (n > 1 ? 's' : '');

/* Clauses indispensables (non supprimables) et ordre d'affichage des groupes. */
const ESSENTIAL = new Set(['societe', 'fondateurs', 'investisseur', 'investissement', 'titre']);
const GROUP_ORDER = [
  'Parties', 'L’opération', 'Droits financiers des Investisseurs', 'Transferts de titres',
  'Gouvernance', 'Engagements des Fondateurs', 'Réalisation et conditions', 'Dispositions diverses',
];
// Présence dans le contrat : true par défaut, sauf inDoc:false explicite (clauses de la bibliothèque).
TERMSHEET.forEach(c => { c.inDoc = c.inDoc !== false; });
const masterIndex = key => TERMSHEET.findIndex(c => c.key === key);

/* Curseur d'avantage : 1 = équilibré / pro-fondateur … 5 = fortement pro-investisseurs. */
const BIAS = {
  societe: 1, fondateurs: 2, investisseur: 1, investissement: 3, titre: 3,
  liquidation: 3, ratchet: 4, antidilution: 2,
  lockup: 4, preemption: 2, fulltag: 2, proptag: 3, drag: 3, libres: 2,
  board: 2, decisions: 4,
  implication: 3, noncompete: 3, pi: 2, leaver: 4,
  realisation: 1, conditions: 3, garanties: 3,
  exclusivite: 3, confidentialite: 1, frais: 2, duree: 1, nonbinding: 1, droit: 1,
  // bibliothèque
  reporting: 2, observer: 2, liquidite: 4, rachat: 5, paytoplay: 1, mfn: 2, dividprio: 5,
  rofo: 2, nonsollicitation: 3, hommecle: 2, mac: 3, mediation: 1,
};
const BIAS_LABEL = {
  1: 'Neutre / équilibré',
  2: 'Légèrement favorable aux investisseurs',
  3: 'Favorable aux investisseurs',
  4: 'Très favorable aux investisseurs',
  5: 'Fortement favorable aux investisseurs',
};
const BIAS_COLOR = { 1: '#16a34a', 2: '#84cc16', 3: '#d97706', 4: '#ea580c', 5: '#dc2626' };

function biasMeter(level) {
  const dots = [1, 2, 3, 4, 5].map(n =>
    `<span class="biasmeter__pt${n === level ? ' is-on' : ''}"${n === level
      ? ` style="background:${BIAS_COLOR[level]};box-shadow:0 0 0 4px ${BIAS_COLOR[level]}22"` : ''}></span>`
  ).join('');
  return `
    <div class="biasmeter">
      <div class="biasmeter__track">${dots}</div>
      <div class="biasmeter__legend"><span>Équilibré</span><span>Pro-investisseurs</span></div>
      <div class="biasmeter__label" style="color:${BIAS_COLOR[level]}">${BIAS_LABEL[level]}</div>
    </div>`;
}

/* Annexe : table de capitalisation post-investissement */
const CAPTABLE = [
  { name: 'Camille Mercier', type: 'Actions ordinaires', shares: 55000, pct: '47,14 %', amount: '—' },
  { name: 'Helios Holding', type: 'Actions ordinaires', shares: 45000, pct: '38,57 %', amount: '—' },
  { name: 'Orbit Ventures', type: 'Actions A', shares: 12500, pct: '10,71 %', amount: '750.000 €' },
  { name: 'Seedline Capital', type: 'Actions A', shares: 2500, pct: '2,14 %', amount: '150.000 €' },
  { name: 'Business angels', type: 'Actions A', shares: 1667, pct: '1,43 %', amount: '100.000 €' },
];

/* Modalités détaillées (approfondissement de chaque clause). Ajoutées au corps. */
const DETAIL = {
  societe: `<p>La Société est une société par actions simplifiée régie par les articles L. 227-1 et suivants du Code de commerce. L'exercice social court du 1er janvier au 31 décembre de chaque année.</p>
    <p>La Société déclare et garantit que, à la date des présentes : (i) les 100.000 actions composant le capital sont intégralement souscrites et libérées ; (ii) il n'existe aucune valeur mobilière, option, bon, promesse ou autre droit donnant accès, immédiatement ou à terme, au capital ou aux droits de vote, autres que ceux figurant dans la table de capitalisation jointe en Annexe ; (iii) les titres sont libres de tout nantissement, gage, sûreté ou promesse non divulgués ; et (iv) la Société ne détient aucune filiale ni participation non mentionnée à l'Annexe.</p>
    <p>La Société tiendra à jour un registre des mouvements de titres et des comptes d'actionnaires reflétant fidèlement la répartition du capital après la Réalisation.</p>`,
  fondateurs: `<p>Les Fondateurs, ainsi que toute holding patrimoniale les représentant, sont ensemble désignés les « <strong>Associés Dirigeants</strong> ». Chaque Fondateur déclare détenir ses titres en pleine propriété, libres de toute sûreté.</p>
    <p>Chaque Fondateur s'engage, pendant toute la durée du Pacte, à : (i) exercer ses fonctions avec diligence et loyauté ; (ii) consacrer à la Société l'intégralité de son activité professionnelle dans les conditions de l'Engagement d'implication ; et (iii) ne pas démissionner sans un préavis raisonnable permettant d'organiser sa succession.</p>
    <p>La qualité de Fondateur emporte de plein droit l'application des engagements d'inaliénabilité, de promesses de cession (leavers), de non-concurrence, de non-sollicitation et de cession des droits de propriété intellectuelle stipulés ci-après.</p>`,
  investisseur: `<p>L'Investisseur Majoritaire pourra se substituer, pour tout ou partie de son investissement, toute entité qu'il contrôle, qui le contrôle ou qui est gérée par la même société de gestion, et syndiquer son investissement auprès des Investisseurs Minoritaires, sans que cela ne modifie les droits attachés aux Actions A.</p>
    <p>Les Investisseurs déclarent agir pour leur compte propre, disposer des autorisations internes nécessaires et n'être soumis à aucune restriction les empêchant de réaliser l'Investissement. Aucun Investisseur ne sera tenu solidairement des engagements d'un autre Investisseur.</p>
    <p>Les droits qualifiés ci-après de droits de l'« Investisseur Majoritaire » lui demeurent personnels et seront transmis à tout cessionnaire venant à détenir, à la suite d'un transfert libre, la majorité des Actions A.</p>`,
  investissement: `<p>L'Investissement sera réalisé par voie d'augmentation de capital en numéraire réservée aux Investisseurs, par émission de 16.667 Actions A nouvelles au Prix de Souscription de 60 euros chacune, se décomposant en une valeur nominale de 0,01 euro et une prime d'émission de 59,99 euros par action, soit un produit brut total de 1.000.020 euros.</p>
    <p>La libération s'effectuera intégralement en numéraire à la Date de Réalisation, par versement sur un compte ouvert au nom de la Société ou séquestré entre les mains de son conseil, le déblocage des fonds étant subordonné à la constatation de la réalisation définitive de l'augmentation de capital.</p>
    <p>Le nombre d'Actions A et le Prix de Souscription pourront être ajustés, d'un commun accord, pour tenir compte de toute opération sur le capital intervenant entre la signature des présentes et la Réalisation, afin de préserver le pourcentage de détention cible des Investisseurs (environ 14,3 % sur une base non fully diluted).</p>`,
  titre: `<p>Chaque Action A confère à son titulaire les mêmes droits qu'une action ordinaire (une voix par action, droit aux dividendes et au boni de liquidation), augmentés des droits particuliers stipulés au Pacte et dans les statuts : liquidation préférentielle, anti-dilution, BSA Ratchet, droits d'information et de gouvernance.</p>
    <p>Les Actions A seront converties de plein droit en actions ordinaires, action pour action (sous réserve des ajustements anti-dilution), (i) en cas d'admission des actions de la Société aux négociations sur un marché réglementé et (ii) sur décision des titulaires d'Actions A statuant à la majorité.</p>
    <p>Les droits particuliers attachés aux Actions A ne pourront être modifiés sans l'accord de la majorité de leurs titulaires réunis en assemblée spéciale.</p>`,
  liquidation: `<p>Pour les besoins de la présente clause, constitue un « <strong>Événement de Liquidité</strong> » toute cession entraînant un transfert du contrôle de la Société, toute fusion, apport ou opération assimilée, ainsi que toute liquidation ou dissolution.</p>
    <p>La préférence est « non participative » : un Investisseur ne peut cumuler le remboursement préférentiel et un partage du boni au titre des mêmes actions ; il perçoit, action par action, le plus élevé des deux montants. En cas de pluralité de catégories d'actions de préférence, les préférences ne se cumulent pas (absence de « double-dip ») et s'exercent au même rang, au marc l'euro en cas d'insuffisance du produit.</p>
    <p>Les versements reçus par les Investisseurs au titre du carve-out de 10 % viennent en déduction du remboursement perçu au deuxième rang. La présente clause prime sur toute règle légale supplétive de répartition et sera reflétée dans les statuts et le Pacte.</p>`,
  ratchet: `<p>En cas d'émission de titres à un prix par action inférieur au Prix de Souscription (un « <strong>Tour à la Baisse</strong> ») pendant les 12 mois suivant la Réalisation, chaque Investisseur y ayant participé à hauteur d'au moins son pro rata pourra souscrire, à la valeur nominale, un nombre d'actions tel que son prix moyen pondéré d'entrée soit ramené au prix résultant de la formule « broad-based weighted average ».</p>
    <p>L'ajustement est plafonné à 5 actions nouvelles par ABSA. Sont exclus : (i) les actions, BSPCE, options et bons émis au titre du pool destiné aux salariés et dirigeants ; (ii) les titres émis en conséquence d'une fusion ou acquisition approuvée ; (iii) les titres émis lors de la conversion de valeurs mobilières existantes ; et (iv) les titres émis au titre du présent BSA Ratchet.</p>
    <p>L'ajustement sera mis en œuvre par émission de bons (ABSA) attribués gratuitement aux Investisseurs à la Réalisation.</p>`,
  antidilution: `<p>Préalablement à toute émission de titres nouveaux (hors émissions réservées au pool d'options et hors cas exclus visés à la clause de BSA Ratchet), la Société notifiera à l'Investisseur Majoritaire les caractéristiques de l'émission envisagée.</p>
    <p>L'Investisseur Majoritaire disposera d'un délai de quinze (15) jours ouvrés pour exercer son droit de souscription préférentielle et souscrire, aux mêmes conditions de prix, le nombre de titres lui permettant de maintenir son pourcentage de détention sur une base entièrement diluée.</p>
    <p>Ce droit est incessible, sauf au profit des entités de son groupe, et s'éteint en cas d'introduction en bourse.</p>`,
  lockup: `<p>La « <strong>faculté de respiration</strong> » s'entend de la possibilité, pour chaque Fondateur, de céder librement jusqu'à 10 % des titres qu'il détient au jour de la Réalisation, sous réserve des droits de préemption et de sortie conjointe.</p>
    <p>Pendant l'inaliénabilité, les Fondateurs s'interdisent de céder, apporter, nantir ou conférer une sûreté ou une promesse sur leurs titres, sauf au profit d'une holding patrimoniale dans les conditions des Transferts Libres. Toute cession réalisée en violation sera nulle et inopposable à la Société, qui refusera de l'inscrire dans ses registres.</p>
    <p>L'inaliénabilité se cumule avec les promesses de cession (leavers) ; en cas de départ, ce sont les clauses de leaver qui déterminent le sort des titres.</p>`,
  preemption: `<p>L'Associé souhaitant céder ses titres (le « <strong>Cédant</strong> ») notifiera aux bénéficiaires et à la Société les modalités du transfert projeté : identité du cessionnaire envisagé, nombre de titres, prix et conditions de paiement (la « <strong>Notification de Transfert</strong> »).</p>
    <p>Les bénéficiaires disposeront de trente (30) jours pour exercer leur droit, selon les rangs ci-dessus et au prorata. Le droit ne peut s'exercer que pour la totalité des titres offerts : à défaut de préemption intégrale, le Cédant pourra céder au cessionnaire envisagé, aux conditions notifiées, dans un délai de soixante (60) jours, sous réserve des droits de sortie conjointe.</p>
    <p>Le prix de préemption est égal au prix notifié ; en cas de contrepartie non monétaire ou de contestation, il sera fixé par expert conformément à l'article 1843-4 du Code civil.</p>`,
  fulltag: `<p>Le ou les Associés cédants notifieront le projet de cession aux autres Associés et à la Société, en précisant l'identité du Cessionnaire Envisagé et les conditions de l'opération.</p>
    <p>Les bénéficiaires disposeront de trente (30) jours pour exercer leur droit et céder tout ou partie de leurs titres aux mêmes conditions. La réalisation de la cession est subordonnée au rachat concomitant de l'ensemble des titres dont la cession est demandée à ce titre.</p>
    <p>Les garanties consenties par les bénéficiaires seront limitées à la propriété et à la capacité, à l'exclusion de toute garantie d'actif et de passif, leur responsabilité étant conjointe et non solidaire et plafonnée au prix perçu.</p>`,
  proptag: `<p>Le ou les Associés cédants notifieront le projet de cession à l'Investisseur Majoritaire, qui disposera de quinze (15) jours pour exercer son droit.</p>
    <p>Le nombre de titres qu'il pourra céder est égal au produit du nombre total de titres cédés par son pourcentage de détention ; le nombre de titres cédés par les Associés cédants est réduit à due concurrence afin que le volume global proposé au Cessionnaire Envisagé demeure inchangé.</p>
    <p>Ce droit s'articule avec le droit de préemption, dont l'exercice prime le cas échéant.</p>`,
  drag: `<p>Constitue une « <strong>Offre Qualifiée</strong> » toute offre ferme et de bonne foi, émanant d'un tiers non lié, portant sur au moins 95 % des titres et acceptée par des Associés représentant au moins 70 % du capital et des droits de vote, sous réserve de l'approbation préalable de l'Investisseur Majoritaire.</p>
    <p>Chaque Associé sera tenu de céder ses titres aux mêmes conditions, de signer la documentation et de donner les consentements nécessaires. Le prix global sera réparti conformément à la clause de liquidation préférentielle et le prix par action ne pourra être inférieur au Prix de Souscription.</p>
    <p>Les garanties des Associés entraînés seront limitées à la propriété de leurs titres et à leur capacité, sans garantie d'actif et de passif au-delà du prix perçu, leur responsabilité étant conjointe et non solidaire. Chaque Associé consent un mandat irrévocable à l'Investisseur Majoritaire à l'effet de signer les actes de cession en cas de carence.</p>`,
  libres: `<p>On entend par « <strong>groupe</strong> » d'un Investisseur l'ensemble des entités qui le contrôlent, qu'il contrôle, sous contrôle commun, qu'il gère ou gérées par la même société de gestion, au sens de l'article L. 233-3 du Code de commerce.</p>
    <p>Le transfert libre au profit d'une holding patrimoniale est subordonné au maintien permanent des conditions de détention (immatriculation dans l'Union européenne, représentation par le Fondateur, détention directe à plus de 70 %). À défaut, le Fondateur s'engage à faire rétrocéder sans délai les titres à son profit, faute de quoi ils seront soumis de plein droit aux droits de préemption et de sortie conjointe.</p>
    <p>Tout transfert libre fera l'objet d'une information préalable et emportera adhésion du cessionnaire au Pacte.</p>`,
  board: `<p>Le Comité Stratégique se réunira au moins une fois par trimestre, sur convocation de son président adressée au moins cinq (5) jours à l'avance avec un ordre du jour et les documents utiles ; il pourra se tenir par visioconférence.</p>
    <p>Il délibère valablement si la moitié au moins de ses membres sont présents ou représentés, dont au moins un représentant des Investisseurs ; ses avis sont rendus à la majorité simple, incluant le vote favorable d'au moins un représentant des Investisseurs pour les Décisions Importantes. Chaque membre dispose d'une voix, sans voix prépondérante.</p>
    <p>L'Investisseur Majoritaire pourra désigner un censeur assistant aux réunions avec voix consultative. Les membres seront indemnisés de leurs frais raisonnables et les décisions constatées par procès-verbaux.</p>`,
  decisions: `<p>Les seuils ci-dessus s'apprécient par opération ou par série d'opérations liées sur un même exercice. L'absence d'approbation dans un délai de quinze (15) jours suivant la saisine du Comité Stratégique vaut refus. La liste des Décisions Importantes sera reprise à l'identique dans les statuts et le Pacte ; toute décision prise en violation de la présente clause engagera la responsabilité de son auteur et sera inopposable aux Investisseurs.</p>`,
  implication: `<p>L'Engagement d'implication emporte exclusivité : les Fondateurs s'interdisent toute autre activité professionnelle, salariée ou indépendante, à l'exception (i) des activités accessoires n'excédant pas 10 heures par mois et (ii) des mandats expressément déclarés et annexés au Pacte à la date de la Réalisation.</p>
    <p>Tout manquement caractérisé et non régularisé dans les trente (30) jours d'une mise en demeure pourra être qualifié de cessation de fonctions à l'initiative du Fondateur, emportant l'application des promesses de cession (Medium ou Bad Leaver selon les circonstances).</p>`,
  noncompete: `<p>La non-concurrence couvre, pendant douze (12) mois à compter de la cessation effective des fonctions, le territoire français et tout pays où la Société exerce une activité significative ; elle interdit de créer, financer, exploiter ou prêter son concours à toute activité concurrente.</p>
    <p>La non-débauchage interdit, pendant la même durée, de solliciter ou d'embaucher les salariés, dirigeants ou prestataires clés. En contrepartie, la Société versera une indemnité mensuelle égale à 30 % de la dernière rémunération mensuelle brute fixe. La Société pourra renoncer à l'engagement, et corrélativement à l'indemnité, par notification dans les quinze (15) jours du départ.</p>`,
  pi: `<p>Les Fondateurs cèdent à la Société, à titre exclusif et pour le monde entier, l'ensemble des droits de propriété intellectuelle (droits d'auteur sur les logiciels et leur code source, bases de données, marques, dessins et modèles, noms de domaine, savoir-faire) créés en lien avec l'activité, pour toute la durée légale de protection.</p>
    <p>Ils garantissent la Société contre tout trouble, déclarent que les développements sont originaux et libres de droits de tiers, n'incorporent aucune composante open source incompatible avec leur exploitation commerciale, et s'engagent à faire régulariser par tout contributeur (salariés, stagiaires, prestataires) les cessions nécessaires et à signer tout acte complémentaire utile.</p>`,
  leaver: `<p>Pour les besoins des présentes : la « <strong>Valeur de Marché</strong> » désigne la valorisation retenue (i) lors de la dernière augmentation de capital des six (6) derniers mois, (ii) à défaut, d'un commun accord, et (iii) à défaut, à dire d'expert (article 1843-4 du Code civil) ; la « <strong>Force Majeure</strong> » désigne le décès ou l'invalidité permanente de deuxième catégorie (article L. 341-4 du Code de la sécurité sociale).</p>
    <p>Chaque Fondateur consent, au profit des autres Associés Opérationnels (premier rang) puis des autres Associés (second rang, à due concurrence), une promesse de vente portant sur l'intégralité de ses actions sous promesse, exerçable selon la qualification (Bad, Medium ou Good Leaver) et le barème de prix « P » exposés ci-dessus.</p>
    <p>La promesse pourra être levée dans les six (6) mois de la cessation des fonctions ; le prix sera payable comptant ou, au choix des bénéficiaires, en plusieurs échéances sur douze (12) mois. À défaut de bénéficiaire, la Société pourra se porter acquéreur en vue d'une réduction de capital ou d'une attribution au pool.</p>`,
  realisation: `<p>À la Date de Réalisation, les parties procéderont, dans l'ordre, aux opérations suivantes (le « <strong>Closing</strong> ») : (i) constatation de la levée ou de la renonciation aux conditions suspensives ; (ii) décisions sociales approuvant l'augmentation de capital, la modification des statuts et la nomination des organes ; (iii) signature du Pacte et des promesses de cession ; (iv) versement des fonds ; et (v) constatation par le Président de la réalisation définitive de l'augmentation de capital et inscription des Actions A en compte.</p>
    <p>Les opérations du Closing sont interdépendantes et réputées concomitantes ; à défaut de réalisation de l'une, aucune ne sera réputée intervenue.</p>`,
  conditions: `<p>Les conditions stipulées dans l'intérêt des Investisseurs pourront faire l'objet d'une renonciation de leur part. À défaut de levée de l'ensemble des conditions au plus tard à la Date de Réalisation (sauf prorogation convenue), chaque partie pourra renoncer à l'opération sans indemnité, sous réserve des clauses contraignantes.</p>`,
  garanties: `<p>La déclaration de garantie portera notamment sur la situation juridique, comptable, fiscale, sociale, environnementale et de conformité (en ce compris la protection des données personnelles), la propriété intellectuelle, l'absence de litige non révélé et la sincérité des comptes de référence.</p>
    <p>Elle sera plafonnée à un montant égal au montant de l'Investissement, dégressif dans le temps, assortie d'une franchise et d'un seuil de déclenchement. Sa durée sera de dix-huit (18) mois, portée à la durée de prescription augmentée de trois (3) mois en matières fiscale, sociale et douanière. Elle pourra être garantie par une retenue de prix, un séquestre ou une garantie à première demande, sa mise en jeu obéissant à une procédure contradictoire.</p>`,
  exclusivite: `<p>Pendant la période d'exclusivité, la Société et les Fondateurs s'interdisent de solliciter, encourager ou entrer en discussion avec un tiers en vue d'une levée de fonds, d'une cession de titres ou d'actifs ou de toute opération concurrente, et informeront sans délai les Investisseurs de toute marque d'intérêt spontanée.</p>
    <p>En cas de manquement, la Société remboursera aux Investisseurs les frais raisonnables engagés (conseils, due diligence), sans préjudice de tous autres droits. La présente clause est contraignante et survivra à la caducité de la lettre.</p>`,
  confidentialite: `<p>Constitue une information confidentielle toute information échangée dans le cadre de l'opération, en ce compris l'existence et les termes de la présente lettre. Ne sont pas confidentielles les informations (i) tombées dans le domaine public sans manquement, (ii) déjà légitimement détenues ou (iii) dont la divulgation est imposée par la loi ou une autorité.</p>
    <p>Chaque partie pourra communiquer ces informations à ses conseils, dirigeants et, pour les Investisseurs, à leurs souscripteurs et entités de groupe, tenus à une confidentialité équivalente. Toute communication de presse sera soumise à l'accord écrit préalable des parties. L'obligation subsistera deux (2) ans après le terme des discussions.</p>`,
  frais: `<p>Chaque partie conserve la charge de ses propres frais et honoraires de conseil. En cas de Réalisation, la Société prendra en charge les frais raisonnables et justifiés de conseil de l'Investisseur Majoritaire, dans la limite de 15.000 euros hors taxes, par imputation sur la prime d'émission.</p>
    <p>En l'absence de Réalisation, chaque partie supportera définitivement ses propres frais, sous réserve de la clause d'exclusivité.</p>`,
  duree: `<p>À défaut de signature par l'ensemble des parties au plus tard le 31 juillet 2026, la présente lettre deviendra caduque de plein droit, sans indemnité. La Date de Réalisation et la durée de validité pourront être prorogées d'un commun accord écrit.</p>`,
  nonbinding: `<p>Seules les clauses « Exclusivité », « Confidentialité », « Frais », « Durée de validité », « Caractère non contraignant » et « Droit applicable et juridiction » ont une valeur juridiquement contraignante dès la signature. Les autres stipulations expriment l'intention des parties et n'emportent aucune obligation de conclure.</p>
    <p>La présente lettre ne saurait être interprétée comme une société créée de fait, une promesse de contrat ou une obligation de négocier jusqu'à son terme ; chaque partie demeure libre de ne pas réaliser l'opération si les conditions ne sont pas réunies.</p>`,
  droit: `<p>La présente lettre est rédigée en langue française et soumise au droit français. Les parties tenteront de résoudre amiablement tout différend ; à défaut d'accord dans les trente (30) jours, le litige relèvera de la compétence exclusive du Tribunal de commerce de Paris, nonobstant pluralité de défendeurs ou appel en garantie.</p>`,
  // Clauses de bibliothèque
  reporting: `<p>Le reporting trimestriel sera transmis dans les trente (30) jours de la clôture de chaque trimestre ; les comptes annuels, dans les quatre (4) mois de la clôture. La Société donnera accès, sur demande raisonnable, à ses livres et documents sociaux et informera sans délai les Investisseurs de tout événement significatif affectant son activité ou sa trésorerie.</p>`,
  observer: `<p>Le censeur recevra les mêmes informations et convocations que les membres du Comité Stratégique, participera à ses débats avec voix consultative et sera tenu aux mêmes obligations de confidentialité. Sa fonction est gratuite, hors remboursement de frais.</p>`,
  liquidite: `<p>À l'expiration du délai de 7 ans, à défaut de cession ou d'introduction en bourse, l'Investisseur Majoritaire pourra demander la nomination d'une banque d'affaires chargée d'organiser la cession de la Société. Les Associés coopéreront de bonne foi, sous réserve d'un droit de préemption prioritaire des Fondateurs au prix de la meilleure offre reçue.</p>`,
  rachat: `<p>La demande de rachat pourra être exercée à l'issue de la 6e année, par notification, pour un prix égal au plus élevé du Prix de Souscription et de la Valeur de Marché. Le rachat ne sera réalisé que dans la limite des sommes distribuables et de l'intérêt social ; à défaut, il sera reporté ou échelonné, sans pouvoir compromettre la continuité d'exploitation.</p>`,
  paytoplay: `<p>L'Investisseur ne participant pas, à hauteur de son pro rata, à un tour de financement qualifié verra l'intégralité de ses Actions A converties en actions ordinaires, perdant les droits de liquidation préférentielle, d'anti-dilution et de gouvernance, sans préjudice des autres stipulations du Pacte.</p>`,
  mfn: `<p>Si la Société venait à conférer à un investisseur ultérieur des droits économiques ou politiques plus favorables, l'Investisseur Majoritaire pourra, par notification, se prévaloir de tout ou partie de ces droits, le Pacte étant amendé en conséquence.</p>`,
  dividprio: `<p>Le dividende prioritaire de 8 % l'an est cumulatif et capitalisé à défaut de versement, payable par préférence lors de toute distribution, cession ou liquidation. Le cumul non versé s'ajoute au montant dû aux Investisseurs au titre de la liquidation préférentielle.</p>`,
  rofo: `<p>Avant toute mise en vente, l'Associé cédant notifiera son intention en indiquant le nombre de titres ; les autres Associés disposeront de vingt (20) jours pour formuler une offre ferme. À défaut d'accord sur le prix, le cédant pourra céder à un tiers à un prix au moins égal à la meilleure offre reçue, dans les quatre-vingt-dix (90) jours.</p>`,
  nonsollicitation: `<p>Pendant douze (12) mois à compter de la cessation des fonctions, les Fondateurs s'interdisent de solliciter, directement ou indirectement, les clients et prospects actifs avec lesquels ils ont été en relation, en vue de prestations concurrentes.</p>`,
  hommecle: `<p>La Société souscrira, à ses frais et à son bénéfice exclusif, une assurance « homme-clé » sur la tête de chaque Fondateur, pour un capital déterminé d'un commun accord, afin de couvrir les conséquences financières de son décès ou de son incapacité.</p>`,
  mac: `<p>Constitue un changement défavorable significatif tout événement entraînant une dégradation substantielle de l'activité, de la situation financière, des actifs ou des perspectives de la Société, à l'exclusion des évolutions générales de marché ou de réglementation sectorielles. Sa survenance avant la Réalisation autorisera les Investisseurs à ne pas réaliser l'opération.</p>`,
  mediation: `<p>Préalablement à toute action judiciaire, les parties soumettront leur différend à une médiation conduite par un médiateur désigné d'un commun accord ou, à défaut, par le centre de médiation compétent, pendant une durée maximale de soixante (60) jours, sauf mesures conservatoires ou urgence justifiée.</p>`,
};

/* ---------- 1. Construction du document ---------- */
const page = document.getElementById('page');

function buildDocument() {
  let html = `
    <h1 class="doc-title">LETTRE D'INTENTION</h1>
    <p class="doc-sub">LUMIO SAS</p>
    <p class="doc-preamble">Cette lettre d'intention présente les principales conditions et modalités selon lesquelles l'investissement envisagé dans la société LUMIO pourrait être réalisé. Elle ne constitue en aucun cas un engagement ferme et irrévocable des parties de procéder à cet investissement.</p>
    <hr />
  `;

  GROUP_ORDER.forEach(group => {
    const inGroup = TERMSHEET.filter(c => c.inDoc && c.group === group);
    if (!inGroup.length) return;
    html += `<div class="ts-group" contenteditable="false">${group}</div>`;
    inGroup.forEach(c => {
      html += `
      <div class="ts-clause" data-key="${c.key}">
        <div class="ts-label">${c.label}</div>
        <div class="ts-content">${c.html}${DETAIL[c.key] || ''}</div>
      </div>`;
    });
  });

  // Signatures
  html += `
    <div class="ts-sign">
      <div class="box"><strong>Pour la Société et les Fondateurs</strong><div class="line">Camille Mercier — Présidente<br />Fait à Paris, le …………………</div></div>
      <div class="box"><strong>Pour l'Investisseur Majoritaire</strong><div class="line">Orbit Ventures — représentée par …………………<br />Fait à Paris, le …………………</div></div>
    </div>`;

  // Annexe : table de capitalisation
  let rows = CAPTABLE.map(r =>
    `<tr><td>${r.name}</td><td>${r.type}</td><td class="num">${r.shares.toLocaleString('fr-FR')}</td><td class="num">${r.pct}</td><td class="num">${r.amount}</td></tr>`
  ).join('');
  html += `
    <div class="ts-annexe">
      <div class="ts-group" contenteditable="false">Annexe — Table de capitalisation (post-investissement)</div>
      <table class="captable">
        <thead><tr><th>Associé</th><th>Catégorie</th><th>Actions</th><th>% capital</th><th>Montant investi</th></tr></thead>
        <tbody>
          ${rows}
          <tr class="total"><td>Total</td><td>—</td><td class="num">116.667</td><td class="num">100,00 %</td><td class="num">1.000.000 €</td></tr>
        </tbody>
      </table>
    </div>`;

  page.innerHTML = html;
}
buildDocument();

/* ---------- 2. Barre d'outils : commandes de mise en forme ---------- */
try { document.execCommand('styleWithCSS', false, true); } catch (e) {}
// La touche Entrée crée des paragraphes <p> (stylés) plutôt que des <div> bruts.
try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) {}

function exec(cmd, value = null) {
  page.focus();
  document.execCommand(cmd, false, value);
  syncToolbar();
}

document.querySelectorAll('.tbtn[data-cmd]').forEach(btn => {
  btn.addEventListener('mousedown', e => e.preventDefault());
  btn.addEventListener('click', () => exec(btn.dataset.cmd));
});

// Ajout d'une clause STRUCTURÉE (étiquette + contenu) : seule façon fiable
// d'insérer un paragraphe qui respecte la mise en page (grille étiquette | contenu),
// notamment dans les modèles « libres » où la bibliothèque sert de sommaire.
function addClauseBlock() {
  const div = document.createElement('div');
  div.className = 'ts-clause';
  const key = 'c' + Date.now().toString(36);
  div.dataset.key = key;
  div.innerHTML = '<div class="ts-label">Nouveau paragraphe</div>'
    + '<div class="ts-content"><p>Saisissez le texte de ce paragraphe…</p></div>';

  // Position : juste après la clause active, sinon avant la signature / l'annexe.
  const ref = activeKey ? page.querySelector('.ts-clause[data-key="' + activeKey + '"]') : null;
  if (ref) ref.after(div);
  else {
    const anchor = page.querySelector('.ts-sign') || page.querySelector('.ts-annexe');
    if (anchor) anchor.before(div); else page.appendChild(div);
  }

  // Réintègre la nouvelle clause au modèle (sommaire + décrypteur) puis recompose
  // la mise en page avant de défiler/placer le curseur (sinon tout se décalerait).
  adoptDocumentClauses();
  paginate();
  selectClauseByKey(key, div);
  div.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const p = div.querySelector('.ts-content p');
  if (p) {
    const r = document.createRange();
    r.selectNodeContents(p);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }
}
const addClauseBtn = document.getElementById('add-clause-btn');
if (addClauseBtn) {
  addClauseBtn.addEventListener('mousedown', e => e.preventDefault());
  addClauseBtn.addEventListener('click', addClauseBlock);
}

const selStyle = document.getElementById('sel-style');
selStyle.addEventListener('change', () => exec('formatBlock', selStyle.value));

const selFont = document.getElementById('sel-font');
selFont.addEventListener('change', () => exec('fontName', selFont.value));

const selSize = document.getElementById('sel-size');
selSize.addEventListener('change', () => {
  page.focus();
  document.execCommand('fontSize', false, '7');
  page.querySelectorAll('font[size="7"]').forEach(f => {
    f.removeAttribute('size');
    f.style.fontSize = selSize.value + 'px';
  });
  syncToolbar();
});

const foreColor = document.getElementById('fore-color');
const backColor = document.getElementById('back-color');
foreColor.addEventListener('input', () => {
  document.getElementById('fore-bar').style.background = foreColor.value;
  exec('foreColor', foreColor.value);
});
backColor.addEventListener('input', () => {
  document.getElementById('back-bar').style.background = backColor.value;
  exec('hiliteColor', backColor.value);
});

/* ---------- 3. États actifs de la barre ---------- */
function syncToolbar() {
  document.querySelectorAll('.tbtn[data-state]').forEach(btn => {
    let on = false;
    try { on = document.queryCommandState(btn.dataset.state); } catch (e) {}
    btn.classList.toggle('is-active', on);
  });
  try {
    let block = (document.queryCommandValue('formatBlock') || '').toLowerCase().replace(/[<>]/g, '');
    const known = ['h1', 'h2', 'h3', 'blockquote'];
    selStyle.value = known.includes(block) ? block : 'p';
  } catch (e) {}
}

/* ---------- 4. Décrypteur : suit le curseur ---------- */
const panelBody = document.getElementById('panel-body');
const panelActions = document.getElementById('panel-actions');
const panelResult = document.getElementById('panel-result');
const panelTitle = document.getElementById('panel-title');
const panelEyebrow = document.getElementById('panel-eyebrow');
const panelCount = document.getElementById('panel-count');
const caretClause = document.getElementById('caret-clause');
let activeKey = null;

function clauseFromNode(node) {
  let el = node && node.nodeType === 3 ? node.parentElement : node;
  while (el && el !== page) {
    if (el.dataset && el.dataset.key) return el;
    el = el.parentElement;
  }
  return null;
}

function renderPanel(key) {
  const c = EXPLAIN[key];
  const idx = TERMSHEET.findIndex(x => x.key === key);
  const riskClass = c.risk === 'low' ? 'risk--low' : c.risk === 'mid' ? 'risk--mid' : 'risk--high';

  panelEyebrow.textContent = c.group;
  panelTitle.textContent = c.label;
  caretClause.textContent = `${c.label}`;

  const exampleBlock = c.example ? `
    <div class="block">
      <div class="block__h">Exemple chiffré</div>
      ${c.example}
    </div>` : '';

  const removeCtrl = isCustom
    ? ''
    : ESSENTIAL.has(key)
    ? `<span class="clause-essential">Clause essentielle</span>`
    : `<button class="clause-remove" id="clause-remove" title="Déplacer cette clause vers la bibliothèque">Retirer du contrat</button>`;

  panelActions.innerHTML = `${removeCtrl}
    <button class="btn btn--primary" id="verify-btn" title="Analyser cette clause avec Claude">Analyser</button>`;
  panelActions.hidden = false;

  const vr = document.getElementById('verify-result');
  if (vr) { vr.innerHTML = ''; panelResult.hidden = true; }

  panelBody.innerHTML = `
    ${c.plain ? `<div class="block">
      <div class="block__h">En langage courant</div>
      <p>${c.plain}</p>
    </div>` : ''}
    <div class="block block--simple" id="block-simple">
      <div class="block__h">Pour bien comprendre</div>
      <p id="simple-text">${SIMPLE[key] || '…'}</p>
    </div>
    ${exampleBlock}
    ${BIAS[key] !== undefined ? `<div class="block">
      <div class="block__h">Avantage pour les investisseurs</div>
      ${biasMeter(BIAS[key] || 3)}
    </div>` : ''}
    ${c.watch ? `<div class="callout callout--advice">
      <div class="block__h">Priorités — côté fondateur</div>
      <p>${c.watch}</p>
    </div>` : ''}
    <div class="cond-section" id="cond-section">
      <div class="cond-section__head">
        <span class="cond-section__title">Conditions pré-écrites</span>
        <span class="cond-section__hint">Valeurs en jaune = modifiables</span>
      </div>
      <div class="cond-tpl-list" id="cond-tpl-list"></div>
    </div>`;
  panelBody.scrollTop = 0;

  const rb = document.getElementById('clause-remove');
  if (rb) rb.addEventListener('click', () => removeFromContract(key));

  renderCondTemplates(key);

  const vb = document.getElementById('verify-btn');
  if (vb) vb.addEventListener('click', () => verifyClause(key));

  mountChat(key);
  refreshSimple(key);
}

function showEmptyPanel() {
  activeKey = null;
  page.querySelectorAll('.ts-clause').forEach(el => el.classList.remove('is-active'));
  panelEyebrow.textContent = 'Décrypteur';
  panelTitle.textContent = `Placez le curseur dans un${isCustom ? ' paragraphe' : 'e clause'}`;
  caretClause.textContent = 'Document prêt';
  panelActions.hidden = true;
  panelResult.hidden = true;
  panelBody.innerHTML = `<div class="panel__empty"><p>Cliquez dans un${isCustom ? ' paragraphe' : 'e clause'} du document pour l'expliquer en langage courant.</p></div>`;
  hideChat();
}

function updateFromSelection() {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const clause = clauseFromNode(sel.anchorNode);
  const key = clause ? clause.dataset.key : null;
  if (key !== activeKey) {
    page.querySelectorAll('.ts-clause').forEach(el => el.classList.toggle('is-active', el === clause));
    if (key) { activeKey = key; renderPanel(key); }
    else showEmptyPanel();
  }
}

document.addEventListener('selectionchange', () => {
  if (document.activeElement === page) updateFromSelection();
});
page.addEventListener('click', updateFromSelection);
page.addEventListener('keyup', () => { updateFromSelection(); syncToolbar(); });

/* ---------- 5. Compteur de mots ---------- */
const wordcount = document.getElementById('wordcount');
function countWords() {
  const text = (page.innerText || '').trim();
  const n = text ? text.split(/\s+/).length : 0;
  wordcount.textContent = n + (n > 1 ? ' mots' : ' mot');
}
page.addEventListener('input', countWords);

// Modification au clavier dans une clause → on réactualise SA bulle « Pour bien
// comprendre » (débouncé : un seul appel API une fois la frappe terminée ; le cache
// évite tout appel si le texte final n'a pas changé).
let simpleTypeTimer = null;
page.addEventListener('input', () => {
  if (!activeKey) return;
  clearTimeout(simpleTypeTimer);
  simpleTypeTimer = setTimeout(() => {
    if (!activeKey) return;
    const c = page.querySelector(`.ts-clause[data-key="${activeKey}"] .ts-content`);
    if (c && EXPLAIN[activeKey]) EXPLAIN[activeKey].html = c.innerHTML; // garde le modèle cohérent
    refreshSimple(activeKey);
  }, 1200);
});

countWords();
panelCount.textContent = `${TERMSHEET.length} clauses`;

/* ---------- 5 bis. Pagination écran (mise en page façon Word) ----------
   Le contenu est réparti sur des feuilles A4. On découpe à un grain fin :
   les blocs de premier niveau, mais aussi les paragraphes et les puces À
   L'INTÉRIEUR d'une clause longue. Tout élément qui déborde de la feuille
   courante est repoussé en haut de la suivante, donc une clause plus grande
   qu'une page se coupe proprement entre deux paragraphes au lieu de
   chevaucher l'espace gris. */
const PAGE_H = 1160;       // hauteur d'une feuille A4 à 820 px de large
const SHEET_GAP = 28;      // espace gris entre deux feuilles
const CONTENT_TOP = 76;    // marge haute imprimable d'une feuille
const CONTENT_BOTTOM = 76; // marge basse imprimable d'une feuille
const sheetBg = document.getElementById('sheet-bg');
const paper = document.getElementById('paper');
let paginating = false;

// Décompose le contenu d'une clause en éléments coupables (paragraphes, puces…).
// Les listes sont éclatées en <li> ; les autres blocs (ex. encadré de condition)
// restent insécables.
function flattenContent(content) {
  const out = [];
  for (const child of content.children) {
    if ((child.tagName === 'UL' || child.tagName === 'OL') && child.children.length) {
      for (const li of child.children) out.push(li);
    } else {
      out.push(child);
    }
  }
  return out;
}

// Construit la liste ordonnée des unités à placer.
//  · m = élément mesuré (position/hauteur réelles)
//  · t = élément sur lequel agir (marge) pour déplacer l'unité
//  · group = vrai pour un titre de section (règle « garder avec la suivante »)
function buildLeaves() {
  const leaves = [];
  for (const top of Array.from(page.children)) {
    if (top.classList.contains('ts-clause')) {
      const content = top.querySelector('.ts-content');
      const parts = content ? flattenContent(content) : [];
      if (parts.length) {
        // La 1re unité entraîne toute la clause (étiquette + 1er paragraphe).
        leaves.push({ m: parts[0], t: top, group: false });
        for (let k = 1; k < parts.length; k++) leaves.push({ m: parts[k], t: parts[k], group: false });
      } else {
        leaves.push({ m: top, t: top, group: false });
      }
    } else {
      leaves.push({ m: top, t: top, group: top.classList.contains('ts-group') });
    }
  }
  return leaves;
}

function paginate(opts = {}) {
  if (!sheetBg || !paper) return;
  paginating = true;
  try {
    const printMode = !!opts.print;
    const pitch = PAGE_H + SHEET_GAP;          // pas vertical d'une feuille à l'autre (écran)
    const usable = PAGE_H - CONTENT_TOP - CONTENT_BOTTOM; // hauteur de texte par feuille

    // 1. Repartir d'une mise en page « naturelle » : retirer marges injectées,
    //    espaceurs de page et hauteur imposée, pour mesurer les positions réelles.
    page.querySelectorAll('[data-pgspacer]').forEach(el => el.remove());
    page.querySelectorAll('[data-pgpush]').forEach(el => {
      el.style.marginTop = '';
      el.removeAttribute('data-pgpush');
    });
    page.style.minHeight = '0px';

    // Mesures robustes via getBoundingClientRect : insensibles à l'offsetParent
    // (grille des clauses, etc.). pageTop est fixe pendant tout le calcul.
    const pageTop = page.getBoundingClientRect().top;
    const topOf = el => el.getBoundingClientRect().top - pageTop;
    const heightOf = el => el.getBoundingClientRect().height;

    const leaves = buildLeaves();

    // ── Mode impression / PDF ─────────────────────────────────────────────
    // On ne déplace rien : on insère un VRAI saut de page avant chaque unité qui
    // ne tient plus sur la page courante. Le navigateur reproduit alors EXACTEMENT
    // la même répartition que l'aperçu, quelle que soit l'échelle d'impression.
    if (printMode) {
      const usablePrint = usable - 4;          // petite marge de sécurité anti-débordement
      const tops = leaves.map(l => topOf(l.m));
      const hs = leaves.map(l => heightOf(l.m));
      let used = 0;                            // hauteur de contenu déjà placée sur la page
      for (let i = 0; i < leaves.length; i++) {
        const h = hs[i];
        const spacing = i === 0 ? 0 : Math.max(0, tops[i] - (tops[i - 1] + hs[i - 1]));

        let breakHere = used > 0 && used + spacing + h > usablePrint;
        // « Garder avec la suivante » : un titre de section ne reste pas seul en
        // bas de page — il bascule s'il n'y a pas la place pour lui + sa 1re unité.
        if (!breakHere && used > 0 && leaves[i].group && i + 1 < leaves.length) {
          const hN = hs[i + 1];
          const spN = Math.max(0, tops[i + 1] - (tops[i] + hs[i]));
          if (used + spacing + h + spN + hN > usablePrint && (h + spN + hN) <= usablePrint) breakHere = true;
        }

        if (used === 0) {
          used = h;                            // 1re unité de la page (aucun saut)
        } else if (breakHere) {
          // Saut de page forcé + espaceur de marge haute, inséré avant l'unité.
          const t = leaves[i].t;
          const sp = document.createElement('div');
          sp.className = 'pgspacer';
          sp.setAttribute('data-pgspacer', '1');
          sp.setAttribute('contenteditable', 'false');
          sp.style.cssText = `height:${CONTENT_TOP}px;break-before:page;page-break-before:always;`;
          t.parentNode.insertBefore(sp, t);
          used = h;
        } else {
          used += spacing + h;
        }
      }
      sheetBg.innerHTML = '';
      page.style.minHeight = '';
      paper.style.height = '';
      return;
    }

    // Amène le haut de `m` à `targetTop` via une marge sur `t`, en compensant la
    // fusion des marges CSS (résultat vérifié et corrigé par mesures successives).
    function pushTo(t, m, targetTop) {
      t.setAttribute('data-pgpush', '1');
      const prevEl = t.previousElementSibling;
      const prevMB = prevEl ? parseFloat(getComputedStyle(prevEl).marginBottom) || 0 : 0;
      const myMT = parseFloat(getComputedStyle(t).marginTop) || 0;
      let mt = Math.max(prevMB, myMT) + (targetTop - topOf(m));
      t.style.marginTop = mt + 'px';
      for (let pass = 0; pass < 5; pass++) {
        const deficit = targetTop - topOf(m); // lecture = reflow synchrone
        if (Math.abs(deficit) <= 0.5) break;
        mt += deficit;
        t.style.marginTop = mt + 'px';
      }
    }

    // 2. Écran : parcourir les unités ; chaque mesure voit déjà les marges
    //    injectées sur les précédentes (lecture de rect = reflow synchrone).
    let cursorPage = 0;
    for (let i = 0; i < leaves.length; i++) {
      const { m, t, group } = leaves[i];
      const top = topOf(m);
      const h = heightOf(m);

      // Feuille où tombe naturellement le haut de l'unité (jamais en arrière).
      let p = Math.max(cursorPage, Math.floor(top / pitch));
      let cStart = p * pitch + CONTENT_TOP;             // début de zone de texte
      let cEnd = p * pitch + PAGE_H - CONTENT_BOTTOM;   // fin de zone de texte

      let targetTop = top;
      if (top < cStart - 0.5) targetTop = cStart;       // unité dans la marge → la caler
      if (targetTop > cEnd || targetTop + h > cEnd) {
        // L'unité déborde de la feuille → saut en haut de la suivante, sauf si elle
        // est plus grande qu'une feuille entière (on la laisse alors couler).
        if (h <= usable) {
          p += 1;
          targetTop = p * pitch + CONTENT_TOP;
        } else {
          targetTop = Math.max(top, cStart);
        }
      }

      // « Garder avec la suivante » : un titre de section ne reste pas seul en bas
      // de page. Sans la place pour le titre + sa 1re unité, on bascule le titre.
      const nx = leaves[i + 1];
      if (group && nx) {
        cEnd = p * pitch + PAGE_H - CONTENT_BOTTOM;
        const ng = Math.max(0, topOf(nx.m) - (top + h));
        const needed = h + ng + heightOf(nx.m);
        if (targetTop + needed > cEnd && needed <= usable) {
          p += 1;
          targetTop = p * pitch + CONTENT_TOP;
        }
      }

      if (targetTop - top > 0.5) pushTo(t, m, targetTop);
      cursorPage = p;
    }

    // 3. Dessin de la pile de feuilles + repères de page.
    const nPages = Math.max(1, cursorPage + 1, Math.ceil(page.scrollHeight / pitch));
    let html = '';
    for (let i = 0; i < nPages; i++) {
      const top = i * pitch;
      html += `<div class="sheet" style="top:${top}px;height:${PAGE_H}px"></div>`;
      html += `<div class="sheet__num" style="top:${top + PAGE_H + 7}px">Page ${i + 1} / ${nPages}</div>`;
    }
    sheetBg.innerHTML = html;

    const stackH = nPages * PAGE_H + (nPages - 1) * SHEET_GAP;
    page.style.minHeight = stackH + 'px';
    paper.style.height = stackH + 'px';
  } finally {
    // Toujours relâcher le verrou, même en cas d'erreur (sinon plus aucun recalcul).
    requestAnimationFrame(() => { paginating = false; });
  }
}

// Recalcule à chaque changement de hauteur (saisie, ajout/retrait de clause…),
// en ignorant les variations provoquées par paginate() lui-même ou par l'impression.
let printing = false;
const pageResizeObs = new ResizeObserver(() => {
  if (!paginating && !printing) requestAnimationFrame(() => paginate());
});
pageResizeObs.observe(page);
paginate();

// Les polices web changent les hauteurs après coup → recalcul une fois prêtes.
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => paginate());
window.addEventListener('load', () => paginate());

// Avant impression : on insère les sauts de page (mode PDF). Le verrou `printing`
// empêche l'observer de relancer une pagination écran (qui retirerait les sauts)
// pendant le rendu. On rétablit l'affichage écran après impression.
window.addEventListener('beforeprint', () => { printing = true; paginate({ print: true }); });
window.addEventListener('afterprint', () => { printing = false; paginate(); });

/* ---------- 6. Export PDF / Word ---------- */
document.getElementById('export-btn').addEventListener('click', () => window.print());

// Export direct du document (HTML structuré) → DOCX/PDF via le serveur : conserve
// la mise en page, sans passer par un PDF reconverti.
async function exportToFile(format, btn) {
  const old = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Export…'; }
  try {
    await saveTermsheet();             // s'assure que le dernier contenu est en base
    if (!currentDocId) { alert('Enregistrez d\'abord le document, puis réessayez.'); return; }
    const r = await fetch('/api/saas/termsheets/' + currentDocId + '/export', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify({ to: format }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.document) { alert(d.error || 'Export échoué.'); return; }
    window.location = '/api/saas/documents/' + d.document.id + '/download';
  } catch {
    alert('Impossible de joindre le serveur.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = old; }
  }
}
const exportDocxBtn = document.getElementById('export-docx-btn');
if (exportDocxBtn) exportDocxBtn.addEventListener('click', () => exportToFile('docx', exportDocxBtn));

/* ---------- 6 ter. Analyser tout le document (Claude) ---------- */
// Remplit en une fois : le « Pour bien comprendre » de chaque paragraphe (requête
// groupée), et l'onglet Conseil (pistes d'amélioration). La bibliothèque est déjà
// alimentée par les paragraphes du document.
async function analyzeFull(btn) {
  const old = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Analyse…'; }
  try {
    const clauses = [];
    page.querySelectorAll('.ts-clause').forEach(el => {
      const key = el.dataset.key;
      const labelEl = el.querySelector('.ts-label');
      const contentEl = el.querySelector('.ts-content');
      if (!key || !contentEl) return;
      clauses.push({ key, label: labelEl ? labelEl.textContent.trim() : key, html: contentEl.innerHTML });
    });
    const title = (docNameEl && docNameEl.textContent)
      || (page.querySelector('.doc-title') ? page.querySelector('.doc-title').textContent : 'Document');

    // 1) « Pour bien comprendre » pour chaque paragraphe (une seule requête).
    if (clauses.length) {
      const r = await fetch('/api/saas/clauses-explain', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ title, clauses }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.explanations) {
        clauses.forEach(c => {
          const t = d.explanations[c.key];
          if (t) SIMPLE_CACHE[c.key] = { sig: clauseSig(c.html), text: t };
        });
        if (activeKey) refreshSimple(activeKey);   // met à jour la bulle ouverte
      }
    }

    // 2) Onglet Conseil : pistes d'amélioration spécifiques au document.
    docAdviceCache = null;
    await renderDocAdvice();

    if (btn) btn.textContent = '✓ Analysé';
  } catch {
    if (btn) btn.textContent = 'Échec';
  } finally {
    if (btn) setTimeout(() => { btn.disabled = false; btn.textContent = old || 'Analyser'; }, 1600);
  }
}
const analyzeBtn = document.getElementById('analyze-btn');
if (analyzeBtn) analyzeBtn.addEventListener('click', () => analyzeFull(analyzeBtn));

/* ---------- 6 bis. Enregistrer / charger la term sheet (Mes documents) ------ */
let currentDocId = null;
const docNameEl = document.querySelector('.topbar__doc');
const urlFolderId = new URLSearchParams(location.search).get('folder');

// Nom proposé pour le document (à partir du sous-titre LUMIO SAS, etc.).
function termsheetName() {
  const sub = page.querySelector('.doc-sub');
  const title = page.querySelector('.doc-title');
  const company = sub ? sub.textContent.trim() : '';
  const t = title ? title.textContent.trim() : 'Term sheet';
  return (company ? `${t} — ${company}` : t).slice(0, 120);
}

// Renvoie le HTML de la term sheet, nettoyé des artefacts de pagination.
function termsheetHtml() {
  const clone = page.cloneNode(true);
  clone.querySelectorAll('[data-pgspacer]').forEach(el => el.remove());
  clone.querySelectorAll('[data-pgpush]').forEach(el => { el.style.marginTop = ''; el.removeAttribute('data-pgpush'); });
  clone.querySelectorAll('.ts-clause.is-active').forEach(el => el.classList.remove('is-active'));
  return clone.innerHTML;
}

const saveStatusEl = () => document.getElementById('save-status');
function setSaveStatus(msg) { const el = saveStatusEl(); if (el) el.textContent = msg; }

async function saveTermsheet() {
  setSaveStatus('Enregistrement…');
  const name = termsheetName();
  const html = termsheetHtml();
  const body = { name, html };
  if (urlFolderId) body.folder_id = Number(urlFolderId);
  try {
    const res = currentDocId
      ? await fetch('/api/saas/termsheets/' + currentDocId, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          credentials: 'include', body: JSON.stringify(body) })
      : await fetch('/api/saas/termsheets', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          credentials: 'include', body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      if (data.id) { currentDocId = data.id; history.replaceState(null, '', '?doc=' + currentDocId); }
      if (docNameEl) docNameEl.textContent = name;
      setSaveStatus('Enregistré');
      setTimeout(() => setSaveStatus(''), 2000);
    } else if (res.status === 401) {
      window.location.href = 'login.html';
    } else {
      setSaveStatus('Échec de l\'enregistrement');
    }
  } catch {
    setSaveStatus('Erreur réseau');
  }
}

// Réaligne le modèle (clauses présentes / éditées) sur le DOM chargé.
function syncModelFromDOM() {
  TERMSHEET.forEach(c => {
    const content = page.querySelector(`.ts-clause[data-key="${c.key}"] .ts-content`);
    c.inDoc = !!content;
    if (content) { c.html = content.innerHTML; c._merged = true; }
  });
  renderLibrary();
  renderAdvice();
  updateClauseCount();
}

// Le document chargé est-il un autre type que la term sheet de démonstration ?
// (au moins une clause sans clé connue de la term sheet)
function isCustomDocument() {
  const cls = page.querySelectorAll('.ts-clause');
  if (!cls.length) return false;
  for (const el of cls) {
    if (!el.dataset.key || !ORIGINAL_TS_KEYS.has(el.dataset.key)) return true;
  }
  return false;
}

// Reconstruit le modèle de clauses À PARTIR du document chargé : chaque type de
// document (statuts, pacte, GAP, PV…) a ainsi SES propres clauses dans le
// décrypteur et la bibliothèque, et l'explication « Pour bien comprendre » est
// générée à la demande à partir du texte réel de la clause cliquée.
function adoptDocumentClauses() {
  const derived = [];
  let group = 'Document';
  let i = 0;
  page.querySelectorAll('.ts-group, .ts-clause').forEach(el => {
    if (el.classList.contains('ts-group')) {
      group = (el.textContent || '').trim() || group;
      return;
    }
    i += 1;
    let key = el.dataset.key;
    if (!key) { key = 'c' + i; el.dataset.key = key; }
    const labelEl   = el.querySelector('.ts-label');
    const contentEl = el.querySelector('.ts-content');
    const label = (labelEl ? labelEl.textContent : 'Clause ' + i).trim() || ('Clause ' + i);
    const html  = contentEl ? contentEl.innerHTML : el.innerHTML;
    derived.push({ key, group, label, risk: 'low', html, plain: '', watch: '', inDoc: true });
    // Explication « Pour bien comprendre » codée en dur dans le modèle (data-plain)
    // → on amorce le cache pour un affichage instantané, sans appel Claude.
    const baked = el.getAttribute('data-plain');
    if (baked) SIMPLE_CACHE[key] = { sig: clauseSig(html), text: baked };
  });
  if (!derived.length) return;
  isCustom = true;
  TERMSHEET = derived;
  EXPLAIN = Object.fromEntries(derived.map(c => [c.key, c]));
  // Réétiquette les panneaux pour un document « libre ».
  const libTitle = document.querySelector('#view-library .library__title');
  if (libTitle) libTitle.textContent = 'Paragraphes du document';
  const advEyebrow = document.querySelector('#view-advice .library__eyebrow');
  if (advEyebrow) advEyebrow.textContent = 'Priorités';
  const advTitle = document.querySelector('#view-advice .library__title');
  if (advTitle) advTitle.textContent = 'Améliorer ce document';
  const chatTitle = document.querySelector('.chat__title');
  if (chatTitle) chatTitle.textContent = 'Assistant IA — modifier ce paragraphe';
  const chatExplainBtn = document.getElementById('chat-explain');
  if (chatExplainBtn) chatExplainBtn.textContent = 'Expliquer le paragraphe';
  renderLibrary();
  renderAdvice();
  updateClauseCount();
}

async function loadTermsheet(id) {
  // Affichage instantané : si le document vient d'être créé depuis un modèle, son
  // contenu a été pré-chargé (sessionStorage) — on l'affiche sans attendre le réseau.
  let preHtml = null;
  try {
    const raw = sessionStorage.getItem('liquid_prefill_' + id);
    if (raw) {
      sessionStorage.removeItem('liquid_prefill_' + id);
      const pre = JSON.parse(raw);
      if (pre && typeof pre.html === 'string' && pre.html) {
        applyTermsheet(id, pre.html, pre.name);
        preHtml = pre.html;
      }
    }
  } catch { /* pas de pré-chargement : chargement réseau normal */ }
  try {
    const res = await fetch('/api/saas/termsheets/' + id, { credentials: 'include' });
    if (!res.ok) {
      setSaveStatus('Erreur : document introuvable (' + res.status + ')');
      return;
    }
    const data = await res.json();
    if (!data.html) {
      setSaveStatus('Erreur : document vide ou illisible');
      return;
    }
    // Déjà affiché à l'identique via le pré-chargement : rien à refaire.
    if (preHtml !== null && data.html === preHtml) { currentDocId = data.id; return; }
    applyTermsheet(data.id, data.html, data.name);
  } catch (err) {
    setSaveStatus('Erreur de chargement : ' + (err.message || 'réseau'));
  }
}

// Rend une term sheet dans la page et (ré)initialise l'analyse codée en dur
// (décrypteur, conseil et conditions embarqués dans le modèle).
function applyTermsheet(id, html, name) {
  page.innerHTML = html;
  currentDocId = id;
  isCustom = false;
  docAdviceCache = null;
  if (docNameEl) docNameEl.textContent = name || 'Term sheet';
  // Mémorise le dernier document ouvert pour l'accès rapide « Reprendre » des dossiers.
  if (id != null) { try { localStorage.setItem('liquid_last_doc', JSON.stringify({ id, name: name || 'Term sheet' })); } catch {} }
  if (isCustomDocument()) adoptDocumentClauses();
  else syncModelFromDOM();

  // Conseil + conditions codés en dur dans le modèle (blocs embarqués).
  const bakedAdvice = readBakedAdvice();
  if (bakedAdvice) docAdviceCache = bakedAdvice;
  BAKED_COND = readBakedConditions();
  // Le modèle est-il déjà analysé en dur (explications et/ou conseil embarqués) ?
  const isBaked = !!bakedAdvice || !!page.querySelector('.ts-clause[data-plain]');

  showEmptyPanel();
  paginate();
  // Sinon (document libre non baké, ex. DOCX importé), analyse à la demande,
  // mise en cache serveur — pas de nouvel appel Claude à chaque génération.
  if (isCustom && !isBaked) analyzeFull(document.getElementById('analyze-btn'));
}

// Lit le conseil « codé en dur » embarqué dans un modèle (<script data-advice>).
function readBakedAdvice() {
  const el = page.querySelector('script[data-advice]');
  if (!el) return null;
  try { const arr = JSON.parse(el.textContent || '[]'); return Array.isArray(arr) && arr.length ? arr : null; }
  catch { return null; }
}

// Lit les conditions pré-écrites « codées en dur » d'un modèle (<script data-conditions>).
function readBakedConditions() {
  const el = page.querySelector('script[data-conditions]');
  if (!el) return {};
  try { const obj = JSON.parse(el.textContent || '{}'); return (obj && typeof obj === 'object') ? obj : {}; }
  catch { return {}; }
}

// Autosave : enregistre 1,5 s après la dernière modification du contenu.
let _saveTimer = null;
function scheduleAutosave() {
  clearTimeout(_saveTimer);
  setSaveStatus('…');
  _saveTimer = setTimeout(saveTermsheet, 1500);
}
page.addEventListener('input', scheduleAutosave);

// Ctrl/Cmd + S force une sauvegarde immédiate.
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
    e.preventDefault();
    clearTimeout(_saveTimer);
    saveTermsheet();
  }
});

// Ouvre la term sheet enregistrée passée dans l'URL (?doc=ID).
const urlDocId = new URLSearchParams(location.search).get('doc');
if (urlDocId && /^\d+$/.test(urlDocId)) loadTermsheet(Number(urlDocId));

/* ---------- 7. Assistant IA (Claude) : modifier la clause active ---------- */
const chatBox   = document.getElementById('chat');
const chatLog   = document.getElementById('chat-log');
const chatForm  = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatSend  = document.getElementById('chat-send');

const chatHistory = {};   // { [clauseKey]: [{ role, content }] }
let   chatKey     = null; // clause actuellement liée au chat

function hideChat() { chatBox.hidden = true; chatKey = null; }

function mountChat(key) {
  chatKey = key;
  chatBox.hidden = false;
  renderChatLog();
}

function renderChatLog() {
  const history = chatHistory[chatKey] || [];
  if (!history.length) {
    chatLog.innerHTML = `<p class="chat__empty">Demandez une modification de cette clause (« raccourcis la durée », « plafonne le montant », « adoucis en faveur du fondateur ») ou posez une question.</p>`;
    return;
  }
  chatLog.innerHTML = '';
  history.forEach(m => addBubble(m.role === 'user' ? 'user' : 'bot', m.content, false));
  chatLog.scrollTop = chatLog.scrollHeight;
}

function addBubble(kind, text, scroll = true) {
  if (chatLog.querySelector('.chat__empty')) chatLog.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'chat__msg chat__msg--' + kind;
  el.textContent = text;
  chatLog.appendChild(el);
  if (scroll) chatLog.scrollTop = chatLog.scrollHeight;
  return el;
}

// Plan compact de toute la term sheet, donné à Claude comme contexte (renvois entre clauses).
function buildDocOutline() {
  return TERMSHEET.map((c, i) => `${i + 1}. ${c.label} : ${c.plain}`).join('\n');
}

function addApplyButton(label, onApply) {
  const btn = document.createElement('button');
  btn.className = 'chat__apply';
  btn.type = 'button';
  btn.textContent = label;
  btn.addEventListener('click', () => onApply(btn));
  chatLog.appendChild(btn);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// Édition ciblée : remplace seulement les extraits concernés, le reste de la clause est intact.
function applyEdits(key, edits, btn) {
  const content = page.querySelector(`.ts-clause[data-key="${key}"] .ts-content`);
  if (!content) return;
  let html = content.innerHTML;
  let applied = 0;
  edits.forEach(e => {
    if (e.find && html.includes(e.find)) { html = html.replace(e.find, e.replace); applied++; }
  });
  if (applied) {
    content.innerHTML = html;
    if (EXPLAIN[key]) EXPLAIN[key].html = html;
    btn.textContent = `Modification appliquée${applied > 1 ? ` (${applied})` : ''}`;
    btn.disabled = true;
    countWords();
    if (key === activeKey) refreshSimple(key); // la clause a changé → on réactualise sa bulle
  } else {
    btn.textContent = 'Extrait introuvable — non appliqué';
    btn.disabled = true;
  }
}

function applyUpdatedClause(key, html, btn) {
  const content = page.querySelector(`.ts-clause[data-key="${key}"] .ts-content`);
  if (!content) return;
  content.innerHTML = html;
  if (EXPLAIN[key]) EXPLAIN[key].html = html; // garde le modèle cohérent
  btn.textContent = 'Clause réécrite';
  btn.disabled = true;
  countWords();
  if (key === activeKey) refreshSimple(key); // la clause a changé → on réactualise sa bulle
}

// ─── Bloc « Pour bien comprendre » : explication dynamique de la clause réelle ──
// Chaque clause a SA bulle, calculée par Claude à partir du TEXTE ACTUEL de cette
// clause précise (et d'elle seule). Elle se réactualise dès que la clause change.
const SIMPLE_CACHE = {}; // { [key]: { sig, text } } — évite de rappeler l'API si le texte n'a pas bougé
let   simpleReq    = 0;  // jeton anti-course : on ignore les réponses devenues obsolètes

// Signature compacte du contenu : on ne ré-appelle l'API que si le texte change vraiment.
function clauseSig(html) { return (html || '').replace(/\s+/g, ' ').trim(); }

async function refreshSimple(key) {
  const contentEl = page.querySelector(`.ts-clause[data-key="${key}"] .ts-content`);
  const p = document.getElementById('simple-text');
  if (!contentEl || !p) return;

  const html = contentEl.innerHTML;
  const sig  = clauseSig(html);

  const cached = SIMPLE_CACHE[key];
  if (cached && cached.sig === sig) { p.textContent = cached.text; return; } // rien n'a changé

  const myReq  = ++simpleReq;
  const clause = EXPLAIN[key];
  p.textContent = '…';

  try {
    const res = await fetch('/api/saas/clause-explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        clauseLabel: clause ? clause.label : key,
        clauseHtml:  html,
        plain:       clause ? clause.plain : '',
      }),
    });
    const data = await res.json();
    const text = res.ok && data.simple ? data.simple : (SIMPLE[key] || '');
    SIMPLE_CACHE[key] = { sig, text };
    // On n'écrit que si l'utilisateur est toujours sur cette clause ET qu'aucune
    // requête plus récente n'est partie entre-temps (sinon on écraserait la bonne bulle).
    if (myReq === simpleReq && key === activeKey) {
      const cur = document.getElementById('simple-text');
      if (cur) cur.textContent = text;
    }
  } catch {
    if (myReq === simpleReq && key === activeKey) {
      const cur = document.getElementById('simple-text');
      if (cur) cur.textContent = SIMPLE[key] || 'Explication indisponible pour le moment.';
    }
  }
}

// ─── Vérification d'une clause + de ses contenus pédagogiques ───────────────────
async function verifyClause(key) {
  const btn      = document.getElementById('verify-btn');
  const resultEl = document.getElementById('verify-result');
  if (!btn || !resultEl) return;

  const contentEl = page.querySelector(`.ts-clause[data-key="${key}"] .ts-content`);
  if (!contentEl) return;

  const clause     = EXPLAIN[key] || {};
  const clauseHtml = contentEl.innerHTML;
  const simple     = (SIMPLE_CACHE[key] && SIMPLE_CACHE[key].text) || '';

  btn.disabled = true; btn.textContent = 'Analyse…';
  panelResult.hidden = false;
  resultEl.innerHTML = '<p class="verify-result__loading">Analyse en cours…</p>';

  try {
    const res = await fetch('/api/saas/clause-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        clauseLabel: clause.label || key,
        clauseHtml,
        plain:  clause.plain  || '',
        simple,
        watch:  clause.watch  || '',
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.analysis) throw new Error(data.error || 'Erreur');

    if (key !== activeKey) return;
    const curBtn    = document.getElementById('verify-btn');
    const curResult = document.getElementById('verify-result');
    if (!curBtn || !curResult) return;

    curResult.innerHTML =
      `<div class="block__h">Analyse</div>` +
      `<p class="verify-result__text">${data.analysis}</p>`;
    curBtn.textContent = '↻ Ré-analyser';
    curBtn.disabled    = false;
  } catch {
    if (key !== activeKey) return;
    const curBtn    = document.getElementById('verify-btn');
    const curResult = document.getElementById('verify-result');
    if (curBtn)    { curBtn.disabled = false; curBtn.textContent = 'Analyser'; }
    if (curResult) curResult.innerHTML = '<p class="verify-result__err">Analyse indisponible pour le moment.</p>';
  }
}

// Message prédéfini envoyé par le bouton « Expliquer la clause ».
const EXPLAIN_PROMPT =
  'Explique-moi cette clause en détail mais simplement, du point de vue du fondateur : '
  + 'ce qu\'elle veut dire concrètement, pourquoi l\'investisseur la demande, et les points '
  + 'de vigilance à négocier. Ne modifie pas la clause, réponds juste par une explication.';

// Envoie un message à l'assistant. `apiText` part à Claude ; `displayText` est
// affiché dans la bulle utilisateur (utile pour des prompts pré-écrits).
async function sendMessage(apiText, displayText = apiText) {
  if (!apiText || !chatKey) return;

  const key = chatKey;
  const clause = EXPLAIN[key];
  const contentEl = page.querySelector(`.ts-clause[data-key="${key}"] .ts-content`);
  if (!clause || !contentEl) return;

  const history = (chatHistory[key] = chatHistory[key] || []);
  history.push({ role: 'user', content: apiText });
  addBubble('user', displayText);
  chatInput.value = '';
  chatInput.disabled = true;
  chatSend.disabled = true;
  chatExplain.disabled = true;

  const thinking = addBubble('bot', '…');

  try {
    const res = await fetch('/api/saas/clause-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        clauseLabel:     clause.label,
        clauseHtml:      contentEl.innerHTML,
        plain:           clause.plain,
        documentContext: buildDocOutline(),
        messages:        history,
      }),
    });
    const data = await res.json();
    thinking.remove();
    const active = key === chatKey; // l'utilisateur n'a pas changé de clause entre-temps

    if (!res.ok) {
      if (active) addBubble('err', data.error || 'Erreur de l\'assistant IA.');
      return;
    }

    const reply = data.reply || 'C\'est fait.';
    history.push({ role: 'assistant', content: reply });
    if (active) addBubble('bot', reply);

    if (active && data.edits && data.edits.length) {
      addApplyButton('Appliquer la modification', btn => applyEdits(key, data.edits, btn));
    } else if (active && data.updatedClause) {
      addApplyButton('Réécrire toute la clause', btn => applyUpdatedClause(key, data.updatedClause, btn));
    }
  } catch {
    thinking.remove();
    if (key === chatKey) addBubble('err', 'Impossible de joindre le serveur.');
  } finally {
    chatInput.disabled = false;
    chatSend.disabled = false;
    chatExplain.disabled = false;
    chatInput.focus();
  }
}

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  sendMessage(chatInput.value.trim());
});

// Bouton « Expliquer la clause » : envoie un prompt d'explication à Claude.
const chatExplain = document.getElementById('chat-explain');
chatExplain.addEventListener('click', () => sendMessage(EXPLAIN_PROMPT, 'Explique-moi cette clause'));

/* ---------- 8. Bibliothèque de clauses + ajout / retrait dynamique ---------- */
const libraryList  = document.getElementById('library-list');
const libraryCount = document.getElementById('library-count');

function makeGroupEl(group) {
  const d = document.createElement('div');
  d.className = 'ts-group';
  d.setAttribute('contenteditable', 'false');
  d.textContent = group;
  return d;
}

function makeClauseEl(c) {
  const div = document.createElement('div');
  div.className = 'ts-clause';
  div.dataset.key = c.key;
  div.innerHTML = `<div class="ts-label">${c.label}</div><div class="ts-content">${c.html}${c._merged ? '' : (DETAIL[c.key] || '')}</div>`;
  return div;
}

// En-têtes de groupe du document (hors annexe).
function docGroupHeaders() {
  return [...page.querySelectorAll('.ts-group')].filter(h => !h.closest('.ts-annexe'));
}

// Récupère (ou crée à la bonne place) l'en-tête d'un groupe.
function ensureGroup(group) {
  let header = docGroupHeaders().find(h => h.textContent === group);
  if (header) return header;
  header = makeGroupEl(group);
  const gi = GROUP_ORDER.indexOf(group);
  let before = docGroupHeaders().find(h => GROUP_ORDER.indexOf(h.textContent) > gi) || page.querySelector('.ts-sign');
  page.insertBefore(header, before);
  return header;
}

// Insère une clause à sa position d'origine, dans la bonne section.
function insertClauseEl(c) {
  const header = ensureGroup(c.group);
  const mi = masterIndex(c.key);
  let node = header.nextElementSibling;
  let before = null;
  while (node && !node.classList.contains('ts-group') && !node.classList.contains('ts-sign') && !node.classList.contains('ts-annexe')) {
    if (node.classList.contains('ts-clause') && masterIndex(node.dataset.key) > mi) { before = node; break; }
    node = node.nextElementSibling;
  }
  const el = makeClauseEl(c);
  page.insertBefore(el, before || node || page.querySelector('.ts-sign'));
  return el;
}

// Retire une clause du document (en sauvegardant ses éventuelles modifications).
function removeClauseEl(key) {
  const el = page.querySelector(`.ts-clause[data-key="${key}"]`);
  if (!el) return;
  const content = el.querySelector('.ts-content');
  if (content && EXPLAIN[key]) { EXPLAIN[key].html = content.innerHTML; EXPLAIN[key]._merged = true; } // conserve les éditions
  const group = EXPLAIN[key].group;
  el.remove();
  // Supprime l'en-tête de groupe s'il ne reste plus aucune clause.
  const header = docGroupHeaders().find(h => h.textContent === group);
  if (header) {
    let n = header.nextElementSibling, hasClause = false;
    while (n && !n.classList.contains('ts-group') && !n.classList.contains('ts-sign') && !n.classList.contains('ts-annexe')) {
      if (n.classList.contains('ts-clause')) { hasClause = true; break; }
      n = n.nextElementSibling;
    }
    if (!hasClause) header.remove();
  }
}

function selectClauseByKey(key, el) {
  el = el || page.querySelector(`.ts-clause[data-key="${key}"]`);
  if (!el) return;
  page.querySelectorAll('.ts-clause').forEach(x => x.classList.toggle('is-active', x === el));
  activeKey = key;
  renderPanel(key);
}

function addToContract(key) {
  const c = EXPLAIN[key];
  if (!c || c.inDoc) return;
  c.inDoc = true;
  const el = insertClauseEl(c);
  renderLibrary();
  renderAdvice();
  countWords();
  updateClauseCount();
  paginate();                 // recalcule la mise en page AVANT de défiler (sinon tout se décale)
  selectClauseByKey(key, el);
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function removeFromContract(key) {
  const c = EXPLAIN[key];
  if (!c || !c.inDoc || ESSENTIAL.has(key)) return;
  removeClauseEl(key);
  c.inDoc = false;
  renderLibrary();
  renderAdvice();
  countWords();
  updateClauseCount();
  paginate();                 // recompose les pages après le retrait de la clause
  showEmptyPanel();
}

function updateClauseCount() {
  const n = TERMSHEET.filter(c => c.inDoc).length;
  panelCount.textContent = isCustom ? `${n} ${UNIT(n)}` : `${n} clauses au contrat`;
}

// Document libre : aller à un paragraphe depuis le sommaire.
function jumpToClause(key) {
  const el = page.querySelector(`.ts-clause[data-key="${key}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  page.querySelectorAll('.ts-clause').forEach(c => c.classList.toggle('is-active', c === el));
  activeKey = key;
  renderPanel(key);
}

function renderLibrary() {
  // Document libre : la bibliothèque devient le sommaire des paragraphes (clic = aller au paragraphe).
  if (isCustom) {
    const list = TERMSHEET.filter(c => c.inDoc);
    libraryCount.textContent = list.length
      ? `${list.length} ${UNIT(list.length)} dans ce document`
      : 'Document vide';
    libraryList.innerHTML = list.map(c => `
      <div class="libitem" data-jump="${c.key}">
        <div class="libitem__top"><span class="libitem__group">${c.group}</span></div>
        <div class="libitem__label">${c.label}</div>
        <button class="libitem__add" data-jump="${c.key}" type="button">Voir le paragraphe</button>
      </div>`).join('') || '<p class="library__empty">Ce document ne contient pas encore de paragraphe.</p>';
    return;
  }
  const inDoc = TERMSHEET.filter(c => c.inDoc);
  const notIn = TERMSHEET.filter(c => !c.inDoc);
  libraryCount.textContent = `${inDoc.length} clause${inDoc.length > 1 ? 's' : ''} au contrat`;
  let html = '';
  if (inDoc.length) {
    html += `<div class="lib-sep">Dans ce document — ${inDoc.length} clause${inDoc.length > 1 ? 's' : ''}</div>`;
    html += inDoc.map(c => `
      <div class="libitem">
        <div class="libitem__top"><span class="libitem__group">${c.group}</span></div>
        <div class="libitem__label">${c.label}</div>
        <button class="libitem__add libitem__add--see" data-jump="${c.key}" type="button">Voir dans le document</button>
      </div>`).join('');
  }
  if (notIn.length) {
    html += `<div class="lib-sep">Clauses disponibles — ${notIn.length}</div>`;
    html += notIn.map(c => `
      <div class="libitem" data-key="${c.key}">
        <div class="libitem__top"><span class="libitem__group">${c.group}</span></div>
        <div class="libitem__label">${c.label}</div>
        <p class="libitem__desc">${c.plain}</p>
        <button class="libitem__add" data-add="${c.key}">+ Ajouter au contrat</button>
      </div>`).join('');
  }
  libraryList.innerHTML = html || `<p class="library__empty">Toutes les clauses sont déjà dans le contrat.</p>`;
}

libraryList.addEventListener('click', (e) => {
  const add = e.target.closest('[data-add]');
  if (add) { addToContract(add.dataset.add); return; }
  const jump = e.target.closest('[data-jump]');
  if (jump) jumpToClause(jump.dataset.jump);
});

/* ---------- Onglet « Conseil » : points à négocier, par priorité ---------- */
const adviceList  = document.getElementById('advice-list');
const adviceCount = document.getElementById('advice-count');

const PRIORITY = [
  { label: 'Priorité haute',   color: '#dc2626' },
  { label: 'Priorité moyenne', color: '#ea580c' },
  { label: 'À vérifier',       color: '#d97706' },
];

// Niveau de priorité d'une clause : point sensible / très favorable aux
// investisseurs = haute ; à surveiller / favorable = moyenne ; reste = à vérifier.
function priorityTier(c) {
  const b = BIAS[c.key] || 3;
  if (c.risk === 'high' || b >= 5) return 0;
  if (c.risk === 'mid'  || b >= 3) return 1;
  return 2;
}

// Conseil instantané et local : nombre de champs [entre crochets] à compléter.
function placeholderTip() {
  const text = page.innerText || '';
  const n = (text.match(/\[[^\]\n]{0,60}\]/g) || []).length;
  if (!n) return [];
  return [{ title: `Compléter ${n} champ${n > 1 ? 's' : ''} à renseigner`,
    body: `Le document contient ${n} champ${n > 1 ? 's' : ''} entre crochets (noms, montants, dates…) à remplacer par vos informations réelles.` }];
}

function advEsc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

function findClauseForTip(tipText) {
  const words = (tipText || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
  if (!words.length) return null;
  const clauses = [...page.querySelectorAll('.ts-clause[data-key]')];
  let best = null, bestScore = 0;
  for (const el of clauses) {
    const txt = el.textContent.toLowerCase();
    const score = words.filter(w => txt.includes(w)).length;
    if (score > bestScore) { best = el; bestScore = score; }
  }
  return bestScore >= 2 ? best : null;
}

function paintAdvice(tips, note) {
  adviceCount.textContent = note || `${tips.length} conseil${tips.length > 1 ? 's' : ''} pour améliorer ce document`;
  adviceList.innerHTML = tips.length
    ? tips.map(t => {
        const target = findClauseForTip(t.title + ' ' + t.body);
        const goBtn  = target
          ? `<button class="advitem__go" data-scroll-to="${target.dataset.key}" type="button">Aller au paragraphe</button>`
          : '';
        return `<div class="advitem" style="border-left-color:#1f8e7a">
          <div class="advitem__label">${advEsc(t.title)}</div>
          <p class="advitem__watch">${advEsc(t.body)}</p>
          ${goBtn}
        </div>`;
      }).join('')
    : '<p class="library__empty">Aucun conseil pour ce document.</p>';
}

function navigateToPlaceholder(clauseKey, placeholderText) {
  const clauseEl = page.querySelector(`.ts-clause[data-key="${clauseKey}"]`);
  if (clauseEl) {
    const walker = document.createTreeWalker(clauseEl, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      const idx = node.textContent.indexOf(placeholderText);
      if (idx !== -1) {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + placeholderText.length);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        clauseEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
  }
  // Champ déjà rempli → aller au prochain champ non rempli
  const next = findPlaceholders()[0];
  if (next) navigateToPlaceholder(next.key, next.text);
  else if (isCustom) renderDocAdvice();
}

function buildPhHtml(pList) {
  if (!pList.length) return '';
  return `<div class="lib-sep">Champs à renseigner — ${pList.length}</div>` +
    pList.map((p, i) => `
      <div class="advitem" style="border-left-color:#dc2626">
        <div class="advitem__label">${advEsc(p.text)}</div>
        <p class="advitem__watch">→ ${advEsc(p.clauseLabel)}</p>
        <button class="advitem__go" data-ph-idx="${i}" type="button">Aller à ce champ →</button>
      </div>`).join('');
}

function buildAiHtml(tips) {
  if (!tips || !tips.length) return '';
  return `<div class="lib-sep">Conseils IA — ${tips.length}</div>` +
    tips.map(t => {
      const target = findClauseForTip(t.title + ' ' + t.body);
      const goBtn  = target
        ? `<button class="advitem__go" data-scroll-to="${target.dataset.key}" type="button">Aller au paragraphe →</button>`
        : '';
      return `<div class="advitem" style="border-left-color:#1f8e7a">
        <div class="advitem__label">${advEsc(t.title)}</div>
        <p class="advitem__watch">${advEsc(t.body)}</p>
        ${goBtn}
      </div>`;
    }).join('');
}

// Conseils SPÉCIFIQUES au document, générés par l'IA à partir de son contenu réel.
async function renderDocAdvice() {
  const ph = findPlaceholders();
  adviceCount.textContent = ph.length
    ? `${ph.length} champ${ph.length > 1 ? 's' : ''} à renseigner`
    : 'Analyse du document…';

  if (docAdviceCache) {
    adviceList.innerHTML = buildPhHtml(ph) + buildAiHtml(docAdviceCache)
      || '<p class="library__empty">Aucun conseil pour ce document.</p>';
    adviceCount.textContent = `${ph.length} champ${ph.length !== 1 ? 's' : ''} à renseigner · ${docAdviceCache.length} conseil${docAdviceCache.length !== 1 ? 's' : ''}`;
    return;
  }

  adviceList.innerHTML = buildPhHtml(ph) +
    `<div class="lib-sep">Conseils IA</div><p class="library__empty" style="padding:10px 0">Analyse en cours…</p>`;

  try {
    const title = (docNameEl && docNameEl.textContent)
      || (page.querySelector('.doc-title') ? page.querySelector('.doc-title').textContent : 'Document');
    const r = await fetch('/api/saas/doc-advice', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify({ title, text: page.innerText || '' }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok && Array.isArray(data.tips) && data.tips.length) docAdviceCache = data.tips;
  } catch {}

  if (!isCustom) return;
  const freshPh = findPlaceholders();
  adviceList.innerHTML = buildPhHtml(freshPh) + buildAiHtml(docAdviceCache)
    || '<p class="library__empty">Aucun conseil pour ce document.</p>';
  adviceCount.textContent = `${freshPh.length} champ${freshPh.length !== 1 ? 's' : ''} à renseigner` +
    (docAdviceCache && docAdviceCache.length ? ` · ${docAdviceCache.length} conseil${docAdviceCache.length !== 1 ? 's' : ''}` : '');
}

function findPlaceholders() {
  const result = [];
  page.querySelectorAll('.ts-clause[data-key]').forEach(clause => {
    const content = clause.querySelector('.ts-content');
    const label   = clause.querySelector('.ts-label');
    if (!content) return;
    const matches = [...content.innerText.matchAll(/\[[^\]\n]{1,80}\]/g)];
    matches.forEach(m => result.push({
      key:         clause.dataset.key,
      clauseLabel: (label ? label.textContent : clause.dataset.key).trim(),
      text:        m[0],
    }));
  });
  return result;
}

function renderAdvice() {
  if (isCustom) { renderDocAdvice(); return; }

  const placeholders = findPlaceholders();
  const toNegotiate  = TERMSHEET
    .filter(c => c.inDoc && c.watch && (c.risk !== 'low' || (BIAS[c.key] || 3) >= 3))
    .sort((a, b) => {
      const ta = priorityTier(a), tb = priorityTier(b);
      if (ta !== tb) return ta - tb;
      return (BIAS[b.key] || 3) - (BIAS[a.key] || 3);
    });
  const toAdd = TERMSHEET.filter(c => !c.inDoc && c.watch && (c.risk === 'high' || c.risk === 'mid'));

  const total = placeholders.length + toNegotiate.length + toAdd.length;
  adviceCount.textContent = total
    ? `${total} action${total > 1 ? 's' : ''} à réaliser`
    : 'Aucune action requise pour ce document.';

  if (!total) {
    adviceList.innerHTML = `<p class="library__empty">Tout est en ordre — aucune action requise.</p>`;
    return;
  }

  let html = '';

  if (placeholders.length) {
    html += `<div class="lib-sep">Champs à renseigner — ${placeholders.length}</div>`;
    html += placeholders.map(p => `
      <div class="advitem" style="border-left-color:#dc2626">
        <div class="advitem__label">${advEsc(p.text)}</div>
        <p class="advitem__watch">Clause « ${advEsc(p.clauseLabel)} »</p>
        <button class="advitem__go" data-go="${p.key}" type="button">Aller à la clause →</button>
      </div>`).join('');
  }

  if (toNegotiate.length) {
    html += `<div class="lib-sep">Points à négocier — ${toNegotiate.length}</div>`;
    html += toNegotiate.map((c, i) => {
      const pr = PRIORITY[priorityTier(c)];
      return `<div class="advitem" style="border-left-color:${pr.color}">
        <div class="advitem__top">
          <span class="advitem__rank">${i + 1}</span>
          <span class="advitem__pri" style="color:${pr.color}">${pr.label}</span>
          <span class="advitem__group">${c.group}</span>
        </div>
        <div class="advitem__label">${c.label}</div>
        <p class="advitem__watch">${c.watch}</p>
        <button class="advitem__go" data-go="${c.key}" type="button">Voir la clause →</button>
      </div>`;
    }).join('');
  }

  if (toAdd.length) {
    html += `<div class="lib-sep">Clauses recommandées à ajouter — ${toAdd.length}</div>`;
    html += toAdd.map(c => `
      <div class="advitem" style="border-left-color:#6b7280">
        <div class="advitem__label">${advEsc(c.label)}</div>
        <p class="advitem__watch">${advEsc(c.watch)}</p>
        <button class="advitem__go" data-add-adv="${c.key}" type="button">+ Ajouter au contrat</button>
      </div>`).join('');
  }

  adviceList.innerHTML = html;
}

function flashClause(el) {
  if (!el) return;
  el.classList.remove('is-highlight');
  void el.offsetWidth; // force reflow pour relancer l'animation si déjà active
  el.classList.add('is-highlight');
  setTimeout(() => el.classList.remove('is-highlight'), 1400);
}

adviceList.addEventListener('click', (e) => {
  const addBtn = e.target.closest('[data-add-adv]');
  if (addBtn) { addToContract(addBtn.dataset.addAdv); return; }

  const phBtn = e.target.closest('[data-ph-idx]');
  if (phBtn) {
    const idx = parseInt(phBtn.dataset.phIdx, 10);
    const ph  = findPlaceholders();
    const p   = ph[idx] ?? ph[0];
    if (p) navigateToPlaceholder(p.key, p.text);
    else if (isCustom) renderDocAdvice();
    return;
  }

  const btn = e.target.closest('[data-go]');
  if (btn) {
    const el = page.querySelector(`.ts-clause[data-key="${btn.dataset.go}"]`);
    selectClauseByKey(btn.dataset.go, el);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); flashClause(el); }
    return;
  }
  const scrollBtn = e.target.closest('[data-scroll-to]');
  if (scrollBtn) {
    const key = scrollBtn.dataset.scrollTo;
    const el = page.querySelector(`.ts-clause[data-key="${key}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      page.querySelectorAll('.ts-clause').forEach(c => c.classList.toggle('is-active', c === el));
      activeKey = key;
      renderPanel(key);
      flashClause(el);
    }
  }
});

// Bascule entre les onglets Bibliothèque / Conseil.
const libTabs = document.querySelectorAll('.lib-tab');
const libViews = {
  library: document.getElementById('view-library'),
  advice: document.getElementById('view-advice'),
};
libTabs.forEach(tab => tab.addEventListener('click', () => {
  libTabs.forEach(t => t.classList.toggle('is-active', t === tab));
  const which = tab.dataset.tab;
  libViews.library.hidden = which !== 'library';
  libViews.advice.hidden = which !== 'advice';
  if (which === 'advice') renderAdvice();
}));

/* ---------- Init ---------- */
renderLibrary();
renderAdvice();
updateClauseCount();
showEmptyPanel();

/* =========================================================================
   CONDITIONS PRÉ-ÉCRITES
   Bibliothèque de conditions juridiques types, prêtes à insérer.
   Les valeurs surlignées en jaune (mark.cond-val) sont directement
   modifiables dans le document. L'assistant IA peut aussi les modifier.
   ========================================================================= */

const COND_BADGE = {
  cs:        { label: 'Condition suspensive',  color: '#f59e0b' },
  cr:        { label: 'Condition résolutoire', color: '#ef4444' },
  seuil:     { label: 'Seuil financier',       color: '#3b82f6' },
  milestone: { label: 'Milestone',             color: '#8b5cf6' },
  exception: { label: 'Exception / Carve-out', color: '#10b981' },
  ratchet:   { label: 'Ratchet',               color: '#ec4899' },
  leaver:    { label: 'Leaver',                color: '#f97316' },
  duree:     { label: 'Durée / Expiration',    color: '#6366f1' },
  option:    { label: 'Variante',              color: '#6b6b78' },
};

// Conditions pré-écrites « codées en dur » dans un modèle (clé de clause -> [templates]).
let BAKED_COND = {};

/* ---- Bibliothèque de conditions pré-rédigées ---- */
const COND_TEMPLATES = {
  investissement: [
    {
      id: 'inv_cs_audit', type: 'cs',
      label: 'CS — Due Diligence satisfaisante',
      preview: 'Sous réserve d\'une due diligence sans réserve significative dans 45 jours',
      html: `<p>La réalisation de l'investissement est soumise à la condition suspensive de la conclusion, par les Investisseurs, d'une due diligence comptable, juridique et financière (la « <strong>Due Diligence</strong> ») dont les conclusions devront être satisfaisantes, dans un délai de <mark class="cond-val">45 jours</mark> à compter de la signature des présentes.</p><p>En cas de découverte d'un passif ou d'une anomalie excédant <mark class="cond-val">50 000 €</mark>, les Investisseurs pourront : (i) renoncer à l'opération, (ii) renégocier la valorisation, ou (iii) exiger une garantie complémentaire.</p>`,
    },
    {
      id: 'inv_tranche', type: 'milestone',
      label: 'Tranche conditionnelle — Milestone ARR',
      preview: 'Tranche 2 de 500 K€ débloquée si ARR ≥ 1 M€ dans 6 mois',
      html: `<p>L'investissement est réalisé en deux tranches :</p><ol><li><strong>Tranche 1 :</strong> <mark class="cond-val">500 000 €</mark> libérés à la date de Closing, sans condition ;</li><li><strong>Tranche 2 :</strong> <mark class="cond-val">500 000 €</mark> libérés dans un délai de <mark class="cond-val">6 mois</mark> suivant le Closing, sous réserve que la Société ait atteint un ARR (chiffre d'affaires récurrent annualisé) d'au moins <mark class="cond-val">1 000 000 €</mark>, certifié par le commissaire aux comptes.</li></ol><p>À défaut d'atteinte de l'objectif, les Investisseurs ne sont pas tenus de libérer la Tranche 2.</p>`,
    },
    {
      id: 'inv_cs_concentration', type: 'cs',
      label: 'CS — Autorisation contrôle des concentrations',
      preview: 'Sous réserve de l\'autorisation de l\'Autorité de la Concurrence',
      html: `<p>La réalisation de l'opération est soumise à la condition suspensive de l'obtention des autorisations nécessaires au titre du contrôle des concentrations (art. L. 430-1 et s. C. com.), dans un délai de <mark class="cond-val">60 jours</mark> à compter de la notification. Les frais de notification sont à la charge de <mark class="cond-val">la Société</mark>.</p>`,
    },
  ],

  liquidation: [
    {
      id: 'liq_excl_ipo', type: 'exception',
      label: 'Exception — Pas de préférence en cas d\'IPO',
      preview: 'La liquidation préférentielle ne s\'applique pas en cas d\'introduction en bourse',
      html: `<p>Par exception, le mécanisme de liquidation préférentielle ne s'applique pas en cas d'introduction des titres de la Société sur un marché réglementé. En pareil cas, les produits de cession sont répartis au prorata des participations respectives, toutes catégories d'actions confondues, sans priorité.</p>`,
    },
    {
      id: 'liq_flipover', type: 'seuil',
      label: 'Seuil — Bascule prorata (flip-over)',
      preview: 'Si la préférence donne moins que le prorata, bascule automatique',
      html: `<p>Seuil de basculement (<em>flip-over</em>) : si le prix de cession par action permet aux Investisseurs de recevoir en mode préférentiel un montant inférieur à ce qu'ils recevraient au prorata de leur participation (sur la base d'une valeur de <mark class="cond-val">1×</mark> la mise, soit <mark class="cond-val">1 000 000 €</mark>), les Investisseurs renoncent automatiquement à leur préférence et participent à la répartition au prorata avec les autres associés.</p>`,
    },
    {
      id: 'liq_cascade_15x', type: 'seuil',
      label: 'Seuil — Préférence majorée 1,5×',
      preview: 'Remboursement 1,5× la mise initiale avant répartition du boni',
      html: `<p>Par dérogation, les Investisseurs bénéficient d'une liquidation préférentielle majorée : avant toute répartition du boni, ils perçoivent un montant égal à <mark class="cond-val">1,5</mark> fois leur mise initiale (soit <mark class="cond-val">1 500 000 €</mark>). Le boni résiduel est réparti entre les autres associés au prorata de leur participation.</p>`,
    },
  ],

  ratchet: [
    {
      id: 'rat_broadbased', type: 'ratchet',
      label: 'Ratchet broad-based — Formule complète',
      preview: 'Ajustement par émission d\'actions nouvelles selon formule weighted average',
      html: `<p>En cas de tour de financement à une valorisation <em>pre-money</em> inférieure à <mark class="cond-val">10 000 000 €</mark> (« <strong>Tour à la Baisse</strong> »), le nombre d'Actions A est ajusté selon la formule <em>broad-based weighted average</em> :</p><p style="margin-left:18px"><strong>N<sub>ajusté</sub> = N × (A + B) / (A + C)</strong></p><p>où : <strong>N</strong> = actions A avant ajustement · <strong>A</strong> = total actions <em>fully diluted</em> avant le Tour · <strong>B</strong> = actions qui auraient été émises au Prix de Souscription initial (<mark class="cond-val">60 €</mark>) pour lever le montant du Tour · <strong>C</strong> = actions effectivement émises lors du Tour.</p><p>L'ajustement est réalisé par émission d'actions A sans contrepartie dans les <mark class="cond-val">30 jours</mark> suivant le Tour, plafonné à <mark class="cond-val">25 %</mark> du capital post-ajustement.</p>`,
    },
    {
      id: 'rat_full', type: 'ratchet',
      label: 'Full ratchet — Protection maximale',
      preview: 'Prix ajusté au prix d\'émission du tour suivant, sans pondération',
      html: `<p>En cas de Tour à la Baisse, le prix de souscription des Actions A est rétroactivement ajusté au prix d'émission du nouveau tour, quelle que soit la taille de celui-ci (<em>full ratchet</em>). L'ajustement est réalisé par émission d'actions A nouvelles au profit des Investisseurs, sans contrepartie, dans les <mark class="cond-val">30 jours</mark> suivant la réalisation du Tour à la Baisse, sans plafond.</p>`,
    },
    {
      id: 'rat_exclusions', type: 'exception',
      label: 'Exclusions du ratchet — Standard',
      preview: 'Les opérations suivantes n\'activent pas le mécanisme de ratchet',
      html: `<p>Le mécanisme de ratchet n'est pas déclenché par : (i) l'émission de BSPCE, BSA ou stock-options dans la limite d'un pool de <mark class="cond-val">10 %</mark> du capital <em>fully diluted</em> ; (ii) la conversion d'OCA ou d'OCABSA en vigueur à la date des présentes ; (iii) les opérations de fusion, scission ou apport partiel d'actifs approuvées par les Investisseurs ; (iv) toute émission au bénéfice de partenaires stratégiques approuvée à la majorité qualifiée du Conseil.</p>`,
    },
  ],

  leaver: [
    {
      id: 'lea_vesting', type: 'leaver',
      label: 'Vesting — 36 mois, cliff 12 mois',
      preview: 'Acquisition linéaire sur 36 mois avec un cliff de 12 mois',
      html: `<p>Les droits au titre du mécanisme leaver s'acquièrent selon le calendrier suivant :</p><ul><li><strong>Cliff :</strong> aucun droit acquis pendant les <mark class="cond-val">12</mark> premiers mois suivant le Closing ;</li><li><strong>Post-cliff :</strong> acquisition linéaire de <mark class="cond-val">1/36</mark> par mois pendant les <mark class="cond-val">24</mark> mois suivants (vesting total : <mark class="cond-val">36 mois</mark>) ;</li><li><strong>Accélération (<em>double trigger</em>) :</strong> en cas de cession totale de la Société, les droits restants s'acquièrent instantanément.</li></ul>`,
    },
    {
      id: 'lea_bad', type: 'leaver',
      label: 'Bad leaver — Rachat au prix nominal',
      preview: 'Si départ pour faute grave : rachat à 0,01 € (valeur nominale)',
      html: `<p>Est qualifié de « <strong>Bad Leaver</strong> » tout Fondateur dont le départ résulte : (i) d'une révocation pour faute grave ou lourde ; (ii) d'une démission sans accord préalable de l'Investisseur Majoritaire ; (iii) d'une violation grave du pacte constatée judiciairement.</p><p>En cas de qualification Bad Leaver, l'Investisseur Majoritaire dispose d'un droit de rachat irrévocable sur <mark class="cond-val">100 %</mark> des actions du Fondateur concerné, au prix de <mark class="cond-val">0,01 €</mark> par action (valeur nominale), exercé dans les <mark class="cond-val">90 jours</mark> suivant la notification. Le Fondateur consent dès à présent un mandat irrévocable à l'Investisseur Majoritaire pour signer tout acte nécessaire.</p>`,
    },
    {
      id: 'lea_good', type: 'leaver',
      label: 'Good leaver — Rachat à valeur de marché',
      preview: 'Si départ pour bonne cause : rachat à valeur de marché (art. 1843-4)',
      html: `<p>Est qualifié de « <strong>Good Leaver</strong> » tout Fondateur dont le départ résulte : (i) d'un décès ou d'une incapacité permanente (IPP ≥ <mark class="cond-val">66 %</mark>) ; (ii) d'une révocation sans cause légitime ; (iii) d'un accord mutuel consenti par l'Investisseur Majoritaire.</p><p>En cas de Good Leaver, l'Investisseur dispose d'une option d'achat sur les actions acquises au titre du vesting, à la <strong>valeur de marché</strong> déterminée, à défaut d'accord, par un expert (art. 1843-4 C. civ.), dont les honoraires sont partagés entre le Fondateur et la Société.</p>`,
    },
  ],

  noncompete: [
    {
      id: 'nc_renonciation', type: 'exception',
      label: 'Faculté de renonciation par la Société',
      preview: 'La Société peut lever la non-concurrence et cesser de verser la contrepartie',
      html: `<p>La Société peut, au moment du départ du Fondateur ou dans un délai de <mark class="cond-val">15 jours</mark> suivant celui-ci, renoncer par écrit au bénéfice de la non-concurrence. Cette renonciation libère le Fondateur de son obligation et dispense la Société du versement de la contrepartie financière à compter de la notification.</p>`,
    },
    {
      id: 'nc_24m_fr', type: 'duree',
      label: 'Non-concurrence — 24 mois, France + UE',
      preview: 'Interdiction d\'activité concurrente pendant 24 mois avec contrepartie financière',
      html: `<p>Pendant <mark class="cond-val">24 mois</mark> à compter de la cessation de leurs fonctions, les Fondateurs s'interdisent d'exercer, directement ou indirectement, toute activité concurrente à celle de la Société dans le secteur de <mark class="cond-val">[logiciels de pilotage financier pour PME]</mark>, sur le territoire de <mark class="cond-val">France métropolitaine et de l'Union européenne</mark>.</p><p>En contrepartie, la Société versera une indemnité mensuelle égale à <mark class="cond-val">30 %</mark> de la dernière rémunération mensuelle brute pendant toute la durée de la clause. Toute violation expose le Fondateur à une astreinte de <mark class="cond-val">5 000 €</mark> par infraction constatée.</p>`,
    },
  ],

  lockup: [
    {
      id: 'lock_levee_controle', type: 'exception',
      label: 'Levée anticipée en cas de cession de contrôle',
      preview: 'Le lock-up tombe si une cession de contrôle approuvée intervient',
      html: `<p>Par exception, la Période de Lock-up prend fin par anticipation en cas de cession du contrôle de la Société approuvée par l'Investisseur Majoritaire, ou de mise en œuvre régulière du droit d'entraînement (<em>drag-along</em>). Dans ces cas, les Fondateurs sont libérés de l'inaliénabilité à hauteur des titres concernés par l'opération.</p>`,
    },
    {
      id: 'lock_36m', type: 'duree',
      label: 'Lock-up — 36 mois avec exceptions',
      preview: 'Interdiction de cession des titres des Fondateurs pendant 36 mois',
      html: `<p>Pendant <mark class="cond-val">36 mois</mark> à compter du Closing (la « <strong>Période de Lock-up</strong> »), les Fondateurs s'interdisent de céder, transférer, nantir ou affecter leurs titres sans accord préalable écrit de l'Investisseur Majoritaire.</p><p>Exceptions autorisées sans accord : (i) apports à une holding personnelle détenue à plus de <mark class="cond-val">90 %</mark> par le Fondateur, sous réserve que la holding adhère au pacte ; (ii) cessions à titre gratuit aux membres de la famille directe, dans la limite de <mark class="cond-val">10 %</mark> du capital total ; (iii) cessions dans le cadre d'un drag-along régulièrement exercé.</p>`,
    },
  ],

  garanties: [
    {
      id: 'war_procedure', type: 'exception',
      label: 'Mise en jeu — procédure et séquestre',
      preview: 'Réclamation contradictoire, délai de réponse et garantie par séquestre',
      html: `<p>Toute réclamation au titre de la garantie est notifiée par écrit dans les <mark class="cond-val">30 jours</mark> de la connaissance du fait générateur, avec pièces justificatives. Les Fondateurs disposent de <mark class="cond-val">30 jours</mark> pour contester. Le règlement des sommes dues est garanti par la consignation sur un compte séquestre de <mark class="cond-val">10 %</mark> du montant de l'investissement pendant <mark class="cond-val">18 mois</mark>.</p>`,
    },
    {
      id: 'war_standard', type: 'duree',
      label: 'GAP — 18 mois, plafond 100 %, franchise 1 %',
      preview: 'Garantie d\'actif et de passif : plafond 1 M€, 18 mois, franchise 1 %',
      html: `<p>Les Fondateurs consentent une garantie d'actif et de passif (« <strong>GAP</strong> ») aux conditions suivantes :</p><ul><li><strong>Durée :</strong> <mark class="cond-val">18 mois</mark> à compter du Closing pour les garanties de droit commun ; jusqu'à la prescription fiscale applicable (<mark class="cond-val">3 ans</mark>) pour les garanties fiscales et sociales ;</li><li><strong>Plafond global :</strong> <mark class="cond-val">100 %</mark> de l'investissement (soit <mark class="cond-val">1 000 000 €</mark>) ;</li><li><strong>Franchise :</strong> <mark class="cond-val">1 %</mark> par sinistre, franchise globale <mark class="cond-val">2 %</mark> ;</li><li><strong>Responsabilité :</strong> conjointe et non solidaire, au prorata des participations respectives au Closing.</li></ul>`,
    },
  ],

  drag: [
    {
      id: 'sort_drag', type: 'seuil',
      label: 'Drag-along — seuil de prix et de capital',
      preview: 'Droit d\'entraînement si offre ≥ 3× le prix de souscription',
      html: `<p>Le droit d'entraînement (<em>drag-along</em>) ne pourra être exercé que si : (i) l'offre ferme porte sur <mark class="cond-val">100 %</mark> du capital ; (ii) le prix par action est au moins égal à <mark class="cond-val">3</mark> fois le Prix de Souscription (soit <mark class="cond-val">180 €</mark>) ; (iii) les associés initiateurs détiennent au moins <mark class="cond-val">60 %</mark> du capital <em>fully diluted</em>. La notification est adressée au moins <mark class="cond-val">30 jours</mark> avant la réalisation, et les Fondateurs bénéficient des mêmes garanties (plafond, durée) que celles consenties par les Investisseurs.</p>`,
    },
    {
      id: 'drag_floor_fondateur', type: 'seuil',
      label: 'Plancher de prix protecteur',
      preview: 'Le drag ne joue pas si le prix est inférieur à un plancher',
      html: `<p>Par exception, le droit d'entraînement ne pourra contraindre les Fondateurs à céder leurs titres si le prix par action proposé est inférieur à <mark class="cond-val">2</mark> fois le Prix de Souscription. En outre, la responsabilité de chaque Fondateur au titre des garanties données à l'acquéreur sera <strong>limitée au prix effectivement perçu</strong> et plafonnée à <mark class="cond-val">100 %</mark> de ce prix.</p>`,
    },
  ],

  fulltag: [
    {
      id: 'fulltag_controle', type: 'seuil',
      label: 'Cas de cession de contrôle — co-sortie à 100 %',
      preview: 'Si la cession fait perdre le contrôle, les Fondateurs peuvent tout céder',
      html: `<p>Lorsque la cession envisagée par les Investisseurs a pour effet de transférer le contrôle de la Société (plus de <mark class="cond-val">50 %</mark> du capital ou des droits de vote) à un tiers, les Fondateurs peuvent exiger le rachat de <mark class="cond-val">100 %</mark> de leurs titres aux mêmes conditions, l'acquéreur ne pouvant réaliser l'opération qu'à cette condition.</p>`,
    },
    {
      id: 'sort_tag', type: 'exception',
      label: 'Tag-along — Co-sortie totale',
      preview: 'Si les Investisseurs vendent, les Fondateurs peuvent céder aux mêmes conditions',
      html: `<p>En cas de cession par les Investisseurs de leurs titres à un tiers, les Fondateurs bénéficient d'un droit de co-sortie totale (<em>full tag-along</em>) leur permettant de céder l'intégralité de leurs titres aux mêmes prix et conditions, par priorité sur les titres du cédant. Ce droit est exercé dans les <mark class="cond-val">15 jours</mark> suivant la notification ; à défaut, les Fondateurs y renoncent pour l'opération concernée.</p>`,
    },
  ],

  proptag: [
    {
      id: 'proptag_reduction', type: 'seuil',
      label: 'Cas d\'offre plafonnée — réduction proportionnelle',
      preview: 'Si l\'acquéreur limite le volume, réduction au marc le franc',
      html: `<p>Si le nombre de titres que l'acquéreur accepte d'acheter est inférieur au total des titres offerts (titres du cédant + titres des Fondateurs exerçant le tag-along), le nombre de titres acquis auprès de chaque vendeur est réduit proportionnellement à sa participation (au marc le franc), de sorte que chacun cède la même quote-part.</p>`,
    },
    {
      id: 'proptag_prorata', type: 'exception',
      label: 'Tag-along proportionnel',
      preview: 'Co-sortie au prorata de la participation des Fondateurs',
      html: `<p>En cas de cession partielle par les Investisseurs, les Fondateurs peuvent céder une quote-part de leurs titres égale à la proportion que représente la cession dans la participation du cédant (<em>proportional tag-along</em>), aux mêmes prix et conditions, dans un délai de <mark class="cond-val">15 jours</mark> suivant la notification.</p>`,
    },
  ],

  preemption: [
    {
      id: 'sort_preemption', type: 'exception',
      label: 'Droit de préemption — 30 jours',
      preview: 'Priorité de rachat des titres cédés dans les 30 jours',
      html: `<p>En cas de projet de cession à un tiers, le cédant informe par écrit les autres associés, qui disposent d'un délai de <mark class="cond-val">30 jours</mark> pour exercer leur droit de préemption aux conditions notifiées, au prorata de leur participation, avec droit de sursouscription en cas de renonciation. À défaut d'exercice dans le délai, le cédant peut réaliser la cession aux conditions notifiées, dans un délai de <mark class="cond-val">90 jours</mark>.</p>`,
    },
    {
      id: 'preempt_exc_famille', type: 'exception',
      label: 'Exception — transmissions familiales',
      preview: 'La préemption ne joue pas pour les transmissions à la famille proche',
      html: `<p>Le droit de préemption ne s'applique pas aux transmissions à titre gratuit au profit de la famille directe d'un Fondateur (conjoint, descendants, ascendants), sous réserve de l'adhésion du bénéficiaire au pacte, ni aux apports à une holding personnelle contrôlée à plus de <mark class="cond-val">95 %</mark> par le cédant.</p>`,
    },
  ],

  reporting: [
    {
      id: 'info_trim', type: 'milestone',
      label: 'Reporting trimestriel complet',
      preview: 'Comptes de gestion et KPI communiqués dans les 30 jours après chaque trimestre',
      html: `<p>La Société s'engage à communiquer aux Investisseurs, dans les <mark class="cond-val">30 jours</mark> suivant la clôture de chaque trimestre : (i) les comptes de gestion du trimestre (bilan, résultat, flux de trésorerie) ; (ii) l'état et prévisions de trésorerie sur <mark class="cond-val">12 mois</mark> ; (iii) le tableau de bord des KPI (MRR, ARR, churn, CAC) ; (iv) un rapport narratif de <mark class="cond-val">2 pages</mark> maximum sur les faits marquants et risques. Les comptes annuels audités sont communiqués dans les <mark class="cond-val">120 jours</mark> suivant la clôture de l'exercice.</p>`,
    },
    {
      id: 'aud_annuel', type: 'exception',
      label: 'Droit d\'audit — 1 fois par an',
      preview: 'Les Investisseurs peuvent mandater un cabinet d\'audit une fois par exercice',
      html: `<p>Les Investisseurs disposent du droit de faire réaliser, à leurs frais, un audit des comptes et de la gestion de la Société par un cabinet de leur choix, <mark class="cond-val">une fois par exercice fiscal</mark>, moyennant un préavis de <mark class="cond-val">10 jours</mark> ouvrés. La Société s'engage à coopérer. En cas de constat de fraude ou de manquement significatif, les frais d'audit sont supportés par la Société.</p>`,
    },
  ],

  implication: [
    {
      id: 'impl_incapacite', type: 'exception',
      label: 'Cas d\'incapacité temporaire',
      preview: 'Suspension de l\'engagement d\'implication en cas d\'arrêt médical',
      html: `<p>Par exception, l'engagement d'implication est suspendu, sans être qualifié de manquement, en cas d'incapacité temporaire médicalement constatée d'un Fondateur, pour une durée maximale de <mark class="cond-val">6 mois</mark> cumulés sur <mark class="cond-val">12 mois</mark> glissants. Au-delà, l'incapacité prolongée pourra être qualifiée de cause de départ « Good Leaver ».</p>`,
    },
    {
      id: 'impl_tps_plein', type: 'cs',
      label: 'Implication — Temps plein 5 j/semaine',
      preview: 'Les Fondateurs s\'engagent à consacrer 100 % de leur temps à la Société',
      html: `<p>Pendant leur participation au capital, les Fondateurs s'engagent à : (i) consacrer la totalité de leur temps professionnel (minimum <mark class="cond-val">5 jours</mark> ouvrés par semaine) aux activités de la Société ; (ii) ne pas exercer d'activité rémunérée en dehors de la Société, sauf activités d'enseignement n'excédant pas <mark class="cond-val">8 jours</mark> par an et préalablement approuvées par l'Investisseur Majoritaire.</p>`,
    },
  ],

  decisions: [
    {
      id: 'mr_liste', type: 'cs',
      label: 'Matières réservées — Liste exhaustive',
      preview: 'Liste des décisions soumises à accord préalable des Investisseurs',
      html: `<p>Les décisions suivantes sont soumises à l'accord préalable écrit de l'Investisseur Majoritaire :</p><ol><li>toute modification des statuts de la Société ;</li><li>toute augmentation ou réduction de capital, ainsi que l'émission de tout titre donnant accès au capital (BSPCE, BSA, OCA, OCABSA) au-delà d'un pool de <mark class="cond-val">10 %</mark> du capital <em>fully diluted</em> ;</li><li>toute opération de fusion, scission, apport partiel d'actifs ou dissolution de la Société ;</li><li>tout engagement hors budget annuel approuvé d'un montant supérieur à <mark class="cond-val">50 000 €</mark> par opération ou <mark class="cond-val">100 000 €</mark> cumulés sur l'exercice ;</li><li>toute cession d'actifs essentiels (PI, marques, droits) ou de fonds de commerce ;</li><li>tout recrutement ou licenciement d'un membre du Comité de Direction ;</li><li>tout changement significatif d'objet social ou de modèle d'affaires.</li></ol>`,
    },
    {
      id: 'dec_delai_refus', type: 'duree',
      label: 'Délai de réponse — 15 jours',
      preview: 'L\'absence de réponse sous 15 jours vaut refus',
      html: `<p>L'Investisseur Majoritaire dispose d'un délai de <mark class="cond-val">15 jours</mark> ouvrés à compter de la saisine pour se prononcer sur une matière réservée. L'absence de réponse dans ce délai vaut <strong>refus</strong>. Toute décision prise en violation de la présente clause est inopposable aux Investisseurs et engage la responsabilité de son auteur.</p>`,
    },
  ],

  societe: [
    {
      id: 'soc_cap_libere', type: 'cs',
      label: 'CS — Capital intégralement libéré',
      preview: 'Capital libéré, Kbis récent et statuts à jour au Closing',
      html: `<p>La réalisation est subordonnée à ce que le capital social soit intégralement souscrit et libéré, et à la remise, à la date du Closing, d'un extrait Kbis de moins de <mark class="cond-val">8 jours</mark>, de statuts à jour et d'une attestation de non-faillite.</p>`,
    },
    {
      id: 'soc_actifs', type: 'cs',
      label: 'CS — Détention des actifs essentiels',
      preview: 'La Société détient ses actifs clés, libres de tout gage',
      html: `<p>La Société garantit détenir, libres de tout nantissement ou sûreté, l'ensemble des actifs nécessaires à son activité (droits de propriété intellectuelle, noms de domaine, licences). À défaut de régularisation dans les <mark class="cond-val">30 jours</mark>, les Investisseurs pourront renoncer à l'opération.</p>`,
    },
  ],

  fondateurs: [
    {
      id: 'fond_presence', type: 'cs',
      label: 'CS — Présence des Fondateurs au Closing',
      preview: 'Les Fondateurs sont en fonction et non démissionnaires',
      html: `<p>La réalisation est conditionnée à ce que chacun des Fondateurs soit, à la date du Closing, en fonction au sein de la Société, non démissionnaire et non frappé d'une incapacité. Le départ d'un Fondateur avant le Closing autorise les Investisseurs à renoncer à l'opération.</p>`,
    },
    {
      id: 'fond_mandats', type: 'cs',
      label: 'CS — Mandats sociaux confirmés',
      preview: 'Nomination/maintien des Fondateurs dans leurs mandats',
      html: `<p>Le maintien ou la nomination des Fondateurs dans leurs mandats sociaux respectifs (Président, Directeur Général), pour une durée d'au moins <mark class="cond-val">4 ans</mark>, constitue une condition de la réalisation de l'opération.</p>`,
    },
  ],

  investisseur: [
    {
      id: 'inv_prorata', type: 'exception',
      label: 'Droit de participation aux tours futurs (pro rata)',
      preview: 'L\'Investisseur peut maintenir son pourcentage lors des futures levées',
      html: `<p>Lors de toute émission future de titres, l'Investisseur dispose d'un droit de souscription préférentielle lui permettant de maintenir son pourcentage de détention, exerçable dans un délai de <mark class="cond-val">15 jours</mark> à compter de la notification du projet d'émission. Ce droit ne s'applique pas aux titres émis dans le cadre du pool d'intéressement, dans la limite de <mark class="cond-val">10 %</mark> du capital.</p>`,
    },
    {
      id: 'inv_averti', type: 'exception',
      label: 'Qualité d\'investisseur averti',
      preview: 'L\'Investisseur reconnaît agir en investisseur averti',
      html: `<p>L'Investisseur déclare disposer de la compétence et de l'expérience nécessaires pour apprécier les risques de l'investissement et reconnaît agir en qualité d'investisseur averti, sans que cette qualité ne réduise les déclarations et garanties consenties par la Société et les Fondateurs.</p>`,
    },
  ],

  titre: [
    {
      id: 'titre_conversion', type: 'exception',
      label: 'Conversion automatique en cas d\'IPO',
      preview: 'Les Actions A se convertissent en ordinaires à l\'introduction en bourse',
      html: `<p>Les Actions A seront automatiquement converties en actions ordinaires, à raison de <mark class="cond-val">1 pour 1</mark>, en cas d'introduction en bourse, ou sur décision des titulaires d'au moins <mark class="cond-val">66 %</mark> des Actions A.</p>`,
    },
    {
      id: 'titre_rang', type: 'cs',
      label: 'Rang de priorité des Actions A',
      preview: 'Les Actions A priment toute catégorie créée ultérieurement',
      html: `<p>Les Actions A bénéficient d'un rang au moins égal à toute catégorie d'actions de préférence créée ultérieurement. Toute émission d'une catégorie de rang supérieur est soumise à l'accord des titulaires d'Actions A statuant à la majorité des <mark class="cond-val">2/3</mark>.</p>`,
    },
  ],

  antidilution: [
    {
      id: 'ad_weighted', type: 'ratchet',
      label: 'Anti-dilution weighted average',
      preview: 'Ajustement broad-based weighted average en cas de down round',
      html: `<p>En cas d'émission à un prix inférieur au Prix de Souscription, le prix de conversion des Actions A est ajusté selon la méthode <em>broad-based weighted average</em>, la dilution compensée étant plafonnée à <mark class="cond-val">25 %</mark> du capital post-opération.</p>`,
    },
    {
      id: 'ad_exclusions', type: 'exception',
      label: 'Exclusions d\'anti-dilution',
      preview: 'Pool d\'options et conversions en cours exclus',
      html: `<p>Ne déclenchent pas l'ajustement anti-dilution : l'attribution de titres dans la limite du pool d'intéressement (<mark class="cond-val">10 %</mark> du capital), les conversions d'instruments existants, et les émissions approuvées par les titulaires d'Actions A.</p>`,
    },
  ],

  libres: [
    {
      id: 'libres_inopposable', type: 'cs',
      label: 'Sanction — transfert non notifié inopposable',
      preview: 'Tout transfert réalisé sans notification préalable est nul et inopposable',
      html: `<p>Tout transfert réalisé en violation des stipulations de la présente clause (absence de notification préalable, défaut d'adhésion du cessionnaire au pacte) est nul et inopposable à la Société et aux autres associés. La Société refusera l'inscription en compte du cessionnaire et toute distribution à son profit pendant un délai de <mark class="cond-val">30 jours</mark> de régularisation.</p>`,
    },
    {
      id: 'libres_intragroupe', type: 'exception',
      label: 'Transferts intragroupe autorisés',
      preview: 'Transfert libre vers une entité contrôlée, avec adhésion au pacte',
      html: `<p>Sont libres les transferts au profit d'une entité contrôlée à plus de <mark class="cond-val">95 %</mark> par l'associé cédant, sous réserve (i) de l'adhésion préalable du cessionnaire au pacte et (ii) de la rétrocession des titres en cas de rupture du lien de contrôle dans les <mark class="cond-val">30 jours</mark>.</p>`,
    },
  ],

  board: [
    {
      id: 'board_quorum', type: 'cs',
      label: 'Quorum — présence d\'un Investisseur',
      preview: 'Quorum atteint seulement avec un représentant Investisseur',
      html: `<p>Le Comité ne délibère valablement que si la moitié au moins de ses membres sont présents ou représentés, dont au moins un représentant des Investisseurs. À défaut de quorum, le Comité est reconvoqué sous <mark class="cond-val">8 jours</mark> et délibère alors valablement sans condition de présence.</p>`,
    },
    {
      id: 'board_freq', type: 'duree',
      label: 'Réunions trimestrielles minimum',
      preview: 'Le Comité se réunit au moins une fois par trimestre',
      html: `<p>Le Comité se réunit au moins <mark class="cond-val">une fois par trimestre</mark>, sur convocation adressée <mark class="cond-val">5 jours</mark> à l'avance avec ordre du jour et documents utiles ; il peut se tenir par visioconférence.</p>`,
    },
  ],

  pi: [
    {
      id: 'pi_cession_cs', type: 'cs',
      label: 'CS — Cession effective de la PI',
      preview: 'Tous les contributeurs ont cédé leurs droits à la Société',
      html: `<p>La réalisation est subordonnée à la remise des actes de cession des droits de propriété intellectuelle (code, marques, designs) au profit de la Société, signés par l'ensemble des fondateurs, salariés et prestataires ayant contribué, libres de toute revendication de tiers.</p>`,
    },
    {
      id: 'pi_garantie', type: 'exception',
      label: 'Garantie de titularité et non-contrefaçon',
      preview: 'La Société garantit la propriété et l\'absence de contrefaçon',
      html: `<p>Les Fondateurs garantissent que la Société est seule titulaire des droits de propriété intellectuelle exploités et que ceux-ci ne contrefont aucun droit de tiers, pour une durée de <mark class="cond-val">24 mois</mark> et dans la limite de <mark class="cond-val">100 %</mark> de l'investissement.</p>`,
    },
  ],

  realisation: [
    {
      id: 'real_defaut', type: 'cr',
      label: 'Défaut de Closing — restitution des fonds',
      preview: 'Si le Closing échoue, les fonds versés sont restitués',
      html: `<p>Si le Closing n'intervient pas à la date convenue du fait de la non-levée d'une condition, les fonds éventuellement versés ou consignés sont intégralement restitués aux Investisseurs dans un délai de <mark class="cond-val">5 jours</mark> ouvrés, sans intérêt ni indemnité, et les décisions sociales prises en vue de l'opération sont réputées caduques.</p>`,
    },
    {
      id: 'real_concomitance', type: 'cs',
      label: 'Concomitance des opérations',
      preview: 'Les opérations de Closing sont interdépendantes',
      html: `<p>Les opérations du Closing (levée des conditions, décisions sociales, signature du pacte et des promesses, versement des fonds) sont interdépendantes et réputées concomitantes : à défaut de réalisation de l'une d'elles au plus tard le <mark class="cond-val">[date]</mark>, aucune ne sera réputée intervenue.</p>`,
    },
  ],

  conditions: [
    {
      id: 'cond_longstop', type: 'duree',
      label: 'Date butoir (long stop date)',
      preview: 'Caducité si les conditions ne sont pas levées à la date butoir',
      html: `<p>L'ensemble des conditions suspensives devront être levées au plus tard le <mark class="cond-val">[date butoir]</mark> (<em>long stop date</em>). À défaut, et sauf prorogation écrite, chaque partie pourra renoncer à l'opération sans indemnité, sous réserve des stipulations contraignantes.</p>`,
    },
    {
      id: 'cond_renonciation', type: 'exception',
      label: 'Renonciation par les Investisseurs',
      preview: 'Les conditions posées dans leur intérêt peuvent être levées par eux',
      html: `<p>Les conditions suspensives stipulées dans le seul intérêt des Investisseurs pourront faire l'objet d'une renonciation unilatérale de leur part, par notification écrite, sans que cela n'affecte les autres conditions.</p>`,
    },
  ],

  exclusivite: [
    {
      id: 'excl_noshop', type: 'duree',
      label: 'No-shop — 60 jours',
      preview: 'Aucune sollicitation d\'un autre investisseur pendant 60 jours',
      html: `<p>Pendant une durée de <mark class="cond-val">60 jours</mark> à compter de la signature des présentes, la Société et les Fondateurs s'interdisent de solliciter, négocier ou conclure avec tout tiers une opération concurrente de financement ou de cession.</p>`,
    },
    {
      id: 'excl_breakfee', type: 'seuil',
      label: 'Indemnité de rupture (break fee)',
      preview: 'Remboursement des frais en cas de violation de l\'exclusivité',
      html: `<p>En cas de violation de l'exclusivité, la Société remboursera aux Investisseurs leurs frais raisonnables et documentés (due diligence, conseils), dans la limite de <mark class="cond-val">30 000 €</mark>.</p>`,
    },
  ],

  confidentialite: [
    {
      id: 'conf_restitution', type: 'cr',
      label: 'Sort des informations en fin de négociation',
      preview: 'Restitution ou destruction des données si l\'opération échoue',
      html: `<p>En cas de cessation des discussions sans réalisation de l'opération, chaque partie restitue ou détruit, dans un délai de <mark class="cond-val">15 jours</mark> sur simple demande, l'ensemble des informations confidentielles reçues et leurs copies, et certifie par écrit cette destruction, sous réserve des conservations imposées par la loi.</p>`,
    },
    {
      id: 'conf_duree', type: 'duree',
      label: 'Confidentialité — 3 ans',
      preview: 'Obligation de confidentialité pendant 3 ans',
      html: `<p>Les parties s'engagent à préserver la confidentialité des informations échangées pendant une durée de <mark class="cond-val">3 ans</mark> à compter des présentes, sauf obligation légale, réglementaire ou judiciaire de divulgation, et sous réserve des informations tombées dans le domaine public.</p>`,
    },
  ],

  frais: [
    {
      id: 'frais_non_realisation', type: 'exception',
      label: 'Cas de non-réalisation imputable à la Société',
      preview: 'La Société rembourse les frais si elle rompt fautivement',
      html: `<p>Si l'opération ne se réalise pas du fait d'un manquement de la Société ou des Fondateurs (rupture fautive, violation de l'exclusivité, informations erronées), la Société remboursera aux Investisseurs leurs frais raisonnables et justifiés, dans la limite de <mark class="cond-val">30 000 €</mark>. Dans les autres cas de non-réalisation, chaque partie conserve ses propres frais.</p>`,
    },
    {
      id: 'frais_plafond', type: 'seuil',
      label: 'Frais Investisseurs plafonnés',
      preview: 'Prise en charge des frais des Investisseurs jusqu\'à un plafond',
      html: `<p>Sous réserve de la réalisation de l'opération, la Société prend en charge les frais raisonnables et justifiés des Investisseurs (conseils juridiques, due diligence) dans la limite de <mark class="cond-val">25 000 €</mark> HT. En l'absence de réalisation, chaque partie conserve ses propres frais.</p>`,
    },
  ],

  duree: [
    {
      id: 'duree_prorogation', type: 'exception',
      label: 'Prorogation si due diligence en cours',
      preview: 'Le délai est prorogé automatiquement si l\'audit est encore en cours',
      html: `<p>Par exception, si la due diligence est encore en cours à la date d'expiration, la durée de validité est prorogée de plein droit de <mark class="cond-val">15 jours</mark> supplémentaires, une seule fois, afin de permettre l'achèvement des vérifications, sans que cela ne réouvre la négociation des termes économiques.</p>`,
    },
    {
      id: 'duree_validite', type: 'duree',
      label: 'Validité de la lettre — 30 jours',
      preview: 'La lettre d\'intention expire si non signée sous 30 jours',
      html: `<p>La présente lettre d'intention est valable jusqu'au <mark class="cond-val">[date]</mark>, soit <mark class="cond-val">30 jours</mark> à compter de son émission. Passé ce délai, elle deviendra caduque de plein droit, sauf prorogation écrite des parties.</p>`,
    },
  ],

  nonbinding: [
    {
      id: 'nb_pas_engagement', type: 'cr',
      label: 'Absence d\'engagement implicite',
      preview: 'Aucun accord verbal ou comportement ne vaut engagement de réaliser',
      html: `<p>Aucun échange, accord verbal, projet de document ou début d'exécution ne saurait être interprété comme un engagement ferme de réaliser l'opération. Seule la signature des actes définitifs (pacte, bulletins de souscription) engage les parties à investir, chacune restant libre de se retirer jusque-là sans indemnité, sous réserve des clauses contraignantes.</p>`,
    },
    {
      id: 'nb_contraignantes', type: 'exception',
      label: 'Clauses contraignantes maintenues',
      preview: 'Confidentialité, exclusivité, frais et droit restent contraignants',
      html: `<p>Par exception au caractère non contraignant des présentes, les stipulations relatives à la confidentialité, à l'exclusivité, aux frais et au droit applicable revêtent une force obligatoire et engagent les parties dès la signature.</p>`,
    },
  ],

  droit: [
    {
      id: 'droit_juridiction', type: 'exception',
      label: 'Droit français — Tribunal de Paris',
      preview: 'Droit français et compétence du Tribunal de commerce de Paris',
      html: `<p>Les présentes sont régies par le droit français. Tout différend relatif à leur validité, interprétation ou exécution sera soumis à la compétence exclusive du <mark class="cond-val">Tribunal de commerce de Paris</mark>, nonobstant pluralité de défendeurs ou appel en garantie.</p>`,
    },
    {
      id: 'droit_arbitrage', type: 'exception',
      label: 'Arbitrage CCI (option)',
      preview: 'Différends tranchés par arbitrage CCI à Paris',
      html: `<p>Tout différend sera tranché définitivement suivant le règlement d'arbitrage de la <mark class="cond-val">Chambre de Commerce Internationale (CCI)</mark> par <mark class="cond-val">un (1)</mark> arbitre, siège à <mark class="cond-val">Paris</mark>, langue française.</p>`,
    },
  ],

  observer: [
    {
      id: 'obs_conflit', type: 'exception',
      label: 'Exclusion ponctuelle pour conflit d\'intérêts',
      preview: 'Le censeur est écarté des points où l\'Investisseur est en conflit',
      html: `<p>Le censeur peut être écarté, sur décision du président de séance, des délibérations portant sur un sujet où l'Investisseur qu'il représente se trouve en situation de conflit d'intérêts (notamment investissement concurrent), ainsi que de la communication des informations strictement liées à ce point. Cette exclusion est mentionnée au procès-verbal.</p>`,
    },
    {
      id: 'obs_censeur', type: 'exception',
      label: 'Censeur — voix consultative',
      preview: 'L\'Investisseur nomme un censeur, sans droit de vote',
      html: `<p>L'Investisseur Majoritaire peut désigner un censeur assistant aux réunions du Comité avec voix consultative. Le censeur reçoit la même information que les membres, est tenu à la confidentialité, et son mandat prend fin lorsque l'Investisseur détient moins de <mark class="cond-val">5 %</mark> du capital.</p>`,
    },
  ],

  liquidite: [
    {
      id: 'liq_blocage_expert', type: 'exception',
      label: 'Cas de blocage — recours à un expert',
      preview: 'Si la valeur est contestée, fixation par un expert indépendant',
      html: `<p>En cas de désaccord sur la valeur ou les modalités de la liquidité, celle-ci est déterminée par un expert indépendant désigné d'un commun accord ou, à défaut, par le président du tribunal de commerce (art. 1843-4 C. civ.), dans un délai de <mark class="cond-val">45 jours</mark>. La décision de l'expert lie les parties, ses honoraires étant supportés par moitié.</p>`,
    },
    {
      id: 'liq_mandat_vente', type: 'duree',
      label: 'Mandat de vente à 5 ans',
      preview: 'À défaut de sortie sous 5 ans, mandat de cession de la Société',
      html: `<p>À défaut de liquidité (cession ou introduction en bourse) dans un délai de <mark class="cond-val">5 ans</mark> à compter du Closing, les Investisseurs pourront demander la mise en œuvre d'un processus de cession, la Société et les Fondateurs s'engageant à confier un mandat à une banque d'affaires de premier rang.</p>`,
    },
  ],

  rachat: [
    {
      id: 'rachat_insuffisance', type: 'exception',
      label: 'Insuffisance de fonds — échelonnement',
      preview: 'Si la Société ne peut payer, échelonnement avec intérêts',
      html: `<p>Si, à la date d'exercice du rachat, la Société ne dispose pas des sommes distribuables suffisantes, le paiement est reporté ou échelonné sur une durée maximale de <mark class="cond-val">24 mois</mark>, le solde dû portant intérêt au taux de <mark class="cond-val">5 %</mark> l'an. Le rachat ne peut en aucun cas compromettre la continuité d'exploitation ni les capitaux propres en deçà du minimum légal.</p>`,
    },
    {
      id: 'rachat_redemption', type: 'seuil',
      label: 'Rachat à l\'issue de la 6e année',
      preview: 'Rachat des Actions A au plus élevé du prix et de la valeur de marché',
      html: `<p>À l'issue de la <mark class="cond-val">6e</mark> année, les Investisseurs pourront demander le rachat de leurs Actions A à un prix égal au plus élevé du Prix de Souscription et de la Valeur de Marché. Le rachat s'effectue dans la limite des sommes distribuables ; à défaut, il est échelonné sur <mark class="cond-val">24 mois</mark> sans compromettre la continuité d'exploitation.</p>`,
    },
  ],

  paytoplay: [
    {
      id: 'p2p_tour_non_qualifie', type: 'exception',
      label: 'Cas du tour non qualifié — maintien des droits',
      preview: 'La sanction ne joue pas pour les petites émissions techniques',
      html: `<p>La sanction de conversion ne s'applique pas aux émissions non qualifiées : tours d'un montant inférieur à <mark class="cond-val">1 000 000 €</mark>, émissions au titre du pool d'intéressement, émissions réservées à des partenaires stratégiques, ou tours intervenant à une valorisation supérieure au dernier tour. Dans ces cas, l'Investisseur conserve l'ensemble de ses droits préférentiels.</p>`,
    },
    {
      id: 'p2p_sanction', type: 'exception',
      label: 'Conversion en cas de non-participation',
      preview: 'L\'Investisseur non-participant perd ses préférences',
      html: `<p>L'Investisseur ne participant pas, à hauteur de son pro rata, à un tour de financement qualifié (≥ <mark class="cond-val">1 000 000 €</mark>) verra ses Actions A converties en actions ordinaires, perdant les droits de liquidation préférentielle, d'anti-dilution et de gouvernance attachés.</p>`,
    },
  ],

  mfn: [
    {
      id: 'mfn_exclusions', type: 'exception',
      label: 'Exclusions du MFN',
      preview: 'Les droits intuitu personae du nouvel entrant sont exclus',
      html: `<p>Le bénéfice de la clause de la nation la plus favorisée ne s'étend pas aux droits attachés à la personne du nouvel investisseur (sièges au comité liés à un ticket supérieur, droits négociés intuitu personae), ni aux conditions justifiées par un montant souscrit sensiblement supérieur (au moins <mark class="cond-val">2×</mark> l'investissement actuel).</p>`,
    },
    {
      id: 'mfn_alignement', type: 'exception',
      label: 'Alignement sur conditions plus favorables',
      preview: 'L\'Investisseur peut réclamer toute condition plus favorable accordée ensuite',
      html: `<p>Si la Société confère à un investisseur ultérieur des droits économiques ou politiques plus favorables, l'Investisseur Majoritaire pourra, par notification dans les <mark class="cond-val">30 jours</mark> de l'information, se prévaloir de tout ou partie de ces droits, le pacte étant amendé en conséquence.</p>`,
    },
  ],

  dividprio: [
    {
      id: 'div_report', type: 'exception',
      label: 'Absence de bénéfices — report sans extinction',
      preview: 'Le dividende non versé se cumule et reste dû',
      html: `<p>À défaut de bénéfices distribuables au titre d'un exercice, le dividende prioritaire n'est pas perdu : il est reporté, cumulé et capitalisé au taux de <mark class="cond-val">8 %</mark>, et devient exigible par priorité dès le premier exercice bénéficiaire ou lors de toute distribution, cession ou liquidation ultérieure.</p>`,
    },
    {
      id: 'div_prio_cumul', type: 'seuil',
      label: 'Dividende prioritaire cumulatif 8 %',
      preview: 'Dividende fixe de 8 % par an, cumulatif et capitalisé',
      html: `<p>Les Actions A donnent droit à un dividende prioritaire de <mark class="cond-val">8 %</mark> l'an, cumulatif et capitalisé à défaut de versement, payable par préférence lors de toute distribution. Le cumul non versé s'ajoute au montant dû au titre de la liquidation préférentielle.</p>`,
    },
  ],

  rofo: [
    {
      id: 'rofo_nouvelle_purge', type: 'exception',
      label: 'Modification des conditions — nouvelle purge',
      preview: 'Si le cédant baisse son prix, le droit doit être purgé à nouveau',
      html: `<p>Si le cédant, après avoir purgé le droit de première offre, entend céder à un tiers à un prix inférieur de plus de <mark class="cond-val">10 %</mark> à la meilleure offre reçue des bénéficiaires, ou à des conditions sensiblement plus favorables, il doit purger à nouveau le droit de première offre auprès de ceux-ci avant toute cession.</p>`,
    },
    {
      id: 'rofo_offre', type: 'duree',
      label: 'Droit de première offre — 20 jours',
      preview: 'Le cédant propose d\'abord ses titres aux Investisseurs',
      html: `<p>Avant toute cession à un tiers, l'associé cédant notifie son intention en indiquant le nombre de titres ; les Investisseurs disposent de <mark class="cond-val">20 jours</mark> pour formuler une offre ferme. À défaut d'accord sur le prix, le cédant pourra céder à un tiers à un prix au moins égal à la meilleure offre reçue, dans les <mark class="cond-val">90 jours</mark>.</p>`,
    },
  ],

  nonsollicitation: [
    {
      id: 'nonsoll_exception', type: 'exception',
      label: 'Exception — candidature spontanée',
      preview: 'Un recrutement non sollicité reste autorisé',
      html: `<p>Ne constitue pas une violation de la non-sollicitation l'embauche d'un ancien salarié de la Société répondant à une offre publique non ciblée ou présenté par un cabinet de recrutement n'ayant pas reçu d'instruction visant spécifiquement la Société, dès lors qu'aucune démarche active n'a été entreprise par le Fondateur dans les <mark class="cond-val">12 mois</mark> précédents.</p>`,
    },
    {
      id: 'nonsoll_12m', type: 'duree',
      label: 'Non-sollicitation — 12 mois',
      preview: 'Interdiction de débaucher clients et salariés pendant 12 mois',
      html: `<p>Pendant <mark class="cond-val">12 mois</mark> à compter de la cessation des fonctions, les Fondateurs s'interdisent de solliciter, directement ou indirectement, les clients, prospects actifs et salariés de la Société, sous peine d'une indemnité forfaitaire de <mark class="cond-val">10 000 €</mark> par infraction constatée.</p>`,
    },
  ],

  hommecle: [
    {
      id: 'hc_affectation', type: 'exception',
      label: 'Affectation de l\'indemnité',
      preview: 'L\'indemnité finance le remplacement et la continuité',
      html: `<p>L'indemnité versée au titre de l'assurance homme-clé est affectée par priorité au financement du recrutement et de l'intégration d'un remplaçant, ainsi qu'au maintien de la trésorerie de la Société. Tout emploi différent requiert l'accord préalable de l'Investisseur Majoritaire.</p>`,
    },
    {
      id: 'hc_assurance', type: 'seuil',
      label: 'Assurance homme-clé',
      preview: 'Souscription d\'une assurance sur la tête de chaque Fondateur',
      html: `<p>La Société souscrira, à ses frais et à son bénéfice exclusif, une assurance « homme-clé » sur la tête de chaque Fondateur, pour un capital de <mark class="cond-val">500 000 €</mark>, couvrant les conséquences de son décès ou de son incapacité permanente, dans un délai de <mark class="cond-val">90 jours</mark> suivant le Closing.</p>`,
    },
  ],

  mac: [
    {
      id: 'mac_carveout', type: 'exception',
      label: 'Carve-out — événements généraux exclus',
      preview: 'Les chocs de marché généraux ne constituent pas un MAC',
      html: `<p>Ne constituent pas un changement défavorable significatif les événements affectant l'ensemble de l'économie ou du secteur sans toucher la Société de manière disproportionnée : évolutions macroéconomiques, des marchés financiers, des taux ou des changes, modifications légales ou réglementaires générales, et événements de force majeure (sauf impact spécifiquement aggravé pour la Société de plus de <mark class="cond-val">20 %</mark>).</p>`,
    },
    {
      id: 'mac_def', type: 'cr',
      label: 'Changement défavorable significatif',
      preview: 'Les Investisseurs peuvent se retirer en cas de MAC avant le Closing',
      html: `<p>Constitue un changement défavorable significatif (« <strong>MAC</strong> ») tout événement entraînant une dégradation de plus de <mark class="cond-val">20 %</mark> du chiffre d'affaires ou de l'EBITDA, ou la perte d'un client représentant plus de <mark class="cond-val">15 %</mark> du chiffre d'affaires, à l'exclusion des évolutions générales de marché ou de réglementation. Sa survenance avant le Closing autorise les Investisseurs à ne pas réaliser l'opération.</p>`,
    },
  ],

  mediation: [
    {
      id: 'med_urgence', type: 'exception',
      label: 'Urgence — mesures conservatoires',
      preview: 'On peut saisir le juge en urgence sans médiation préalable',
      html: `<p>Par exception à l'obligation de médiation préalable, chaque partie conserve le droit de saisir à tout moment la juridiction compétente aux fins de mesures conservatoires ou en référé, notamment pour prévenir un dommage imminent ou faire cesser un trouble manifestement illicite, sans que cette saisine ne vaille renonciation à la médiation sur le fond.</p>`,
    },
    {
      id: 'med_prealable', type: 'duree',
      label: 'Médiation préalable — 60 jours',
      preview: 'Tentative de médiation avant toute action judiciaire',
      html: `<p>Préalablement à toute action judiciaire, les parties soumettront leur différend à une médiation conduite par un médiateur désigné d'un commun accord ou, à défaut, par le <mark class="cond-val">Centre de médiation et d'arbitrage de Paris (CMAP)</mark>, pendant une durée maximale de <mark class="cond-val">60 jours</mark>, sauf mesures conservatoires ou urgence justifiée.</p>`,
    },
  ],
};

// ---- Fonctions d\'insertion et de rendu ----

function condTplById(key, id) {
  return (COND_TEMPLATES[key] || []).find(t => t.id === id)
      || (BAKED_COND[key] || []).find(t => t.id === id)
      || null;
}

function insertCondTemplate(key, tplId) {
  const tpl = condTplById(key, tplId);
  if (!tpl) return;
  const content = page.querySelector(`.ts-clause[data-key="${key}"] .ts-content`);
  if (!content) return;
  if (content.querySelector(`[data-tpl="${tplId}"]`)) return; // déjà insérée
  const b = COND_BADGE[tpl.type] || { label: tpl.type, color: '#6b6b78' };
  content.insertAdjacentHTML('beforeend',
    `<div class="clause-cond" data-tpl="${tplId}" data-tpl-key="${key}">`
    + `<div class="clause-cond__head" contenteditable="false">`
    +   `<span class="clause-cond__badge" style="background:${b.color}">${b.label}</span>`
    +   `<span class="clause-cond__tip">Valeurs en jaune modifiables · l'assistant IA peut aussi les ajuster</span>`
    +   `<button class="clause-cond__del" data-del-tpl="${tplId}" data-del-key="${key}" title="Retirer cette condition">✕</button>`
    + `</div>`
    + `<div class="clause-cond__text">${tpl.html}</div>`
    + `</div>`
  );
  countWords();
  paginate(); // recalcule la mise en page pour que la condition ne déborde pas
}

function renderCondTemplates(key) {
  const listEl = document.getElementById('cond-tpl-list');
  if (!listEl) return;
  const allTpls = [...(COND_TEMPLATES[key] || []), ...(BAKED_COND[key] || [])];
  const content = page.querySelector(`.ts-clause[data-key="${key}"] .ts-content`);

  if (!allTpls.length) {
    listEl.innerHTML = '<p class="cond-empty">Aucune condition disponible pour cette clause.</p>';
    return;
  }
  listEl.innerHTML = allTpls.map(tpl => {
    const b = COND_BADGE[tpl.type] || { label: tpl.type, color: '#6b6b78' };
    const added = content ? !!content.querySelector(`[data-tpl="${tpl.id}"]`) : false;
    return `<div class="cond-tpl${added ? ' cond-tpl--added' : ''}">`
      + `<div class="cond-tpl__head"><span class="cond-tpl__badge" style="background:${b.color}">${b.label}</span></div>`
      + `<div class="cond-tpl__label">${tpl.label}</div>`
      + `<p class="cond-tpl__preview">${tpl.preview}</p>`
      + (COND_SIMPLE[tpl.id] ? `<p class="cond-tpl__simple">${COND_SIMPLE[tpl.id]}</p>` : '')
      + (added
          ? `<span class="cond-tpl__done">Insérée — modifiable dans le document</span>`
          : `<button class="cond-tpl__add" data-add-tpl="${tpl.id}" data-add-key="${key}">+ Insérer dans la clause</button>`)
      + `</div>`;
  }).join('');

  listEl.querySelectorAll('[data-add-tpl]').forEach(btn =>
    btn.addEventListener('click', () => {
      insertCondTemplate(btn.dataset.addKey, btn.dataset.addTpl);
      renderCondTemplates(key);
    }));
}

// Empêche le bouton "Retirer" de déplacer le curseur d'édition.
page.addEventListener('mousedown', e => {
  if (e.target.closest('.clause-cond__del')) e.preventDefault();
});

// Suppression d'une condition depuis son bouton dans le document.
page.addEventListener('click', e => {
  const delBtn = e.target.closest('[data-del-tpl]');
  if (!delBtn) return;
  const condEl = delBtn.closest('.clause-cond');
  if (condEl) condEl.remove();
  const key = delBtn.dataset.delKey;
  if (key === activeKey) renderCondTemplates(key);
  countWords();
  paginate(); // recalcule la mise en page après retrait de la condition
}, true);

// ─── Explications "comme à un enfant de 5 ans" ───────────────────────────────

const SIMPLE = {
  societe:
    `C'est l'identité de l'entreprise qui reçoit l'investissement : son nom, sa forme juridique, son capital. Le capital est divisé en actions, et détenir des actions, c'est posséder une part de l'entreprise.`,
  fondateurs:
    `Ce sont les créateurs de l'entreprise, ceux qui la dirigent au quotidien. Le contrat leur impose des engagements particuliers (rester impliqués, ne pas partir n'importe comment), car l'investisseur mise en grande partie sur eux.`,
  investisseur:
    `C'est celui qui apporte l'argent pour financer la croissance. En échange, il reçoit des actions et donc une part de l'entreprise, ainsi que certains droits de regard et de protection détaillés dans le contrat.`,
  investissement:
    `Le cœur de l'accord : combien l'investisseur met, et quel pourcentage de l'entreprise il obtient. Ici 1 M€ pour ≈ 14 %. On parle de valorisation « pre-money » (la valeur avant l'apport, 6 M€) et « post-money » (après, 7 M€).`,
  titre:
    `Précise le type d'actions que reçoit l'investisseur — souvent des « actions de préférence » (ici « Actions A »). « De préférence » veut dire qu'elles donnent des droits en plus des actions ordinaires des fondateurs (priorité sur l'argent, protections…).`,
  liquidation:
    `La « préférence de liquidation » : le jour où l'entreprise est vendue, l'investisseur récupère sa mise (souvent 1× ce qu'il a investi) avant que les fondateurs touchent quoi que ce soit. C'est une sécurité s'il y a peu à partager.`,
  ratchet:
    `Une protection de l'investisseur : si un futur tour se fait à un prix plus bas que le sien (un « down round »), il reçoit des actions supplémentaires gratuitement pour compenser. Le revers : cela dilue davantage les fondateurs.`,
  antidilution:
    `Empêche que la part de l'investisseur fonde trop quand l'entreprise émet de nouvelles actions. C'est le mécanisme général dont le ratchet est une forme particulière, déclenchée par une baisse de valorisation.`,
  lockup:
    `L'« inaliénabilité » : pendant une durée fixée, les fondateurs n'ont pas le droit de vendre leurs actions. Cela garantit à l'investisseur qu'ils restent engagés et ne quittent pas le navire avec leur argent.`,
  preemption:
    `Le « droit de préemption » : si un associé veut vendre ses actions, les autres associés peuvent les racheter en priorité, avant tout acheteur extérieur. Cela évite de voir débarquer un inconnu au capital.`,
  fulltag:
    `Le « tag-along total » : si l'investisseur vend toutes ses actions, les fondateurs ont le droit de vendre les leurs en même temps et au même prix. Personne n'est laissé seul avec un nouvel actionnaire imposé.`,
  proptag:
    `La version proportionnelle du tag-along : si l'investisseur ne vend qu'une partie de ses actions, les fondateurs peuvent vendre la même proportion des leurs, aux mêmes conditions.`,
  drag:
    `Le « drag-along » (droit d'entraînement) : si un acheteur veut racheter 100 % de l'entreprise, l'investisseur peut forcer les fondateurs à vendre aussi. Cela évite qu'un associé minoritaire bloque une belle vente.`,
  libres:
    `Liste les cas où l'on peut transférer ses actions sans appliquer les règles habituelles (préemption, agrément) : typiquement une transmission familiale ou un transfert vers une autre société du même groupe.`,
  board:
    `Le comité stratégique (ou « board ») : l'instance où fondateurs et investisseur se réunissent pour suivre l'activité et trancher les grandes orientations. Le contrat fixe qui y siège et comment les décisions se prennent.`,
  decisions:
    `Les « matières réservées » : une liste de décisions importantes (gros recrutements, emprunts, dépenses au-delà d'un seuil…) que les fondateurs ne peuvent pas prendre seuls — l'accord de l'investisseur est requis avant.`,
  implication:
    `L'engagement d'exclusivité professionnelle : les fondateurs s'obligent à consacrer tout leur temps de travail à l'entreprise, sans activité concurrente ou parallèle. L'investisseur veut s'assurer qu'ils sont à 100 % sur le projet.`,
  noncompete:
    `La non-concurrence : pendant une durée définie après leur départ, les fondateurs ne peuvent pas lancer ou rejoindre un concurrent, ni débaucher l'équipe. Cela protège l'entreprise contre un départ qui lui ferait directement du tort.`,
  pi:
    `La cession de propriété intellectuelle : tout ce qui est créé pour l'entreprise (code, marque, brevets, designs) lui appartient à elle, et non aux fondateurs à titre personnel. Sans cela, l'actif principal pourrait échapper à la société.`,
  leaver:
    `Les clauses de « leaver » : si un fondateur part, il peut être obligé de revendre tout ou partie de ses actions. Le prix dépend des circonstances — partir correctement (« good leaver ») rapporte bien plus que partir mal (« bad leaver »).`,
  realisation:
    `La « date de réalisation » (closing) : le jour où l'opération devient effective — les fonds sont versés et les actions émises. Tout ce que prévoit le contrat prend effet à cette date, une fois les conditions remplies.`,
  conditions:
    `Les « conditions suspensives » : une liste d'étapes à valider avant que l'accord ne devienne définitif (audit satisfaisant, autorisations, documents signés…). Tant qu'une condition n'est pas levée, l'opération ne se fait pas.`,
  garanties:
    `Les « déclarations et garanties » : les fondateurs affirment officiellement que la situation de l'entreprise est conforme à ce qui a été présenté (comptes, contrats, litiges…). Si une affirmation se révèle fausse, ils doivent indemniser l'investisseur.`,
  exclusivite:
    `L'exclusivité (« no-shop ») : pendant la négociation, l'entreprise s'engage à ne pas discuter avec d'autres investisseurs. Cela protège l'investisseur qui dépense temps et argent en audit, pour éviter d'être mis en concurrence au dernier moment.`,
  confidentialite:
    `L'obligation de garder secret le contenu des discussions et du contrat. Les parties ne communiquent pas à l'extérieur (presse, concurrents) sans accord, sauf obligation légale.`,
  frais:
    `Indique qui paie les frais de l'opération (avocats, audits…). En général chacun supporte les siens, parfois l'entreprise prend en charge une partie de ceux de l'investisseur dans une limite convenue.`,
  duree:
    `La durée de validité du document : une date limite avant laquelle l'opération doit être signée. Passé ce délai, la lettre d'intention devient caduque et il faut renégocier.`,
  nonbinding:
    `Précise que ce document n'engage pas (ou peu) juridiquement : c'est une feuille de route qui fixe les grandes lignes, pas le contrat final. Seules certaines clauses (confidentialité, exclusivité, frais) restent contraignantes.`,
  droit:
    `Indique quelle loi s'applique et quel tribunal sera compétent en cas de litige (ici, droit et juridiction français). Cela évite toute incertitude sur les règles du jeu si un désaccord survient.`,
  reporting:
    `Le droit à l'information renforcé : l'investisseur reçoit régulièrement des comptes rendus (résultats financiers, trésorerie, avancement). Ayant mis de l'argent, il a un droit de suivi sur la marche de l'entreprise.`,
  observer:
    `Le « censeur » : l'investisseur peut envoyer un représentant assister aux réunions du comité stratégique. Il écoute et donne son avis, mais ne vote pas. C'est une présence d'observation, sans pouvoir de décision.`,
  liquidite:
    `La clause de liquidité : si aucune sortie (vente, introduction en bourse) n'a lieu dans un certain délai, l'investisseur peut activer un mécanisme pour récupérer son argent. C'est sa porte de sortie si l'aventure s'éternise.`,
  rachat:
    `La clause de rachat (« redemption ») : dans des cas précis et après plusieurs années, l'investisseur peut demander à l'entreprise de lui racheter ses actions. C'est une porte de sortie de dernier recours si aucune vente n'intervient.`,
  paytoplay:
    `Le « pay-to-play » : si l'investisseur ne remet pas d'argent lors des tours suivants, il perd une partie de ses droits privilégiés (préférence, protections). L'idée : conserver ses avantages suppose de continuer à soutenir l'entreprise.`,
  mfn:
    `La clause de la « nation la plus favorisée » (MFN) : si un futur investisseur obtient de meilleures conditions, l'investisseur actuel peut réclamer les mêmes. Cela lui garantit de ne jamais être moins bien traité que les suivants.`,
  dividprio:
    `Le dividende prioritaire cumulatif : avant toute distribution aux autres actionnaires, l'investisseur perçoit chaque année un dividende fixe. S'il n'est pas versé, il s'accumule et reste dû. C'est une rémunération garantie de son apport.`,
  rofo:
    `Le « droit de première offre » (ROFO) : avant de vendre ses actions à un tiers, un associé doit d'abord les proposer à l'investisseur. Ce n'est qu'en cas de refus qu'il peut chercher un acheteur extérieur.`,
  nonsollicitation:
    `La non-sollicitation : après son départ, un fondateur s'interdit de démarcher les clients ou les salariés de l'entreprise pour les attirer ailleurs. Plus ciblé que la non-concurrence, qui interdit toute activité concurrente.`,
  hommecle:
    `L'assurance « homme-clé » : l'entreprise souscrit une assurance sur les fondateurs essentiels. En cas de décès ou d'incapacité de l'un d'eux, elle reçoit une indemnité pour absorber le choc et financer la transition.`,
  mac:
    `La clause de « changement défavorable significatif » (MAC) : si un événement grave dégrade fortement l'entreprise avant la signature, l'investisseur peut se retirer. C'est un filet de sécurité contre une mauvaise surprise majeure de dernière minute.`,
  mediation:
    `La médiation préalable : en cas de litige, les parties s'engagent à tenter de trouver un accord avec un médiateur neutre avant de saisir un tribunal. C'est en général plus rapide, moins cher et moins conflictuel qu'un procès.`,
};

// ─── Explications simples des conditions pré-écrites ─────────────────────────

const COND_SIMPLE = {
  g_cs_pacte:
    `On signe vraiment seulement quand tout le monde a accepté toutes les règles du jeu. C'est comme ne pas commencer à jouer avant que tout le monde ait lu les règles.`,
  g_cs_accord_invest:
    `Pour certaines grandes décisions, il faut d'abord demander la permission à l'investisseur. C'est comme demander à un parent avant de faire quelque chose d'important.`,
  g_cr_ipo:
    `Si l'entreprise entre en bourse (devient publique), cette règle s'efface d'elle-même. Elle n'a plus de raison d'exister à ce stade.`,
  g_duree_18m:
    `Cette règle a une date de fin. Après 18 mois, elle disparaît automatiquement — comme un bail qui arrive à expiration.`,
  g_exc_intergroupe:
    `Si tu déplaces tes actions à l'intérieur de ta propre famille d'entreprises, c'est autorisé sans permission. C'est comme passer un objet de ta main gauche à ta main droite.`,
  g_exc_famille:
    `Tu peux donner tes actions à ta famille proche sans demander permission à personne. C'est un cadeau familial qui est autorisé.`,
  inv_cs_audit:
    `Avant de donner l'argent, l'investisseur veut d'abord vérifier que tout ce que la startup a dit est vrai. C'est comme inspecter une voiture avant de l'acheter.`,
  inv_tranche:
    `L'investisseur ne donne pas tout l'argent d'un coup. La moitié maintenant, l'autre moitié seulement si l'entreprise atteint ses objectifs. Comme recevoir son argent de poche après un bon bulletin.`,
  inv_cs_concentration:
    `Si le gouvernement doit donner une autorisation pour cet investissement, on attend son accord avant de continuer. On ne fait rien avant que l'État dise « ok ».`,
  liq_excl_ipo:
    `Si l'entreprise entre en bourse, la règle « l'investisseur passe en premier » ne s'applique plus. Tout le monde est traité pareil — comme des actionnaires ordinaires.`,
  liq_flipover:
    `Si c'est plus avantageux pour l'investisseur d'être traité comme tout le monde plutôt qu'en priorité, il bascule automatiquement. Il choisit toujours la meilleure option pour lui.`,
  liq_cascade_15x:
    `Avant de partager les profits avec les fondateurs, l'investisseur récupère 1,5 fois ce qu'il a mis. C'est son « supplément » pour avoir pris le risque d'investir.`,
  rat_broadbased:
    `Si l'entreprise vend des actions moins chères plus tard, l'investisseur reçoit des actions bonus pour compenser. La formule est compliquée, mais l'idée est simple : on ne lui fait pas perdre d'argent.`,
  rat_full:
    `Version encore plus protectrice : si les actions futures coûtent moins, l'investisseur reçoit BEAUCOUP plus d'actions bonus. C'est la protection maximale.`,
  rat_exclusions:
    `Certaines opérations normales (comme donner des options aux employés) ne déclenchent pas le ratchet. Elles sont exemptées — sinon le ratchet se déclencherait tout le temps.`,
  lea_vesting:
    `Les fondateurs gagnent leurs actions petit à petit sur 3 ans. Rien la première année (le « cliff »), puis un peu chaque mois ensuite. Partir tôt = garder moins d'actions.`,
  lea_bad:
    `Si un fondateur part en mauvais termes (faute grave, démission surprise), il doit vendre ses actions pour presque rien. C'est la « punition » pour être parti en laissant l'équipe dans l'embarras.`,
  lea_good:
    `Si un fondateur part pour une bonne raison (maladie, accord mutuel), ses actions sont rachetées au prix juste du marché. On ne lui fait pas de mal — c'est équitable.`,
  nc_24m_fr:
    `Après avoir quitté, le fondateur ne peut pas créer une concurrence pendant 2 ans en France. En échange, il reçoit 30 % de son salaire chaque mois. C'est une compensation pour cette interdiction.`,
  lock_36m:
    `Les fondateurs ne peuvent pas vendre leurs actions pendant 3 ans. C'est pour montrer qu'ils font confiance à leur propre entreprise. Sauf pour donner à la famille proche.`,
  war_standard:
    `Les fondateurs garantissent que tout ce qu'ils ont dit sur l'entreprise est vrai. S'il y a un problème caché, ils doivent payer jusqu'à 1 million d'euros pendant 18 mois.`,
  sort_drag:
    `Si quelqu'un offre un très bon prix pour toute l'entreprise, l'investisseur peut obliger tout le monde à vendre. C'est pour ne pas bloquer une belle opportunité à cause d'un seul blocage.`,
  sort_tag:
    `Si l'investisseur vend ses actions, les fondateurs ont le droit de vendre les leurs en même temps et au même prix. On ne les abandonne pas avec un nouveau patron.`,
  sort_preemption:
    `Avant de vendre à un inconnu, tu dois d'abord proposer tes actions à tes associés. Ils ont 30 jours pour dire « je prends ». C'est le droit de priorité entre associés.`,
  info_trim:
    `Chaque trimestre (tous les 3 mois), la startup envoie un rapport à l'investisseur : résultats, trésorerie, projets. C'est le bulletin de notes trimestriel de l'entreprise.`,
  impl_tps_plein:
    `Les fondateurs travaillent 5 jours par semaine pour l'entreprise. Pas de deuxième activité secrète. L'entreprise doit être leur priorité absolue numéro 1.`,
  aud_annuel:
    `Une fois par an, l'investisseur peut envoyer quelqu'un vérifier les livres de compte. C'est le droit de contrôle — comme un inspecteur qui vérifie que tout est honnête.`,
  mr_liste:
    `Il y a une liste de décisions très importantes que les fondateurs doivent soumettre à l'investisseur avant de les prendre. Dépenser plus de 50 000 €, modifier les statuts… on ne décide pas seul.`,
};
