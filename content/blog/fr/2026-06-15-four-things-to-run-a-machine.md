---
layout: post.njk
title: "Vous n'avez pas des dotfiles. Vous avez quatre problèmes."
description: "Gérer une machine n'est pas un seul métier. C'en est quatre, avec des exigences contradictoires. Voici le découpage où j'ai fini : un runtime shell non mutant, un provisionneur idempotent, des dotfiles publics, et une surcouche secretfiles privée chiffrée avec SOPS et age."
date: 2026-06-15
tags: [setup, dotfiles, sops, age, shell]
poster: /assets/content/four-repos.webp
ogImage: /assets/content/four-repos.jpg
---

> **En bref :** Un seul dépôt `dotfiles` fait en secret quatre métiers incompatibles. Je les ai donc séparés selon deux axes (*mutant vs non mutant* et *public vs privé*) en quatre dépôts avec trois contrats documentés : **runtime** (session shell, ne mute jamais l'état), **machines** (provisionneur idempotent, mute une fois), **dotfiles** (configs publiques + docs, surcouche nue sur `$HOME`), et **secretfiles** (la surcouche privée pour tout ce qui ne peut pas être générique : configs personnelles et plugins `runtime` privés, *plus* les identifiants chiffrés avec **SOPS + age**, la clé maîtresse jamais versionnée). Garder les trois premiers publics est la contrainte structurante. C'est ce qui les rend agnostiques, découplés et forkables. Les trois publics fonctionnent de bout en bout sans surcouche privée présente. L'absence de secrets est un état normal, pas un état dégradé.

Tout le monde commence son dépôt `dotfiles` de la même façon : un `.zshrc`, un `.vimrc`, peut-être un script de bootstrap. Puis ça grossit. Le script de bootstrap apprend à faire `pacman -S` sur deux ou trois choses. Le `.zshrc` démarre un démon en arrière-plan « juste sur cette machine ». Un `secrets.sh` apparaît, se fait passer à la moulinette `git-secret`, et maintenant la moitié du démarrage de votre shell est une roulette russe avec l'agent GPG. Deux ans plus tard, vous clonez ça sur un laptop neuf et découvrez que ça ne marchait que sur le laptop où c'est né.

Le dépôt s'appelle « dotfiles », mais ce nom est un mensonge. Ce n'est pas un tas de fichiers de config. C'est **le contrat d'exploitation complet d'une machine** déguisé en imperméable trop grand. Et la raison pour laquelle c'est douloureux, c'est que les métiers à l'intérieur ont des exigences *opposées*. Vous avez essayé de les satisfaire tous avec un seul mécanisme.

Donc j'ai arrêté. Voici le découpage où j'ai fini, pourquoi c'est quatre et pas un, et la partie que la plupart des billets « mes dotfiles » évitent complètement : comment les secrets fonctionnent réellement.

## Les deux axes que personne ne trace

Avant les dépôts, le principe. Prenez tout ce que fait votre « setup » et triez-le selon deux axes :

- **Ça mute l'état ?** Installer un paquet, activer une unité systemd, écrire un fichier hors du cache : c'est de la mutation. Définir une variable d'environnement, un alias, enregistrer un hook : non. La mutation se produit *une fois* et change la machine. La non-mutation se produit à *chaque shell* et ne change rien.
- **C'est public ou privé ?** Une config `starship` générique est publique. Votre clé de signature git, le token API de votre client, votre vraie configuration d'écrans avec le nom de votre machine dedans sont privés.

C'est un 2×2, et la chute, c'est que **chaque case veut un mécanisme différent**. Une chose qui tourne à chaque shell ne doit jamais muter, sinon votre connexion ralentit et votre machine dérive. Une chose qui provisionne la machine doit être idempotente et tourner à la demande, pas au démarrage du shell. Une chose publique doit être forkable par un inconnu. Une chose privée ne doit jamais fuiter dans la chose publique. Vous ne pouvez pas servir les quatre contraintes depuis un seul dépôt avec un seul workflow, et dès que vous essayez, vous obtenez le trio classique d'échec : **les secrets fuitent dans les configs publiques, votre shell mute votre système, et vous ne pouvez pas reproduire votre propre setup sur une nouvelle machine.**

Quatre cases, quatre choses :

| Chose | Rôle | Mute ? | Visibilité |
| --- | --- | --- | --- |
| **runtime** | session shell : env, alias, hooks | **jamais** | public |
| **machines** | provisionne la machine : paquets, unités | oui, idempotent | public |
| **dotfiles** | les vrais fichiers de config | non (juste des fichiers) | public |
| **secretfiles** | identité, clés, tokens | non (juste des fichiers) | **privé** |

Quatre dépôts, trois contrats (les points d'extension où ils se rencontrent), et une règle dure : **les trois publics doivent fonctionner de bout en bout sans la surcouche privée.** L'absence de `secretfiles` est l'état *normal* pour quiconque n'est pas moi, pas un état dégradé.

## Public par défaut comme contrainte structurante

Remarquez que trois des quatre sont publics. Ce n'est pas de la bravade. C'est la décision porteuse de toute la conception. Garder `runtime`, `machines` et `dotfiles` publics, ce n'est pas « partager mon setup » ; c'est une *discipline* qui impose trois propriétés que vous n'obtiendriez jamais de façon fiable d'un monorepo privé :

- **Agnostique.** Un dépôt public ne peut pas supposer votre nom de machine, votre nom d'utilisateur, votre liste de clients, votre chemin home. Dès qu'il le fait, vous l'avez divulgué. Donc les dépôts publics *doivent* être écrits de façon générique : les chemins viennent des conventions XDG, l'identité vient d'un `include`, les spécificités de la machine viennent de la surcouche. La frontière de confidentialité est ce qui impose la paramétrisation qui rend le setup forkable en premier lieu.
- **Découplé.** Chaque dépôt public doit tourner sans la surcouche présente. Cette seule règle tue le couplage caché : aucun dépôt public ne peut dépendre de l'existence d'un fichier privé, sinon il casse sur un clone propre. Parce que « pas de `secretfiles` » est un état supporté, les coutures entre les dépôts doivent être réelles et documentées, pas accidentelles.
- **Honnête.** Le code que vous savez lu par des inconnus s'améliore. Vous écrivez le README. Vous supprimez le plugin mort. Vous ne codez pas en dur le token « juste pour l'instant ». Le public est une revue de code permanente par une audience de tout le monde.

Ce qui reste, tout ce qui ne peut vraiment *pas* être rendu agnostique, c'est précisément ce qui définit `secretfiles`. La ligne public/privé n'est pas du secret pour le secret ; c'est la ligne entre *générique* et *spécifiquement vôtre*. Tracez-la honnêtement et une bonne architecture en découle comme effet de bord : le découplage, les contrats documentés, la forkabilité existent tous *parce que* la majorité a dû survivre à être publique.

## 1. runtime : le shell qui refuse de toucher votre système

`runtime` est le framework chargé à chaque shell interactif : il définit des variables d'environnement, des alias, enregistre des hooks, charge paresseusement des fonctions, mémoïse dans `~/.cache/`. Il vit dans `~/.config/runtime/` : un simple checkout git, comme `~/machines/`. (Deux clones que vous `git pull` ; les deux dépôts en surcouche de `$HOME` viennent après.)

Il a exactement une loi, et toute l'architecture tient à elle : **runtime ne mute jamais l'état persistant.** Pas d'installation de paquets. Pas de démons démarrés. Pas d'écriture dans `~/.config/` ou `$HOME`. Pas de bricolage systemd. Rien qui survive à la fermeture du shell.

Pourquoi si strict ? Parce que ce code tourne *des centaines de fois par jour*, dans chaque terminal, dans chaque session SSH, dans chaque script qui ouvre un shell de connexion. Tout ce qui mute depuis là est une mine : une connexion lente, un démon démarré deux fois, un fichier écrit depuis un contexte où il ne devrait pas l'être. Le coupable classique :

```sh
# BEFORE — a "plugin" that auto-starts a daemon at shell load
runtime_plugin_llama() {
    has_cmd llama-server || return 0
    [ "$AI_AUTOSTART" = "1" ] && llama-swap &   # ← forks a process on every shell
}
```

Ce `&` est le bug. Il mute l'état des processus depuis une chose qui tourne à chaque shell. La correction n'est pas de le verrouiller plus fort. C'est de reconnaître que le cycle de vie du démon n'a tout simplement pas sa place dans runtime :

```sh
# AFTER — runtime only sets env + aliases; systemd owns the lifecycle
runtime_plugin_llama() {
    has_cmd llama-server || return 0
    export LLAMA_HOST="${LLAMA_HOST:-127.0.0.1:8080}"
    alias llama-up='systemctl --user start llama-swap.service'
    alias llama-down='systemctl --user stop llama-swap.service'
}
```

Le démon part vers une unité systemd utilisateur. La préoccupation *récurrente/arrière-plan* quitte runtime. La préoccupation *installation* (ci-dessous) part aussi. Ce qui reste est une configuration de session pure, rapide, non mutante, et ça peut embarquer un `runtime-doctor` qui vous dit exactement quels plugins sont chargés, quels hooks se sont déclenchés, et si vos chargeurs de secrets sont en bonne santé, parce qu'il n'a jamais d'effets de bord à cacher.

## 2. machines : le provisionneur qui tourne une fois et le pense vraiment

Tout ce que runtime n'a pas le droit de faire, `machines` le fait. C'est un **applicateur de rôles idempotent** : `apply.sh --host workstation` résout une machine en une liste de rôles et exécute chacun. Installer git/age/sops. Activer des unités systemd. Créer des répertoires XDG. Chaque rôle est une recette sûre à exécuter cent fois : relancez-la et c'est un no-op.

```
apply.sh [--host HOST] [--dry-run] [--list] [--only ROLE]
```

Le choix de conception clé est **l'idempotence plutôt que les tags**. Il n'y a pas de flag `--public` / `--private`. Chaque rôle s'auto-détecte : quand la surcouche privée est absente, un rôle qui veut du contenu de surcouche (unités supplémentaires, env spécifique à la machine) affiche une ligne d'information et sort avec un code 0 au lieu d'échouer. Installez la surcouche plus tard, relancez `apply.sh`, et il récupère le nouvel état. Le contrat, c'est « code de sortie = vérité ». Un rôle possède sa propre cohérence ; l'applicateur ne fait qu'accumuler les succès/échecs et rapporter.

C'est la moitié de « dotfiles » qui n'a rien à faire au démarrage du shell, avec son propre home et son propre point d'entrée à la demande.

## 3 et 4 : l'astuce de la surcouche nue, et où vivent vraiment les secrets

Les deux derniers dépôts contiennent *des fichiers qui atterrissent dans `$HOME`* : vos vraies configs. Ils utilisent le motif [dépôt nu par-dessus `$HOME`](https://www.atlassian.com/git/tutorials/dotfiles) : un dépôt git dont l'arbre de travail *est* votre répertoire home, piloté via un alias.

```sh
alias dotfiles='git --git-dir=$HOME/.dotfiles --work-tree=$HOME'
alias secretfiles='git --git-dir=$HOME/.secretfiles --work-tree=$HOME'
```

`dotfiles` (public) contient les configs sans risque et le hub de documentation. `secretfiles` (privé) contient tout ce qui porte votre nom. La partie astucieuse, c'est qu'**ils se superposent sur le même `$HOME`**, et c'est comme ça qu'une config reste publique tandis que sa moitié sensible reste privée :

- `dotfiles` embarque `~/.config/git/config` avec `[include] path = ~/.config/git/user.local`.
- `secretfiles` embarque `~/.config/git/user.local` : votre nom, email, clé de signature.
- `dotfiles` embarque `monitors.kdl` via `include optional=true` ; `secretfiles` fournit le vrai `monitors.kdl` par machine. Présent → chargé. Absent → la config publique fonctionne toujours.

(Un petit piège quand deux dépôts nus se checkout dans le même `$HOME` : ils voudraient tous les deux un `README.md` à la racine. Donc celui du dépôt privé vit à `SECRETFILES.md` pour éviter la collision.)

Voilà pour la structure. Maintenant la partie qui compte vraiment.

## secretfiles : la surcouche privée (pas juste un coffre-fort)

Voici le piège à éviter : penser que `secretfiles` est « le dépôt de secrets chiffrés ». Ce n'en est pas un. C'est la **surcouche privée** : la maison pour tout ce qui a échoué au test du public-par-défaut, et la plupart de ça *n'est pas du tout un secret.* Deux types de contenu distincts vivent là, et les confondre, c'est comme ça que les gens sur-chiffrent des trucs anodins ou, pire, poussent des données personnelles vers un dépôt public parce que « ce n'est pas vraiment un secret ».

**Type un : privé mais pas secret.** Des configs et du code qui ne portent aucun identifiant, mais qui *révéleraient qui vous êtes et où*, ou sont simplement trop spécifiques pour jamais être génériques :

- `~/.config/git/user.local` : votre nom, email, clé de signature. Pas secret. Juste *vous*. C'est le fichier que la config publique `dotfiles` inclut via `include`.
- Les configs matérielles par machine : le vrai `monitors.kdl`, les profils d'affichage `kanshi` avec leurs sorties réelles. Inutiles à quiconque d'autre, et ils fixent votre configuration physique.
- **Les plugins et scripts `runtime` privés.** C'est celui que les gens manquent. Mon dépôt `runtime` est public et générique, mais j'ai des plugins comme `cherrylab.sh`, `workenv.sh`, `ai-capabilities.sh`, et un wrapper CLI `cherrylab` qui référencent des noms de clients, des noms de machines internes, et des workflows qui n'ont rien à faire dans un dépôt public. Ils ne sont pas chiffrés. Ce sont juste des scripts shell. Ils vivent dans `secretfiles` et sont *déposés* dans le répertoire de plugins de `runtime` comme une surcouche. Le framework public reste agnostique ; les extensions personnelles restent privées. Même chose pour un rôle `machines` privé (`niri-stack`, mon bundle de bureau CachyOS) qui se trouve dans le `roles/` de la surcouche et se résout automatiquement.
- `host.env` et `roles.list` pour ma vraie machine (le fichier qui dit que *cette* machine est `workstation` et exécute *ces* rôles).

Rien de tout ça n'est chiffré, parce que le chiffrement n'est pas le sujet pour ce type. La *visibilité* l'est. Ça compromettrait la vie privée, pas la sécurité, de publier ça. Le garder dans la surcouche privée est le mécanisme tout entier.

**Type deux : de vrais secrets.** Tokens, clés, identifiants. Ceux-là *sont* chiffrés au repos, parce qu'un « dépôt privé » n'est pas une stratégie de secrets : le dépôt est à une faute de frappe de `git remote add` de devenir public, et vous ne voulez pas que votre `~/.ssh/id_ed25519` traîne en clair quand ça arrivera. L'outillage est [SOPS](https://github.com/getsops/sops) + [age](https://github.com/FiloSottile/age).

La règle de frontière qui garde les deux bien distincts : **générique et forkable → dépôt public. Identifiant personnel → surcouche privée, en clair. Identifiant réel → surcouche privée, chiffré.** Un dépôt, deux modes de stockage, choisis selon *ce qu'est* le contenu.

### Les secrets, pour de vrai : SOPS + age

Donc les identifiants sont chiffrés au repos. Je venais de `git-secret` + GPG. Ça fonctionne. Ça traîne aussi des décennies de complexité GPG (porte-clés, agents, expirations, toile de confiance, certificats de révocation) pour un problème qui est juste « chiffrer quelques fichiers pour une personne ». SOPS + age échange tout ça contre :

- **Un seul modèle de clé.** Une seule paire de clés age. Aucun état de porte-clés, aucun `gpg-agent` qui décide qu'aujourd'hui est le jour où il oublie votre phrase de passe. age fait environ 1000 lignes, X25519 + ChaCha20-Poly1305, auditable en un après-midi.
- **Du chiffré qui se diff.** SOPS chiffre les *valeurs*, pas les fichiers entiers. Changez une variable et vous obtenez un diff d'une ligne. Vous pouvez relire *quel* secret a changé dans une PR sans que les valeurs ne soient jamais visibles.
- **Déchiffrement au point d'usage.** Les secrets vont directement dans des variables d'environnement, `ssh-agent`, ou la mémoire du SDK AWS. Pas de danse `reveal` / `hide` qui laisse du texte en clair éparpillé dans `$HOME`.

### L'architecture

Une paire de clés age est la maîtresse. La séparation qui rend le tout sûr :

- La clé **publique** va dans `.sops.yaml`, versionnée dans `secretfiles`. Pas sensible.
- La clé **privée** vit dans `~/.config/sops/age/keys.txt`, en mode `600`, et n'est **jamais versionnée, même pas dans le dépôt privé.** Elle existe sur disque, sur une clé USB hors ligne, et dans une note sécurisée de gestionnaire de mots de passe. C'est tout. Perdez-la et chaque secret disparaît ; divulguez-la et le chiffrement du dépôt privé devient sans objet. C'est la seule chose qui ne touche jamais git.

Un `.sops.yaml` à la racine du dépôt dit à SOPS pour qui chiffrer, donc `sops <file>` fait simplement ce qu'il faut :

```yaml
creation_rules:
  - path_regex: \.(env|ya?ml|json)$
    age: age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Deux styles de chiffrement, choisis selon le type de fichier :

| Type de fichier | Outil | Pourquoi |
| --- | --- | --- |
| `*.env`, `*.yaml`, `*.json` | **SOPS** | chiffre seulement les valeurs → les clés/structure restent diff-ables |
| clés SSH, certificats, blobs | **`age` brut** | se pipe directement dans `ssh-add`, pas d'enrobage YAML |
| identifiants AWS | SOPS + `credential_process` | déchiffré dans la mémoire du SDK, jamais sur disque |

### Modifier un secret

```sh
sops ~/.config/shell/secrets.env
```

Ça ouvre `$EDITOR` sur la vue *déchiffrée*, rechiffre à l'enregistrement. Vous ne manipulez jamais le chiffré à la main, et vous n'écrivez jamais un fichier en clair sur disque pour l'éditer. Commitez le résultat chiffré comme n'importe quoi d'autre :

```sh
secretfiles add ~/.config/shell/secrets.env
secretfiles commit -m "Rotate GITHUB_TOKEN"
secretfiles push
```

### Les faire entrer dans le shell, sans muter depuis le shell

C'est ici que l'architecture paie. Déchiffrer des secrets est une *mutation* (ça écrit un fichier déchiffré, ou touche l'agent), donc selon la loi de runtime ça **ne peut pas** se produire depuis un plugin shell. À la place, une **unité systemd utilisateur** en est responsable : `secrets-cache.service` déchiffre `secrets.env` une fois à la connexion vers un emplacement adapté au tmpfs, et le chargeur de runtime se contente de *sourcer* ce qui existe déjà, bruyant en cas d'échec (présent-mais-illisible et échec-de-sourcing avertissent fort tous les deux ; absent est silencieux, parce qu'absent est normal).

Les clés SSH fonctionnent de la même façon : `ssh-keys-load.service` parcourt `~/.ssh/*.age`, déchiffre chacune avec la clé maîtresse, et la pipe vers `ssh-add` (une fois, à la connexion, pas à chaque shell) :

```sh
for key in "$HOME"/.ssh/*.age; do
    age -d -i "$HOME/.config/sops/age/keys.txt" "$key" | ssh-add - 2>/dev/null
done
```

AWS n'obtient même jamais un fichier en clair : `~/.aws/credentials` déclare juste un `credential_process` qui lance `sops -d --extract` à la demande, donc le secret n'existe jamais que dans la mémoire du SDK pour la durée d'une requête.

### Une nouvelle machine, à partir de rien

C'est le test que toute cette conception existe pour réussir :

```sh
# 1. age private key — from the password manager, NEVER from a repo
mkdir -p ~/.config/sops/age
$EDITOR ~/.config/sops/age/keys.txt && chmod 600 ~/.config/sops/age/keys.txt

# 2. clone runtime + machines, then the bare overlays into $HOME
git clone https://github.com/monkeymonk/runtime.git ~/.config/runtime
git clone https://github.com/monkeymonk/machines.git ~/machines
git clone --bare git@github.com:monkeymonk/secretfiles.git ~/.secretfiles
secretfiles checkout

# 3. enable the units; secrets decrypt on demand from here on
systemctl --user enable --now secrets-cache.service ssh-keys-load.service
```

Pas de `git-secret reveal`. Pas de cérémonie d'import GPG. Collez une clé, clonez, checkout, terminé.

### Ce que ça protège, et ce que ça ne protège pas

Le chiffrement n'est pas un champ de force, et faire comme si c'était le cas, c'est comme ça qu'on se brûle :

- **Protège :** un dépôt privé divulgué (le chiffré est opaque sans la clé age), un `git diff` anodin (vous voyez quelles clés ont changé, pas les valeurs), un disque volé *si* le chiffrement intégral du disque est activé, parce que la clé age elle-même se trouve en clair sur disque, donc le FDE reste obligatoire.
- **Ne protège pas :** une session en cours compromise. N'importe quel processus tournant sous votre identité peut lire la clé age *et* les secrets déjà déchiffrés en mémoire. C'est exactement pour ça [que je fais tourner mes agents dans une boîte](/fr/blog/ai-agent-sandboxing/) : le chiffrement au repos et le sandboxing à l'exécution résolvent deux moitiés différentes du même problème.
- **La règle que le chiffrement ne peut pas sauver :** changer l'*outil* ne sécurise jamais un secret *déjà divulgué*. L'ancien chiffré vit dans l'historique git pour toujours ; si l'ancienne clé est un jour compromise, ces valeurs sont perdues. Donc quand vous migrez ou quand quoi que ce soit a pu fuiter, **faites tourner le secret sous-jacent en amont.** Nouveau token, nouvelle clé, tout neuf. Le chiffrement protège les valeurs que vous n'avez pas encore divulguées.

## Pour conclure : certaines choses ne sont pas du setup du tout

Une fois ces frontières tracées, vous commencez à remarquer des squatteurs. Des choses vivant dans vos « dotfiles » qui ne sont ni de la configuration, ni du provisionnement, ni des secrets sont des **outils** qui ont simplement grandi là par hasard.

Pour moi c'était `tips`, un petit agrégateur de conseils shell avec des fournisseurs enfichables (un fichier statique, des URLs distantes, un LLM local). Il avait son installeur, sa propre config, ses propres tests. Ce n'était pas une partie de mon *setup* ; c'était un *programme* que mon setup utilisait. Alors il a pris son indépendance : son propre dépôt, son propre `curl | bash` d'installation, forkable par n'importe qui, ne dépendant d'aucun de mes quatre.

C'est la vraie leçon, et elle se généralise au-delà de mes dépôts spécifiques. Un setup de machine n'est pas une seule chose, et ce n'est même pas quatre choses. C'est **un petit ensemble de dépôts de préoccupation avec des contrats propres, plus une constellation d'outils qui ont mérité leur indépendance.** La compétence, ce n'est pas l'ordre. C'est savoir qui est qui : ce qui mute vs ce qui charge, ce qui est vôtre vs ce qui est générique, et ce qui n'a jamais été du setup pour commencer.

Vous n'avez pas des dotfiles. Vous avez quatre problèmes et une boîte à outils. Nommez-les, et chacun devient facile.

---

*Les quatre dépôts vivent sur [github.com/monkeymonk](https://github.com/monkeymonk/) : `runtime`, `machines`, `dotfiles`, et le `secretfiles` privé. Ils sont en cours de nettoyage et de mise en forme forkable ; les liens deviennent publics à mesure que chacun bascule.*
