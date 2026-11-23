---
layout: post.njk
title: "Le bandeau de cookies a toujours été facultatif"
description: "Je voulais des statistiques de visite sans bandeau de consentement. Le truc n'était pas un cookie malin. C'était de supprimer le JavaScript : Caddy journalise les requêtes, masque l'IP à la périphérie, et GoAccess transforme le journal en tableau de bord. Pas de cookies, pas de tiers, pas de bandeau."
date: 2026-06-26
tags: [privacy, caddy, goaccess, umami, analytics]
poster: /assets/content/goaccess-dashboard.webp
ogImage: /assets/content/goaccess-dashboard.jpg
---

> **En bref :** Vous n'avez pas besoin d'un bandeau de cookies pour savoir quelles pages les gens lisent. Les bandeaux existent parce que les trackers *stockent quelque chose sur l'appareil* ; si vous ne stockez rien, il n'y a rien à consentir. Donc mes statistiques ne stockent rien dans votre navigateur : **Caddy** écrit un journal d'accès avec l'IP du visiteur déjà masquée (`ip_mask`, dernier octet mis à zéro), **GoAccess** transforme ce journal en tableau de bord servi derrière une authentification basique à `/_stats`, et le seul script embarqué dans le navigateur que j'ai *vraiment* fini par ajouter (**Umami** auto-hébergé, quelques jours plus tard) n'écrit rien sur l'appareil non plus. Deux pièges que les démos passent sous silence : Caddy journalise l'IP dans *deux* champs, et le rapport de GoAccess a besoin de `'unsafe-eval'`, les deux corrigibles dans le `Caddyfile`.

Chaque tutoriel d'analytics commence pareil : déposez ce `<script>` dans votre `<head>`, puis boulonnez un bandeau de consentement pour être autorisé à le faire. Le bandeau est la partie que personne ne veut : la modale, la chasse au dark pattern « Tout refuser », le texte juridique qu'on copie-colle d'un générateur et qu'on ne lit jamais.

Alors j'ai posé la question idiote. *Pourquoi le bandeau est-il là, au fond ?*

## Le bandeau n'a jamais vraiment porté sur les cookies

Les bandeaux de consentement viennent de la **directive ePrivacy**, pas du RGPD lui-même, et ePrivacy est précise : il vous faut un consentement pour *stocker ou lire des informations sur l'appareil de l'utilisateur*. Cookies, `localStorage`, une empreinte planquée dans IndexedDB, tout ce qui touche au terminal devant le visiteur.

Retournez ça et l'exemption devient évidente. **Ne stockez rien sur l'appareil, et il n'y a rien pour quoi demander la permission.** Pas de bandeau. Pas comme une faille : il n'y a simplement aucun événement de stockage à consentir.

Il y a un piège, et c'est la moitié RGPD : une **adresse IP est une donnée personnelle**. Donc « ne rien stocker sur l'appareil » vous sort du bandeau, mais vous ne pouvez toujours pas vous asseoir sur un tas d'IP brutes et appeler ça privé. Il faut ne pas *garder* la partie identifiante. Cette seule contrainte décide de toute l'architecture.

## Supprimer le JavaScript plutôt

Voici le coup : la chose qui voit déjà chaque requête, le serveur web, sait déjà aussi écrire ce qu'elle a vu. Mon site tourne derrière **[Caddy](https://caddyserver.com/docs/caddyfile/directives/log)**, donc tout le « tracker » est un bloc `log`.

```caddyfile
log {
	output file /logs/access.log {
		roll_size 10MiB
		roll_keep 5
		roll_keep_for 720h
	}
	format filter {
		wrap json
		fields {
			request>remote_ip ip_mask { ipv4 24  ipv6 32 }
			request>client_ip ip_mask { ipv4 24  ipv6 32 }
		}
	}
}
```

Le mot porteur, c'est **`ip_mask`**. Il met à zéro le dernier octet de chaque adresse IPv4 (et les bits bas de l'IPv6) *avant que la ligne ne soit écrite sur disque*. `81.246.12.137` devient `81.246.12.0`. Le masquage se fait à la périphérie, donc une IP complète n'atterrit jamais dans un fichier, ne reste jamais dans une sauvegarde, n'attend jamais d'être réclamée par une assignation. Le journal brut naît anonyme.

