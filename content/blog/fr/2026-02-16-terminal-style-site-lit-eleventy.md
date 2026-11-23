---
layout: post.njk
title: "J'ai réimplémenté tmux en CSS"
description: "Comment j'ai reconstruit toute ma config neovim dans le navigateur : web components, générateur de site statique, et un combat à mort avec le line-height."
date: 2026-02-16
tags: [meta, web-components, design]
poster: /assets/content/dev-den.webp
ogImage: /assets/content/dev-den.jpg
---

> **En bref :** je passe mes journées dans Ghostty + tmux + neovim, donc mon site *est* le terminal (une fenêtre déplaçable, des onglets façon tmux, une palette de commandes `:`, des numéros de ligne dans la marge), pas une capture d'écran de celui-ci. Construit avec quatre briques banales : [Eleventy](https://www.11ty.dev/), [Lit](https://lit.dev/), esbuild et Caddy. Voici comment faire qu'un tas de fichiers statiques se comporte comme un OS sans mentir à un moteur de recherche.

La plupart des développeurs prennent un template de portfolio minimal, changent la couleur d'accent, et appellent ça une personnalité. Je passe dix heures par jour dans **Ghostty + tmux + neovim**, Catppuccin Mocha gravé à vie dans la rétine, donc au moment de construire mon propre site, la seule option honnête était d'expédier la chose dans laquelle je vis vraiment.

Donc le site web *est* le terminal. Pas une capture d'écran de celui-ci. Pas un thème CSS qui fait semblant. Une fenêtre déplaçable, des onglets façon tmux, une palette de commandes `:`, des numéros de ligne tout le long de la marge : tout l'attirail, qui tourne dans un onglet de navigateur. C'est le premier article du nouveau site, et l'histoire de sa construction, avec une décision architecturale planquée dedans que je rentabiliserai plus tard.

![Le flux du blog comme une fenêtre de terminal : onglets, statusline, et la palette de commandes `:`, tout ça dans un onglet de navigateur.](/assets/content/screenshots/web-blog.webp)

## La stack est banale, et c'est voulu

Pas de framework du mois. Pas de bundle d'hydratation de 400 Ko. Tout ça tient en quatre pièces mobiles :

