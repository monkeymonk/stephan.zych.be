---
layout: post.njk
title: "WordPress Has a New Package Registry, and I'm Relieved"
description: "WPackagist got acquired, so Roots shipped WP Packages in four days. A short history of why anyone runs WordPress through Composer in the first place — and why the registry under it suddenly mattered."
date: 2026-04-14
tags: [wordpress, composer, php, tooling]
poster: /assets/content/packages-blocks.webp
---

> **TL;DR** — Running WordPress through **Composer** treats plugins as the dependencies they are — declared, pinned, locked, kept out of your repo. The registry that made it work, WPackagist, got acquired by a private-equity hosting company; [Roots](https://roots.io/) shipped **WP Packages** as a replacement in four days. Why you'd drag Composer into WordPress at all, and why owning the registry under your build matters.

There's a particular kind of developer who installs WordPress plugins by clicking a button in `/wp-admin`, and there's the kind who would rather eat glass. I am, regrettably, the second kind. Eighty percent of my PHP life is Laravel, but the WordPress jobs never stop coming — and the first thing I do on every one of them is rip out the plugin installer and replace it with a `composer.json`.

So when the plumbing under that workflow got *acquired* in March, I paid attention. Then [Roots](https://roots.io/) shipped a replacement in four days, and I'm writing about it, because the whole episode is a tidy little lesson in why you don't want a private-equity hosting company owning the registry your build depends on.

## First: why drag Composer into WordPress at all?

If you've only ever managed WordPress through the dashboard, this sounds like inventing problems. Let me make the case, because it's the whole reason the registry matters.

The default WordPress workflow treats your plugins and themes as *content*: you click "install," the file lands in `wp-content/plugins/`, and now it's part of your site the same way a blog post is. Which means it's either committed into your git repo — vendoring a few hundred megabytes of someone else's code you'll never read — or it isn't tracked at all and your "deploy" is somebody SFTP-ing into production at 11pm. I've inherited both. Neither is a system.

[Composer](https://getcomposer.org/) is PHP's dependency manager, and the move is to treat plugins like what they actually are: **dependencies**. You declare them, you pin them, you lock them, and the actual code stays out of your repo:

```json
{
  "require": {
    "wp-plugin/woocommerce": "^9.0",
    "wp-plugin/wordpress-seo": "^24.0",
    "wp-theme/twentytwentyfive": "^1.0"
  }
}
```

That `composer.lock` next to it is the part that earns its keep. It pins the *exact* resolved version of every plugin, so the site I build on my laptop is byte-for-byte the site CI builds is byte-for-byte the site that lands in production. No "works on my machine." No mystery about which WooCommerce point-release is live. The plugins themselves are `.gitignore`'d and reconstituted on deploy with one command:

```bash
composer install --no-dev --optimize-autoloader
```

This is the foundation [Roots' **Bedrock**](https://roots.io/bedrock/) has been preaching for a decade — WordPress restructured into a sane project layout where `wp-config` is twelve-factor environment variables and every dependency flows through Composer. Once you're there, the automation falls out for free: Dependabot opens a PR when a plugin ships a security patch, your CI runs the upgrade against your tests before it ever touches production, and a rollback is `git revert` plus a redeploy instead of a prayer. That's the pitch. That's why people do this.

## The catch: WordPress.org doesn't speak Composer

Here's the gap. The WordPress.org plugin and theme directory — tens of thousands of packages — is served over **SVN** and a bespoke API. It has never spoken Composer. So for any of the above to work, *something* has to sit in the middle, mirror the entire wp.org directory, and re-expose it as a proper Composer repository.

For eleven years, that something was **[WPackagist](https://wpackagist.org/)**.

Built in 2013 by [Outlandish](https://outlandish.com/), a UK developer co-op, WPackagist was quiet, load-bearing infrastructure — the kind nobody thinks about until it moves. It mirrored every plugin and theme, exposed them under `wpackagist-plugin/*` and `wpackagist-theme/*`, and that was the standard. If you ran WordPress through Composer, you ran it through WPackagist, full stop.

It also aged. Updates lagged the wp.org directory by something like 90 minutes — annoying when the version you need is a security patch that dropped twenty minutes ago. It still leaned on Composer v1's old `provider-includes` metadata, which makes Composer download fat index files before it can resolve anything. And it served *closed* plugins — ones wp.org had pulled for security or abandonment — with no warning, so `composer update` would cheerfully reinstall a plugin that had been yanked for a live CVE. Deferred maintenance, basically. Forgivable for a volunteer co-op project carrying the whole ecosystem on its back.

## Then it got acquired

In March 2026, **WP Engine** — a PE-backed WordPress host — acquired WPackagist.

You can argue the merits. What you can't argue with is the first thing they did: they pushed a notice through Composer's `info` field so that *"WPackagist is now maintained by WP Engine"* printed into every developer's terminal on every install. A small thing. A *telling* thing. The registry my automated builds depend on was now a billboard, owned by a company with a commercial interest in where my plugins come from, and they'd demonstrated on day one that they'd use my terminal as ad space. That's the moment a boring dependency becomes a liability.

## Roots shipped the answer in four days

[Ben Word](https://roots.io/) — the Roots guy, the Bedrock/Sage/Trellis guy — apparently saw this coming. He'd quietly started building a WPackagist replacement back in August 2025. When the WP Engine deal landed, he just... shipped it. **March 16, four days after the acquisition**, fully open source on GitHub.

It launched as "WP Composer," and then immediately hit the most on-brand snag imaginable: **Nils Adermann — co-creator of Composer itself** — reached out to point out that the name was both confusing and stepping on a trademark. His note is worth quoting because it's a clean bit of API-design philosophy applied to *naming*:

> We just generally try to keep Composer referring to CLI/client side things and Packagist for the server/repository. Otherwise people just end up getting even more confused by these tools. Eg right now just based on the name I would expect WP Composer to be some Composer fork or plugin.

Fair. So WP Composer became **[WP Packages](https://wp-packages.org/)**, moved to `wp-packages.org`, and kept everything else. "Composer" is the client, "Packagist" is the registry — WP *Packages* sits correctly on the registry side of that line. I appreciate a project that takes naming notes from the person who literally invented the thing.

## What you actually get

This isn't a like-for-like clone with a new owner. It's the thing WPackagist would be if someone had maintained it:

- **~17× faster cold resolves.** WP Packages speaks Composer v2's `metadata-url` protocol, so Composer fetches metadata *only* for the packages your project names instead of downloading the whole index first. The number Roots quotes — 0.7s vs 12.3s to resolve ten plugins cold — matches what I've seen. On a CI runner with no cache, that gap is your pipeline time.
- **Five-minute sync** with wp.org, down from ~90. When a plugin ships a security release, it's installable almost immediately.
- **Sane namespaces.** `wp-plugin/*` and `wp-theme/*`, no `wpackagist-` prefix cluttering your `require` block.
- **It respects closed plugins.** When wp.org pulls a plugin, WP Packages drops it — so Composer *can't* silently reinstall a yanked, vulnerable version. This one's a genuine security upgrade, not a nicety.
- **Fully open, top to bottom.** Application code, docs, *and the Ansible deploy config* are public. You can stand up your own WordPress Composer registry from the same recipe. And Ben's committed, publicly, to never piping ads or upsells through the Composer `info` field — which is the exact thing that started all this.

It's funded through GitHub Sponsors. Independent, the way this layer of infrastructure probably should be.

## Switching is one command

Pointing a project at it is the usual repository declaration:

```bash
composer config repositories.wp-packages composer https://repo.wp-packages.org
```

Which writes the same block you'd add by hand:

```json
{
  "repositories": [
    { "type": "composer", "url": "https://repo.wp-packages.org" }
  ]
}
```

Then `composer require wp-plugin/woocommerce` and you're off. Migrating an existing WPackagist project is a find-and-replace on the namespaces plus the new URL — Roots ships a script for it — and if you're on Bedrock or Radicle, the latest release already points there out of the box. I moved two client projects over in an afternoon; the diffs were boring, which is the highest compliment you can pay a migration.

## The part nobody's solved

The honest footnote: all of this exists because **WordPress.org still doesn't speak Composer natively**, eleven years into the workaround. Every word above is the ecosystem building a parallel distribution network around an `.org` that won't meet it where modern PHP lives. WPackagist papered over that for a decade; WP Packages papers over it faster and more honestly — but it's still paper over the same crack.

And the alternatives keep stalling. The [FAIR Package Manager](https://fair.pm/) effort — a federated, decentralized take on WordPress distribution — lost Joost de Valk and Karim Marucchi last month after hosting companies wouldn't fund it. So the realistic state of things this spring is: if you want professional, reproducible, automatable WordPress, you route it through Composer, and the best registry to route it through is now a four-day sprint from the Roots team rather than an asset on WP Engine's balance sheet.

I'll take it. Boring, fast, open, and it won't advertise at me from inside my own terminal. For infrastructure, that's the entire job description.

---

*Sources for the timeline and quotes: [Roots' launch announcement](https://roots.io/introducing-wp-composer-as-a-wpackagist-replacement/), [the WP Composer → WP Packages rename post](https://roots.io/wp-composer-is-now-wp-packages/), [WP Packages vs WPackagist](https://wp-packages.org/wp-packages-vs-wpackagist), [WordPress.org news coverage](https://wordpress.org/news/2026/03/wp-packages/), and [The Repository](https://www.therepository.email/roots-launches-wp-composer-as-open-source-alternative-to-wpackagist).*