Puis **[GoAccess](https://goaccess.io/)** lit ce journal et rend un tableau de bord (visiteurs, pages principales, référents, navigateurs, codes de statut, bande passante). Il embarque un format Caddy prédéfini, donc le pointer vers le journal est un seul flag :

```bash
goaccess /logs/access.log -o /logs/report.html --log-format=CADDY
```

Je le fais tourner en boucle dans un minuscule conteneur sidecar et laisse Caddy servir le `report.html` résultant derrière une authentification basique HTTP à `/_stats`. Pas de base de données, pas de SaaS, pas de second domaine, pas de script sur la page. Le tableau de bord ressemble à ça :

![Le tableau de bord GoAccess : des cartes de vue d'ensemble, les visiteurs par jour, et un graphique des URL demandées, chaque IP masquée à un .0.](/assets/content/goaccess-dashboard.webp)

## Masquez l'IP deux fois, ou vous n'avez rien masqué

Voici la première chose que la version propre ci-dessus ne vous dira pas. J'ai masqué `remote_ip`, je me suis félicité, puis j'ai vérifié la ligne de journal réelle :

```json
"remote_ip": "172.29.0.0",
"client_ip": "172.29.0.1"
```

Caddy émet l'adresse du client dans **deux** champs. `remote_ip` est le pair du socket ; `client_ip` est le client résolu après tout proxy de confiance, et **GoAccess lit `client_ip`**. Donc masquer seulement le premier champ me donnait un journal qui *semblait* anonymisé, un tableau de bord qui affichait la vraie IP, et un faux sentiment de sécurité. Masquez les deux, ou vous n'en avez masqué aucun. (Cette seconde ligne `request>client_ip` ci-dessus fait le vrai travail.)

C'est le genre de bug qu'on ne découvre qu'en lisant une ligne de journal brute plutôt qu'en faisant confiance à la config pour signifier ce qu'on espérait. Je l'ai attrapé parce que j'ai regardé.

## Ce que les journaux peuvent et ne peuvent pas vous dire

Les journaux serveur ne sont pas gratuits. Ils ne peuvent vraiment rien voir de ce qui se passe *dans* le navigateur, parce que rien dans le navigateur ne rapporte quoi que ce soit. C'est tout le point, et c'est aussi la limite :

| Vous obtenez | Vous n'obtenez pas |
| --- | --- |
| Visites de pages et assets, dans le temps | Taux de rebond, profondeur de scroll |
| Pages principales, référents, codes de statut | Vraie durée de session |
| Famille de navigateur / OS, bande passante | Taille d'écran, pixels de l'appareil |
| Crawler vs trafic plutôt humain | Visiteurs nouveaux vs récurrents fiables |
| Visiteurs uniques **approximatifs** | Funnels et événements par utilisateur |

« Approximatif » est porteur. Avec le dernier octet masqué et sans cookie pour relier les requêtes entre elles, un « visiteur unique » est une heuristique sur une IP masquée et un user-agent, pas une personne qu'on peut suivre de jour en jour. Ce n'est pas un défaut à excuser. C'est le compromis. Le flou est *pourquoi* il n'y a pas de bandeau. Si vous avez besoin de savoir que l'utilisateur n°4837 est revenu mardi et a rage-quitté le checkout, ce n'est pas votre outil, et vous allez vous retrouver à cliquer « Tout refuser » sur votre propre site.

## Le piège du CSP strict que les démos passent sous silence

Deuxième chose que personne ne mentionne : le rapport de GoAccess se rend côté client, et son JavaScript embarqué utilise `eval`. Mon site expose une Content-Security-Policy délibérément stricte (`script-src 'self'`, pas de `'unsafe-eval'`, aucune exception). Donc le rapport se chargeait, tournait sa petite roue de chargement, et finissait sur `NO AUTHENTICATION PROVIDED.` avec une erreur console :

```
EvalError: Evaluating a string as JavaScript violates the following
Content Security Policy directive ... 'unsafe-eval' is not an allowed source
```

Je ne voulais *pas* enfoncer `'unsafe-eval'` dans ma politique globale pour satisfaire une seule page interne. Le correctif est de limiter le relâchement à la seule route des statistiques. Le site public garde son CSP strict, et le chemin `/_stats` protégé par authentification reçoit sa propre politique assouplie :

```caddyfile
handle /_stats* {
	basic_auth { ... }
	header Content-Security-Policy "default-src 'self'; \
		script-src 'self' 'unsafe-inline' 'unsafe-eval'; \
		style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:"
	# ... servir report.html
}
```

Les blocs `handle` rendent ça propre : un chemin, une politique, aucune fuite vers les pages que les vrais visiteurs voient réellement.

## Les deux sites qui ne peuvent pas lire un journal

GoAccess fonctionne parce que Caddy voit chaque requête vers ce site. Mais je fais tourner deux cousins (mon [site d'entreprise](https://stephanzych.be) et le site d'un studio de jeu) comme des builds statiques sur **GitHub Pages**. Pas de Caddy là-bas, pas de journal d'accès à masquer, rien vers quoi pointer GoAccess. Donc le bandeau revient-il ?

Non, parce que la règle n'a jamais été « pas de JavaScript », c'était **ne rien stocker sur l'appareil**. « Supprimer le script » est juste la façon la plus propre d'honorer ça *quand on possède le serveur*. Quand ce n'est pas le cas, vous pouvez toujours livrer un script qui ne stocke toujours rien. C'est **[Umami](https://umami.is/)** : sans cookie par défaut (pas de cookies, pas de `localStorage`, pas d'empreinte), donc la même exemption ePrivacy s'applique. Pas de bandeau, pour la même raison qu'avant.

La bonne partie, c'est que je ne confie mes visiteurs à personne. Umami est auto-hébergé : un conteneur de plus à côté de ce site, son propre Postgres, reverse-proxyé par le même Caddy à `analytics.zych.be`. Sans cookie, un seul domaine, le mien.

```caddyfile
{$ANALYTICS_ADDRESS} {
	reverse_proxy umami:3000
}
```

Chaque site ajoute une balise (pas de code de cookie, pas d'état de consentement à gérer) :

```html
<script defer src="https://analytics.zych.be/script.js"
        data-website-id="…"></script>
```

Ce script a le droit d'exister *à cause de ce qu'il refuse de faire*. Il ne pose aucun cookie et n'écrit rien dans `localStorage` ; pour distinguer deux visiteurs, il demande au **serveur** de hasher le sel tournant du jour avec l'IP et le user-agent, puis jette ce hash et le régénère chaque nuit. Donc Umami peut distinguer deux visites **aujourd'hui** et n'a aucun moyen de savoir qu'elles étaient la même personne **hier** : l'IP brute n'est jamais stockée, la même contrainte que le journal masqué applique depuis l'autre bout.

Ce que vous achetez avec cette balise, c'est tout ce qu'un journal serveur ne peut *structurellement* pas voir : toute la colonne « vous n'obtenez pas » du tableau ci-dessus. Elle tourne dans le navigateur, donc elle rapporte ce que le navigateur sait :

| Umami ajoute (tourne dans le navigateur) | Toujours pas | 
| --- | --- |
| Taille d'écran et classe d'appareil | Qui vous êtes de jour en jour |
| Vrais référents et tags UTM | Une identité cross-site cookiée |
| Taux de rebond et durée de visite | Quoi que ce soit après fermeture de l'onglet |
| Événements personnalisés que vous choisissez de déclencher | Un nom, un e-mail, un compte |
| Pages d'entrée/sortie et parcours par visite | Une empreinte pour vous retrouver |

![Le tableau de bord Umami auto-hébergé pour ce site : visiteurs, visites, vues, taux de rebond et durée de visite sur 30 jours, tirés d'une balise sans cookie. Aucun cookie posé, aucun bandeau affiché.](/assets/content/umami-dashboard.webp)

Je pointe *ce* site vers lui aussi, donc les trois atterrissent dans un seul tableau de bord. GoAccess reste. Il lit une vérité côté serveur (crawlers, chaque requête, zéro JS) qu'une balise ne peut pas voir, et ça ne coûte rien à garder. Donc je fais tourner les deux : les journaux pour la vérité de terrain, Umami pour la vue lisible par un humain sur les sites qui ne partagent pas de serveur. Deux méthodes, une seule règle : rien stocké sur l'appareil, donc rien à consentir.

## Ça en vaut la peine ?

Pour un site personnel ? Complètement. J'obtiens un tableau de bord qui répond aux seules questions que j'avais réellement (*quels billets sont lus, d'où viennent les lecteurs*) sans bandeau insultant mes visiteurs, sans tiers dans le chemin de la requête, et sans taxe analytics au chargement de la page. Le coût est un bloc `log`, un conteneur sidecar, et accepter que mes compteurs de visiteurs soient honnêtes-mais-flous.

Le bandeau a toujours été facultatif. C'est juste que « déposez ce script » est plus facile à transformer en tutoriel que « supprimez le script et lisez vos journaux ». Si vous voulez la posture de confidentialité exacte que ça produit, elle est détaillée sur ma [page confidentialité](/privacy/), qui, assez logiquement, n'a rien dont se désinscrire.

---

*Références : [la directive `log` de Caddy](https://caddyserver.com/docs/caddyfile/directives/log) et le [filtre de journal `ip_mask`](https://caddyserver.com/docs/caddyfile/directives/log#filter) ; [GoAccess](https://goaccess.io/) ; les [recommandations de la CNIL sur la mesure d'audience exemptée de consentement](https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/mesure-daudience). Les pièges du masquage d'IP et du CSP viennent de mon propre `Caddyfile`, appris de la façon dont la plupart des choses s'apprennent, en vérifiant ce qui s'est réellement passé plutôt que ce que je supposais.*
