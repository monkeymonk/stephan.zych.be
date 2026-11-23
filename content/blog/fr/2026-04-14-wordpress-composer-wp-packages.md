---
layout: post.njk
title: "WordPress a un nouveau registre de paquets, et ça me soulage"
description: "WPackagist s'est fait racheter, alors Roots a sorti WP Packages en quatre jours. Petite histoire de pourquoi on fait tourner WordPress via Composer, et pourquoi le registre derrière ça a soudain compté."
date: 2026-04-14
tags: [wordpress, composer, php, tooling]
poster: /assets/content/packages-blocks.webp
ogImage: /assets/content/packages-blocks.jpg
---

> **En bref :** Faire tourner WordPress via **Composer** traite les plugins comme les dépendances qu'ils sont (déclarées, épinglées, verrouillées, hors de votre dépôt). Le registre qui faisait marcher ça, WPackagist, s'est fait racheter par une société d'hébergement adossée à du private equity ; [Roots](https://roots.io/) a sorti **WP Packages** en remplacement en quatre jours. Pourquoi traîner Composer dans WordPress, et pourquoi posséder le registre sous votre build compte vraiment.

Il existe un genre particulier de développeur qui installe les plugins WordPress en cliquant sur un bouton dans `/wp-admin`, et il y a le genre qui préférerait manger du verre. Je suis, malheureusement, le second genre. Quatre-vingt pour cent de ma vie PHP, c'est du Laravel, mais les missions WordPress n'arrêtent jamais d'arriver. La première chose que je fais sur chacune, c'est d'arracher l'installeur de plugins et de le remplacer par un `composer.json`.