- **[Eleventy](https://www.11ty.dev/) 3** transforme du Markdown et du Nunjucks en HTML statique.
- **[Lit](https://lit.dev/) 3** apporte l'interactivité via des web components.
- **esbuild** bundle le TypeScript.
- **Caddy** sert le résultat, même si un CDN comme GitHub Pages ferait tout aussi bien l'affaire.

Les décisions intéressantes n'étaient pas *quoi* utiliser. C'était comment faire qu'un tas de fichiers statiques se comporte comme un système d'exploitation sans mentir à un moteur de recherche.

## Trois fenêtres de profondeur

L'illusion s'empile sur trois niveaux :

1. Un **bureau** : fond d'écran, icônes d'applications, la statusline en bas.
2. Une **fenêtre de terminal** : déplaçable, redimensionnable, trois modes d'affichage (fenêtré, pleine page, plein écran).
3. Des **onglets et panneaux façon tmux** qui vivent *à l'intérieur* de cette fenêtre, avec <kbd>Alt</kbd>+<kbd>1-5</kbd> pour basculer.

Chaque couche est son propre web component. Aucune ne possède le contenu. Cette séparation est toute l'astuce, et c'est la partie que la plupart des sites « sophistiqués » ratent.

![La page des projets, trois couches de profondeur : bureau, fenêtre de terminal déplaçable, et onglets façon tmux qui vivent à l'intérieur.](/assets/content/screenshots/web-projects.webp)

## Light DOM, ou : comment être malin sans devenir invisible

Le péché capital du site perso sur-ingénieré, c'est de tout rendre côté client, si bien que Google voit un `<body></body>` et un spinner. Je voulais à la fois le cosplay de terminal *et* le SEO d'une page HTML toute bête. On peut avoir les deux dès qu'on arrête de cacher son contenu dans des shadow roots.

Donc le texte réel (chaque projet, chaque article de blog, cette phrase) est rendu par Eleventy dans le **light DOM**, comme du HTML ordinaire et indexable. Les web components ne *contiennent* pas le contenu : ils l'**enrichissent**. `<sz-markdown>` enveloppe du vrai balisage et le décore à l'exécution : coloration syntaxique, glyphes de titre, marge à numéros de ligne. Coupez le JavaScript et vous obtenez toujours un document lisible et indexable. Lancez-le, et le même document fait pousser un terminal autour de lui.

L'amélioration progressive n'a rien de rétro. C'est juste la version d'« interactif » qui survit à un réseau capricieux et à un robot d'indexation qui n'exécute pas votre JS.

## La partie la plus dure, c'était un seul chiffre

Je vous épargne le temps que j'ai perdu : la partie vraiment brutale de cette construction n'était ni le gestionnaire de fenêtres, ni la palette, ni le thème. C'était faire s'aligner les numéros de ligne.

render-markdown.nvim pose des numéros dans la marge de gauche, et chaque ligne de contenu repose sur un rythme vertical fixe. Pour reproduire ça sur le web, **la hauteur de chaque élément doit être un multiple exact d'une ligne.** Une seule unité de grille, et toute la page s'aligne sur elle :

![Un article rendu avec des numéros de ligne dans la marge : chaque élément calé sur une grille à une seule ligne, comme le fait render-markdown.nvim.](/assets/content/screenshots/web-reader.webp)

```css
:root {
  --sz-font-size: 13px;
  --sz-line-height: 1.6;
  --sz-line-px: calc(var(--sz-font-size) * var(--sz-line-height));
}
```

Ensuite j'ai essayé de compter les lignes en mesurant `scrollHeight` et en divisant par la hauteur de ligne, et j'ai obtenu **des milliers** de lignes fantômes. Le piège :

> `getComputedStyle().lineHeight` peut vous renvoyer `"1.6"`, un multiplicateur sans unité, au lieu de `"20.8px"`. Divisez une hauteur en pixels par `1.6` et votre marge croit que la page fait un kilomètre de long.

Il faut résoudre ce ratio par rapport à la taille de police vous-même avant de diviser. Une confusion d'unité, des heures de « pourquoi il y a un numéro 4 812 ».

Les tableaux étaient leur propre enfer personnel. Chaque filet horizontal doit occuper une ligne entière d'espace vertical, sinon toute la grille dérive. Les bordures n'y suffisent pas : une bordure de 1px fait 1px, pas 20,8. La solution consiste à *peindre* les filets avec un `linear-gradient` positionné à des décalages en pixels exacts, pour que les lignes tombent sur la grille au lieu de décaler tout ce qui suit :

| Élément         | Approche naïve   | Pourquoi ça cassait      |
|------------------|------------------|---------------------------|
| Texte courant    | line-height: 1.6 | sans unité ≠ pixels       |
| Filets de tableau| bordure 1px      | 1px ≠ une ligne de grille |
| Titres           | margin: 1em      | em ≠ multiple de la grille|

Tout participe à la grille, ou rien n'y participe. Il n'y a pas de « presque aligné ».

## Une seule source, prête pour un second moteur de rendu

Voici la décision que je rentabiliserai plus tard : aucune ligne de code de mise en page ne touche au *contenu*. Les projets et les articles sont du Markdown et du JSON tout simples dans un dossier `content/` que ce build Eleventy lit à la compilation. Le moteur de rendu et les données sont totalement découplés, ce qui veut dire qu'*un autre* moteur de rendu pourrait lire le même dossier et servir le même site ailleurs, entièrement différemment. Je n'ai pas encore de second front-end. Mais j'ai construit celui-ci pour que le jour où j'en veux un, je n'aie à réécrire ma bio zéro fois supplémentaire.

## Ça valait le coup ?

Tout le terminal, gestionnaire de fenêtres, onglets, palette, moteur de thème, la grille qui a failli m'achever, pèse environ **19 Ko gzippés** une fois bundlé. Moins que l'image de héros de la plupart des templates de portfolio, et nettement plus amusant à entretenir qu'une grille de cartes de plus.

Réimplémenter tmux en CSS était-ce un usage raisonnable d'un week-end ? Non. Le referais-je ? Quasi certainement. Et maintenant que le contenu vit dans son dossier découplé, je me demande déjà quoi *d'autre* pourrait le rendre.

---

*Source : [github.com/monkeymonk/stephan.zych.be](https://github.com/monkeymonk/stephan.zych.be). Le terminal n'est pas un thème ici, c'est le site.*
