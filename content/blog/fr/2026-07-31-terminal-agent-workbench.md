---
layout: post.njk
title: "Taper est devenu gratuit. Le jugement, non."
description: "Quatre agents de codage en parallèle, ça ressemble à une histoire de débit. Ça n'en est pas une. C'est une histoire où la revue devient la ressource rare. La boucle terminal que je fais tourner à la place d'une sidebar de chat : un worktree git par agent, des prompts écrits dans Neovim, des règles appliquées par des machines, et chaque diff survivant lu hunk par hunk."
date: 2026-07-31
tags: [tooling, terminal, agents, review, ownership]
poster: /assets/content/machine-city.webp
ogImage: /assets/content/machine-city.jpg
updates:
  - date: 2026-09-12
    kind: revision
    marks:
      - "**`tuicr -w`** : je lis ce qui a survécu, hunk par hunk, et je commente les lignes qui ne vont pas."
      - "**tuicr** est là où ça s'arrête : un TUI de revue de code avec des raccourcis vim, dans le terminal, à côté de l'agent qui a écrit le code."
      - "C'est pour ça que la revue vit dans son propre programme plutôt que dans un panneau de chat"
    summary: "La revue s'est déplacée dans l'éditeur. **`codecompanion.nvim`** met l'interaction avec l'agent dans un buffer Neovim, **ACP** lui permet de piloter la même configuration d'agent et, quand c'est supporté, le même abonnement, et **`atlas.nvim`** a remplacé `tuicr` pour lire les changements suivis et les pull requests. **`code-review.nvim`** couvre ensuite ce que `tuicr` n'a jamais fait : les fichiers non suivis, ce qui en pratique veut dire les plans et notes en Markdown à partir desquels un agent travaille avant qu'aucun code n'existe. Ce dernier point est le vrai changement d'avis. L'appropriation commence avant le diff, donc ce qui se fait relire, c'est le plan, les hypothèses et la direction, pas seulement le résultat. La boucle elle-même n'a pas changé, et l'argument non plus : l'agent écrit, je lis, je questionne et je guide. Appelez ça la chute de ce billet qui encaisse sur elle-même. Remplacez `tuicr` par autre chose et l'argument survit, parce qu'il n'a jamais porté sur les outils."
---