Donc quand la plomberie sous ce workflow s'est fait *racheter* en mars, j'ai fait attention. Puis [Roots](https://roots.io/) a sorti un remplaçant en quatre jours, et j'écris à ce sujet, parce que tout cet épisode est une petite leçon bien rangée sur pourquoi vous ne voulez pas qu'une société d'hébergement adossée au private equity possède le registre dont dépend votre build.

## D'abord : pourquoi traîner Composer dans WordPress ?

Si vous n'avez géré WordPress que via le tableau de bord, ça sonne comme inventer des problèmes. Laissez-moi plaider la cause, parce que c'est toute la raison pour laquelle le registre compte.

Le workflow WordPress par défaut traite vos plugins et thèmes comme du *contenu* : vous cliquez sur « installer », le fichier atterrit dans `wp-content/plugins/`, et maintenant il fait partie de votre site de la même façon qu'un article de blog. Ce qui veut dire qu'il est soit commité dans votre dépôt git (en embarquant quelques centaines de méga-octets de code de quelqu'un d'autre que vous ne lirez jamais) soit pas du tout suivi et votre « déploiement » est quelqu'un qui fait du SFTP en production à 23h. J'ai hérité des deux. Aucun n'est un système.

[Composer](https://getcomposer.org/) est le gestionnaire de dépendances de PHP, et le mouvement consiste à traiter les plugins comme ce qu'ils sont réellement : des **dépendances**. Vous les déclarez, vous les épinglez, vous les verrouillez, et le code lui-même reste hors de votre dépôt :

```json
{
  "require": {
    "wp-plugin/woocommerce": "^9.0",
    "wp-plugin/wordpress-seo": "^24.0",
    "wp-theme/twentytwentyfive": "^1.0"
  }
}
```

Ce `composer.lock` juste à côté est la partie qui mérite sa place. Il épingle la version *exacte* résolue de chaque plugin, donc le site que je construis sur mon laptop est identique octet pour octet au site que la CI construit, identique octet pour octet au site qui atterrit en production. Pas de « ça marche sur ma machine ». Pas de mystère sur quelle version mineure de WooCommerce est en ligne. Les plugins eux-mêmes sont dans le `.gitignore` et reconstitués au déploiement avec une commande :

```bash
composer install --no-dev --optimize-autoloader
```

C'est le socle que [**Bedrock** de Roots](https://roots.io/bedrock/) prêche depuis une décennie : WordPress restructuré en une disposition de projet sensée où `wp-config` ce sont des variables d'environnement à la twelve-factor et chaque dépendance passe par Composer. Une fois là, l'automatisation découle gratuitement : Dependabot ouvre une PR quand un plugin sort un patch de sécurité, votre CI lance la mise à jour contre vos tests avant qu'elle ne touche jamais la production, et un rollback c'est un `git revert` plus un redéploiement au lieu d'une prière. Voilà l'argumentaire. Voilà pourquoi les gens font ça.

## Le hic : WordPress.org ne parle pas Composer

Voici le trou. L'annuaire de plugins et thèmes de WordPress.org (des dizaines de milliers de paquets) est servi via **SVN** et une API maison. Il n'a jamais parlé Composer. Donc pour que tout ce qui précède fonctionne, *quelque chose* doit se placer au milieu, miroiter l'annuaire wp.org entier, et le réexposer comme un vrai dépôt Composer.

Pendant onze ans, ce quelque chose s'appelait **[WPackagist](https://wpackagist.org/)**.

Construit en 2013 par [Outlandish](https://outlandish.com/), une coopérative de développeurs britannique, WPackagist était une infrastructure discrète et essentielle, du genre à laquelle personne ne pense jusqu'à ce qu'elle bouge. Il miroitait chaque plugin et thème, les exposait sous `wpackagist-plugin/*` et `wpackagist-theme/*`, et c'était le standard. Si vous faisiez tourner WordPress via Composer, vous passiez par WPackagist, point final.

Il a aussi vieilli. Les mises à jour avaient environ 90 minutes de retard sur l'annuaire wp.org, agaçant quand la version dont vous avez besoin est un patch de sécurité sorti il y a vingt minutes. Il s'appuyait encore sur les vieilles métadonnées `provider-includes` de Composer v1, qui forcent Composer à télécharger des fichiers d'index obèses avant de pouvoir résoudre quoi que ce soit. Et il servait des plugins *fermés* (ceux que wp.org avait retirés pour raison de sécurité ou d'abandon) sans avertissement, donc `composer update` réinstallait joyeusement un plugin qui venait d'être retiré pour une CVE en cours. De la maintenance différée, en gros. Pardonnable pour un projet coopératif bénévole qui porte tout un écosystème sur son dos.

## Puis il s'est fait racheter

En mars 2026, **WP Engine**, un hébergeur WordPress adossé au private equity, a racheté WPackagist.

On peut discuter du bien-fondé. Ce qui est indiscutable, c'est la première chose qu'ils ont faite : ils ont poussé un avis via le champ `info` de Composer, si bien que *« WPackagist is now maintained by WP Engine »* s'imprimait dans le terminal de chaque développeur à chaque installation. Un petit truc. Un truc *révélateur*. Le registre dont dépendent mes builds automatisés était désormais un panneau publicitaire, possédé par une entreprise ayant un intérêt commercial sur la provenance de mes plugins, et ils avaient démontré dès le premier jour qu'ils utiliseraient mon terminal comme espace pub. C'est le moment où une dépendance ennuyeuse devient un risque.

## Roots a sorti la réponse en quatre jours

[Ben Word](https://roots.io/) (le gars de Roots, le gars de Bedrock/Sage/Trellis) avait apparemment vu ça venir. Il avait discrètement commencé à construire un remplaçant de WPackagist dès août 2025. Quand l'accord WP Engine est arrivé, il a juste... livré. **Le 16 mars, quatre jours après le rachat**, entièrement open source sur GitHub.

C'est sorti sous le nom « WP Composer », et a immédiatement rencontré l'accroc le plus représentatif possible : **Nils Adermann, co-créateur de Composer lui-même**, a pris contact pour signaler que le nom était à la fois confus et empiétait sur une marque. Sa remarque vaut d'être citée parce que c'est un bel exemple de philosophie de conception d'API appliquée au *nommage* :

> We just generally try to keep Composer referring to CLI/client side things and Packagist for the server/repository. Otherwise people just end up getting even more confused by these tools. Eg right now just based on the name I would expect WP Composer to be some Composer fork or plugin.

Juste. Donc WP Composer est devenu **[WP Packages](https://wp-packages.org/)**, a déménagé vers `wp-packages.org`, et a gardé tout le reste. « Composer » désigne le client, « Packagist » le registre. WP *Packages* se place correctement du côté registre de cette ligne. J'apprécie un projet qui prend des notes de nommage de la personne qui a littéralement inventé la chose.

## Ce que vous obtenez réellement

Ce n'est pas un clone à l'identique avec un nouveau propriétaire. C'est ce que WPackagist serait si quelqu'un l'avait maintenu :

- **Résolutions à froid environ 17 fois plus rapides.** WP Packages parle le protocole `metadata-url` de Composer v2, donc Composer récupère les métadonnées *uniquement* pour les paquets que votre projet nomme au lieu de télécharger l'index entier d'abord. Le chiffre que Roots cite (0,7s contre 12,3s pour résoudre dix plugins à froid) correspond à ce que j'ai observé. Sur un runner CI sans cache, cet écart, c'est le temps de votre pipeline.
- **Synchronisation en cinq minutes** avec wp.org, contre environ 90 avant. Quand un plugin sort un correctif de sécurité, il est installable presque immédiatement.
- **Des espaces de noms sensés.** `wp-plugin/*` et `wp-theme/*`, sans le préfixe `wpackagist-` qui encombre votre bloc `require`.
- **Il respecte les plugins fermés.** Quand wp.org retire un plugin, WP Packages le supprime, donc Composer *ne peut pas* silencieusement réinstaller une version retirée et vulnérable. C'est une vraie amélioration de sécurité, pas un gadget.
- **Entièrement ouvert, de bout en bout.** Le code de l'application, la doc, *et la config de déploiement Ansible* sont publics. Vous pouvez monter votre propre registre Composer WordPress à partir de la même recette. Et Ben s'est engagé, publiquement, à ne jamais faire passer de pubs ou d'upsells par le champ `info` de Composer, exactement la chose qui a déclenché tout ça.

C'est financé via GitHub Sponsors. Indépendant, comme cette couche d'infrastructure devrait probablement l'être.

## Changer, c'est une commande

Pointer un projet vers lui est la déclaration de dépôt habituelle :

```bash
composer config repositories.wp-packages composer https://repo.wp-packages.org
```

Qui écrit le même bloc que vous ajouteriez à la main :

```json
{
  "repositories": [
    { "type": "composer", "url": "https://repo.wp-packages.org" }
  ]
}
```

Puis `composer require wp-plugin/woocommerce` et c'est parti. Migrer un projet WPackagist existant, c'est un chercher-remplacer sur les espaces de noms plus la nouvelle URL, Roots fournit un script pour ça, et si vous êtes sur Bedrock ou Radicle, la dernière version y pointe déjà par défaut. J'ai migré deux projets clients en un après-midi ; les diffs étaient ennuyeux, ce qui est le plus beau compliment qu'on puisse faire à une migration.

## La partie que personne n'a résolue

La note honnête : tout ça existe parce que **WordPress.org ne parle toujours pas Composer nativement**, onze ans après le contournement. Chaque mot ci-dessus, c'est l'écosystème qui construit un réseau de distribution parallèle autour d'un `.org` qui ne veut pas aller là où vit le PHP moderne. WPackagist a colmaté ça pendant une décennie ; WP Packages colmate plus vite et plus honnêtement, mais ça reste du papier sur la même fissure.

Et les alternatives continuent de caler. L'effort [FAIR Package Manager](https://fair.pm/) (une approche fédérée et décentralisée de la distribution WordPress) a perdu Joost de Valk et Karim Marucchi le mois dernier après que des hébergeurs ont refusé de le financer. Donc l'état réaliste des choses ce printemps, c'est : si vous voulez du WordPress professionnel, reproductible, automatisable, vous le faites passer par Composer, et le meilleur registre pour ça est maintenant un sprint de quatre jours de l'équipe Roots plutôt qu'un actif au bilan de WP Engine.

Je prends. Ennuyeux, rapide, ouvert, et ça ne me fera pas de pub depuis l'intérieur de mon propre terminal. Pour de l'infrastructure, c'est toute la description du poste.

---

*Sources pour la chronologie et les citations : [l'annonce de lancement de Roots](https://roots.io/introducing-wp-composer-as-a-wpackagist-replacement/), [le billet de renommage WP Composer → WP Packages](https://roots.io/wp-composer-is-now-wp-packages/), [WP Packages vs WPackagist](https://wp-packages.org/wp-packages-vs-wpackagist), [la couverture de WordPress.org](https://wordpress.org/news/2026/03/wp-packages/), et [The Repository](https://www.therepository.email/roots-launches-wp-composer-as-open-source-alternative-to-wpackagist).*
