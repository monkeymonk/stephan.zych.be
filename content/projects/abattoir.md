---
layout: project.njk
title: Abattoir — A mobile app for Brussels' historic market site
description: A cross-platform Ionic React mobile app for Abattoir, the historic Anderlecht market and redevelopment site, backed by a Laravel API.
tags: [mobile, ionic, react, laravel, api]
poster: /assets/content/abattoir.webp
client: Abattoir
role: Full build — Ionic React app & Laravel API
---

**Abattoir** runs the historic market site in Anderlecht, Brussels — home to the **Foodmet** food hall, the Brocantemet flea market, a working meat-and-fish wholesale market, and an ongoing urban redevelopment. We built it a mobile app.

## The challenge

A century-old market site with many moving parts — markets, wholesalers, news, events, redevelopment — needed a mobile presence that put all of it in visitors' pockets, on both iOS and Android, without maintaining two separate native builds.

## What we built

Delivered at Cherry Pulp:

- A cross-platform mobile app built in **Ionic React** — one codebase for iOS and Android
- A **Laravel** API backend serving the app's content and data
- A single source of truth shared between the site's data and the app

<video src="/assets/content/abattoir.mp4" controls playsinline preload="metadata" poster="/assets/content/abattoir-still.webp"></video>

## My role

I built it end to end — the **Ionic React** mobile app and the **Laravel** API behind it.

## The interesting part

Cross-platform mobile development with **Ionic React** means writing once and shipping to both iOS and Android — but the abstraction layer has to hold up across two runtimes with different rendering engines, input models, and store requirements. The interesting judgement call was building an API-first backend in **Laravel** that served as a genuine single source of truth, so the mobile layer never had to decide which platform's data was authoritative.

## Outcome

Abattoir got one cross-platform app on a single codebase and API, rather than two native builds to keep in sync.