> **En bref :** Taper est devenu gratuit, le jugement non, et la forme sidebar-de-chat optimise la mauvaise chose : un seul working tree, un seul agent, la revue réduite à scroller jusqu'à tomber sur **Accept All**. Ma boucle, elle, fait ça : **[workmux](https://github.com/raine/workmux)** donne à chaque agent son propre worktree et sa fenêtre tmux, le prompt s'écrit dans Neovim avec une vraie complétion de chemins (**[prompt.nvim](https://github.com/monkeymonk/prompt.nvim)**, le mien), des tests et des agents revieweurs porteurs de règles attrapent tout ce qui est mécanique, et ce qui survit, je le lis hunk par hunk dans **[tuicr](https://github.com/agavra/tuicr)**, où mes objections s'exportent directement en prompt suivant. **Une règle, c'est du jugement qui s'échelonne ; un commentaire de revue, c'est du jugement qui s'évapore.** Les machines vérifient le travail avant que je le lise, jamais à ma place.

Quatre agents de codage en parallèle, ça ressemble à une histoire de débit. Ça n'en est pas une. Une fois que l'agent fait la frappe, les parties difficiles se déplacent vers l'extérieur : décider quoi déléguer, contraindre ce qui revient, et relire le résultat. Voici l'installation terminal que j'ai construite autour de ces tâches.

Ces trois choses sont du jugement, la seule chose qui n'est pas devenue moins chère. Et le jugement est la matière première de l'appropriation : pas lancer chaque vérification soi-même, mais décider **quelles vérifications existent, encoder dans ces vérifications le jugement qui se répète, et rester celui qui dit oui.**

## La boucle

La voici de bout en bout, une tâche du début jusqu'au merge.

1. **`workmux add fix/webhook-retry -p "…"`** crée la branche, le worktree, une fenêtre tmux, et lance un agent dedans qui tient mon prompt. Isolé par construction : rien de ce qu'il fait ne peut toucher les trois autres.
2. **Le prompt s'écrit dans Neovim**, avec des chemins exacts épinglés plutôt que décrits.
3. **L'agent construit.** Je vais faire autre chose (en général lire le diff d'un autre agent).
4. **Les vérifications machine tournent :** types, tests, linters, plus des agents revieweurs porteurs des règles de ce projet. Tout ce qu'ils rejettent est corrigé avant que je regarde.
5. **`tuicr -w`** : je lis ce qui a survécu, hunk par hunk, et je commente les lignes qui ne vont pas.
6. **Les commentaires s'exportent ; ils deviennent le prompt suivant.** On répète 3 à 6 jusqu'à ce que je n'aie plus d'objection.
7. **`workmux merge --rebase`** : merge, puis la fenêtre, le worktree et la branche disparaissent.

Quatre de ces étapes existent pour protéger l'étape 5, parce que l'étape 5 est celle qui ne s'échelonne pas. Le reste de ce billet explique pourquoi.

## Le goulot d'étranglement a bougé, et les outils ont bougé dans l'autre sens

Pendant vingt ans l'éditeur a été au centre de tout parce que la frappe était la contrainte. Complétion, snippets, refactors, LSP : tout visait le milieu du pipeline, et à juste titre. C'est là que partaient les heures.

Puis la machine a pris la frappe, le milieu s'est effondré à presque zéro, et la réponse de l'industrie a été de mettre une boîte de chat là où était l'arborescence de fichiers. Félicitations : le plus rapide au clavier de l'open space est devenu encore plus rapide.

Le travail qui a gonflé à la place s'enroule autour de la frappe, et tout ça, c'est du jugement :

- **La répartition** : quoi déléguer, dit précisément, sur les bons fichiers, à un endroit où l'agent ne peut rien faire trébucher d'autre.
- **La contrainte** : ce qui doit rester vrai, et quelle preuve le changement vous doit.
- **La revue** : lire un changement que vous n'avez pas tapé, assez attentivement pour pouvoir le contester.

La sidebar est mauvaise sur les trois. Un seul working tree veut dire que chaque agent partage un seul espace de travail mutable, donc le travail parallèle revient à plusieurs fenêtres sur les mêmes fichiers et une prière. Elle demande le paragraphe le plus lourd de conséquences de votre journée dans une boîte de saisie qui ferait rougir un formulaire de commentaire de 2009. Et elle rend la revue comme un scroll infini avec un bouton au bout, sans aucun avis sur ce qui devrait se passer en premier : quels tests doivent passer, quelle hypothèse mérite un second regard, quels fichiers personne ne touche sans surveillance. **Accept All n'est pas une mauvaise interface de revue. C'est l'absence d'un système de revue, déguisée en bouton.**

| La tâche | La réponse par défaut | Ce que je fais tourner |
| --- | --- | --- |
| Quatre tâches à la fois | un dépôt, un tree, un agent | un worktree + une fenêtre tmux par agent (**workmux**) |
| Écrire le prompt | une boîte à chaussures avec un bouton envoyer | un buffer Neovim avec `@` `/` `!` (**prompt.nvim**) |
| Garder les règles vraies | les bonnes intentions du modèle | tests, vérifications et revieweurs porteurs de règles |
| Lire le résultat | scroller, puis cliquer Accept | une revue au niveau du hunk qui s'exporte (**tuicr**) |

## L'isolation, pour que parallèle veuille dire parallèle

Plusieurs agents dans un seul dépôt partagent un working tree, et deux agents qui modifient des fichiers qui se recoupent, ce n'est pas du parallélisme. C'est un conflit de merge avec de l'ambition. `git worktree` a réglé ça en 2015 ; la friction n'a jamais été le worktree mais la cérémonie autour. **workmux** retire la cérémonie, associe chaque worktree à une fenêtre tmux et un agent, et nettoie les trois au merge.

![`workmux list` dans un dépôt d'exemple : trois branches, chacune avec son propre worktree sur disque et son propre travail non mergé, listées à côté de la branche à laquelle elles appartiennent.](/assets/content/screenshots/workmux-list.webp)

Les agents remontent **working**, **waiting** ou **done** via des hooks, donc un agent bloqué lève la main au lieu d'être découvert quarante minutes plus tard. En dessous, tmux garde les agents de longue durée vivants à travers une fenêtre fermée, une connexion coupée, un éditeur redémarré : c'est son travail depuis 2007.

L'effet : une branche devient un lieu physique. Ce qui tourne en parallèle redevient une décision sur le travail plutôt que sur la friction de l'outillage.

## La précision, parce que le vague est du jugement différé

`@app/Services/Billing/InvoiceTotals.php` et « le service de totaux de facture » ne sont pas le même prompt. L'un épingle le contexte ; l'autre envoie le modèle deviner, et il tombera parfois sur un fichier voisin au nom similaire.

**prompt.nvim** est le mien : j'appuie sur la touche éditeur externe et le prompt arrive dans un buffer Neovim avec une complétion derrière les caractères que les outils parlent déjà (`@` pour les chemins, `/` pour les commandes et skills, `!` pour le shell). Pas de nouveau dialecte ; la syntaxe est la leur, pas la mienne.

Chaque fichier que vous ne nommez pas est une décision confiée au modèle. Vous la retrouverez dans le diff.

## La revue est la ressource rare

Demandez un plan à un agent compétent et il ne vous rend pas trois puces. Il vous retourne un plan détaillé, confiant, tout à fait plausible, et ensuite il construit l'intégralité. Douze fichiers. Trente. La transcription défile plus vite que quiconque ne peut l'évaluer, et chaque « ça a l'air bon, continue » est un petit retrait d'un compte dont vous aviez oublié que vous dépensiez.

**tuicr** est là où ça s'arrête : un TUI de revue de code avec des raccourcis vim, dans le terminal, à côté de l'agent qui a écrit le code.

```sh
tuicr -w                    # le working tree, non commité inclus
tuicr pr 42                 # ou une PR GitHub / MR GitLab
```

![tuicr qui relit un changement non commité : le diff à droite, un commentaire ancré à la ligne 15 disant que la mémoïsation ne devrait pas être ajoutée et pourquoi, et le compteur de commentaires qui monte dans la barre latérale.](/assets/content/screenshots/tuicr-review.webp)

`j`/`k` à travers les hunks, commenter les lignes qui ne vont pas, exporter. Voici une vraie passe sur cette branche webhook (quatre commentaires, directement dans le presse-papier) :

```text
app/Services/Billing/InvoiceTotals.php:64
  $invoice->lines()->sum('amount') dans le foreach : une requête par ligne.
  InvoiceController@show charge déjà `lines` en eager-loading. Lire la relation chargée.

app/Services/Billing/InvoiceTotals.php:71
  N'ajoute pas la mémoïsation. Les totaux sont recalculés volontairement, les
  lignes changent en cours de requête et les règles d'invalidation deviennent
  bien plus dures à raisonner que ce que coûte cette boucle. Garde la structure,
  extrais l'arrondi dans TaxCalculator.

app/Jobs/ProcessStripeEvent.php:29
  La clé d'idempotence est un hash du payload. Utilise l'id de l'événement
  Stripe : les payloads d'un même événement ne sont pas stables octet pour octet.

tests/Feature/StripeWebhookTest.php
  Manque le cas pour lequel cette branche existe : un même événement livré deux
  fois, la seconde livraison ne doit pas se ré-appliquer.
```

Ce bloc est le prompt suivant. Quatre objections fichier-et-ligne avec leurs raisons : ce qu'un collègue obtiendrait d'une revue de PR, et ce qu'un modèle consomme le mieux. Le correctif revient cadré sur les objections au lieu d'une réécriture complète.

Le même écart apparaît dans la façon de demander. *« Y a-t-il des bugs là-dedans ? »* obtient l'avis général du modèle : une liste propre de peut-être-problèmes, surtout sur un code qui n'est pas le vôtre. C'est la question qu'on pose quand on n'a pas lu le diff, et elle retourne une réponse qu'on n'est en position de juger. Demandez plutôt si la ligne 64 peut lire la relation déjà chargée en eager, et si ce `round()` respecte l'échelle que `TaxCalculator` suppose en aval, et vous obtenez une réponse juste. **La qualité de ce qu'on peut demander est plafonnée par la revue qu'on a déjà faite soi-même.**

## Les règles font la vérification qu'un humain ne devrait pas répéter

Regardez à nouveau ces quatre commentaires : trois d'entre eux ne nécessitaient aucun jugement frais de ma part. L'un est un comportement détectable ; deux sont des règles que ce projet connaît déjà.

Le N+1 est un comportement. Une assertion de comptage de requêtes dans le test fonctionnel l'attrape, ou un revieweur à qui on dit d'inspecter les accès base de données dans une itération. (Pas « jamais de requête dans une boucle », qui est une heuristique avec de vraies exceptions ; la vérification est *combien de requêtes ça a réellement fait tourner*.) La clé d'idempotence est une politique : les ids d'événement du fournisseur, jamais des hashs de payload. Pareil pour le test manquant : une branche qui existe pour corriger une double livraison livre le test de double livraison.

Seul le commentaire sur la mémoïsation nécessitait un humain, et remarquez pourquoi : ce n'est pas du tout une règle. C'est un pari sur quel coût de maintenance on est prêt à porter dans deux ans, fait avec une connaissance qui ne vit nulle part dans le dépôt.

Ce ratio est le problème de conception. **La ressource rare n'a jamais été la vérification. C'est le jugement.** Donc le filtre est en couches : vérifications déterministes d'abord, puis agents revieweurs porteurs de règles explicites du projet, puis moi, lisant ce qui a survécu. Les machines sont bonnes pour vérifier un travail contre des règles que quelqu'un a écrites, et mauvaises pour décider ce que ces règles devraient être, ce qui fait de leur écriture le levier. **Une règle, c'est du jugement qui s'échelonne. Un commentaire de revue, c'est du jugement qui s'évapore.** Vous surprendre à taper la même objection deux fois, c'est le système qui vous dit qu'elle aurait dû être une contrainte.

En pratique « revieweur porteur de règles » veut juste dire un revieweur avec un mandat assez étroit pour produire des preuves plutôt que des impressions :

```text
Revois ce changement par rapport aux règles du projet. Ne rapporte que les
violations : pas de refactor hors sujet, pas d'avis de style.

- Les clés d'idempotence utilisent l'id d'événement du fournisseur, jamais un hash de payload.
- Chaque handler retry-safe a un test fonctionnel de livraison dupliquée.
- Les écritures qui doivent réussir ensemble se font dans une seule transaction.
```

Que ces règles arrivent sous forme de skill, de commande, d'un fichier dans le dépôt ou d'un prompt généré est de la plomberie incidente. Ce qui compte, c'est le mandat : un périmètre borné, des règles spécifiques au projet, des constats que je peux vérifier plutôt qu'un avis auquel je dois faire confiance. J'en fais tourner un petit ensemble, qui évolue. C'est un work in progress, et ça mérite son propre billet plutôt qu'un paragraphe confiant ici.

Ce que ça n'est pas, c'est « laisser l'IA réviser l'IA et aller se promener ». Un modèle qui en relit un autre apporte des angles morts corrélés et un fort instinct d'accord ; il confirmera que la mémoïsation est une belle optimisation, parce qu'il n'a aucune idée de ce que vous êtes prêt à maintenir. Plusieurs machines d'accord entre elles n'est pas une assurance. Le second agent est un instrument dont je règle les règles, pas une autorité : un filtre, pas un juge. C'est le filtre qui rend le juge abordable.

## La boucle tourne au moins aussi souvent à l'envers

Souvent le diff dans `tuicr -w` est un diff que **j'ai** tapé, et c'est l'agent qui est le revieweur.

Ce que je garde : le travail où écrire *est* la pensée ; les trente lignes porteuses de chaque système (ordonnancement, concurrence, argent, auth, invalidation de cache), que je lirais trois fois quel qu'en soit l'auteur ; et tout ce que je ne pourrais pas relire avec confiance, parce que *si je ne peux pas juger le résultat, je n'ai rien à faire à le déléguer.*

Ce que je délègue, c'est le complément : de la largeur, pas de la profondeur. Le cinquième canal de notification une fois que les quatre premiers ont fixé le contrat. Vingt contrôleurs dont le `$request->validate()` inline est monté en classes FormRequest. Contrat stable, jugement déjà fait, frappe restante.

Relire mon propre travail suit la même boucle, et je ne demande presque jamais si un changement est *bon*. Je demande un mode de défaillance précis : tracer l'autorisation à travers chaque point d'entrée, contester le chemin de migration, trouver le comportement que les tests ne fixent pas. **Un revieweur général produit un avis. Un revieweur borné produit une preuve.**

C'est pour ça que la revue vit dans son propre programme plutôt que dans un panneau de chat : le filtre ne se soucie pas de qui a tapé le code. Et la raison pour laquelle je garde les parties difficiles, c'est que les deux compétences se nourrissent l'une l'autre. Vous n'avez pas besoin d'avoir tapé quelque chose pour le relire, mais il vous faut assez de maîtrise du problème pour savoir où ça pourrait être faux. Sous cette ligne, vous faites du pattern-matching en espérant, et la pratique qui me garde au-dessus, c'est d'écrire moi-même le code difficile.

## Ce que ça coûte

Le bilan honnête, parce qu'un billet comme celui-ci sans ça est une publicité :

- **Le plafond, c'est moi.** Quatre agents font quatre files de revue qui fusionnent dans un seul humain. Au-delà de deux ou trois, je ne vais pas plus vite, j'accumule des diffs non lus : exactement l'échec que tout ça existe pour empêcher.
- **Les worktrees divergent.** Quatre branches sur une base commune pendant une journée, c'est quatre rebases et de vrais conflits.
- **« Fait » n'est pas « correct ».** Un hook de statut rapporte qu'un processus s'est terminé. C'est toute la prétention qu'il porte.
- **La concurrence multiplie la dépense.** Quatre agents coûtent à peu près quatre agents.
- **Les règles pourrissent.** Une règle à laquelle vous ne croyez plus, appliquée sans relâche, est pire que pas de règle du tout. Elle vous entraîne à survoler la couche qui était censée penser.
- **Des outils jeunes.** tuicr est en `0.19`, workmux évolue vite, et prompt.nvim, c'est moi qui le maintiens.

Et en toute honnêteté pour la sidebar : installation en un clic, excellente complétion inline, diffs rendus sans apprendre de raccourcis. Si votre journée est une tâche à la fois dans un seul dépôt, ou si le projet est assez petit pour qu'avoir tort coûte un après-midi, tout ce qui précède ne vous achète rien.

## Où j'en suis

Les outils sont presque incidents. Remplacez tuicr par `git add -p` et un carnet, remplacez workmux par quatre onglets et de la discipline : l'argument survit, parce qu'il n'a jamais porté sur le terminal. La machine a rendu une moitié de mon travail presque gratuite et laissé l'autre moitié exactement aussi chère qu'avant, et il est désormais très facile de dépenser les économies à livrer du code que personne n'a compris.

Donc j'optimise la moitié chère, en commençant par ne pas la gaspiller. Une isolation assez bon marché pour que j'arrête de la sauter. Des chemins épinglés plutôt que décrits. Des règles écrites et appliquées par des machines, pour que ce qui m'arrive soit le résidu qu'aucune règle n'a pu attraper. Une revue assez concrète pour survivre à un vendredi chargé.

Quatre agents tapent plus vite que je ne le ferai jamais. Un cinquième peut contester leur travail, et un dépôt plein de règles peut rejeter les erreurs connues avant que j'en voie aucune. Rien de tout ça ne décide si un changement appartient au système. Cette part m'appartient : construire les portes, peser ce qui passe à travers, rester celui qui est responsable de les ouvrir, ce qui veut dire continuer à écrire moi-même le code le plus difficile, parce que c'est ce qui garde le jugement affilé.

L'exception honnête est la proportionnalité. Tout ça est calibré pour du code à conséquences : d'autres mainteneurs, de vraies données, quelque chose qui réveille quelqu'un à 3h du matin. Sur une expérience jetable, j'accepte bien plus de risque, parce que le rayon de l'explosion se limite à mon propre ordinateur portable. Ça n'abandonne pas le jugement, ça l'applique. La partie qui compte est de remarquer quand un jouet arrête discrètement d'en être un.

Mais quand ça compte : le bouton Accept All est juste là. Je ne vais simplement pas le presser.

---

*Références : [workmux](https://github.com/raine/workmux) · [tuicr](https://github.com/agavra/tuicr) · [prompt.nvim](https://github.com/monkeymonk/prompt.nvim) (le mien). À lire aussi : [faire tourner des agents dans une boîte](/fr/blog/ai-agent-sandboxing/) et [les quatre dépôts derrière cette machine](/fr/blog/four-things-to-run-a-machine/).*
