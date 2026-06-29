---
layout: project.njk
title: Daoust — Four brand sites on one shared platform
description: A multi-site WordPress platform sharing a single theme across daoust.be, daconnect.be, dahome.be, and dajobs.be, wired into a distributed API that ties them together.
tags: [wordpress, api, frontend, integration]
poster: /assets/content/daoust.webp
---

**Daoust** is a Belgian HR and employment group — staffing, titres-services household help, and career management. Its presence spans four sites — **daoust.be**, **daconnect.be**, **dahome.be**, and **dajobs.be** — that needed to look and feel like one family.

## The challenge

Four brands, four sites, one identity. Each site has its own audience and content, but they had to share a consistent design and avoid being maintained as four disconnected codebases — with data flowing between them and a backend platform.

## What we built

Delivered at Cherry Pulp:

- Four sites — **daoust.be, daconnect.be, dahome.be, dajobs.be** — built on a **single shared WordPress theme**
- A **Laravel** application alongside them
- A **distributed API** connecting the sites and services

## My role

I built the shared **WordPress** theme that unifies the four sites, and implemented the **integrations wiring those sites into the distributed API** — the links that let content and data flow between the sites and the platform. I didn't work on the **Laravel** application or the API itself; my part was the connective layer between the websites and it.

## The interesting part

A single **WordPress** theme serving four distinct brand audiences is a specificity problem: the theme has to be flexible enough to express each brand individually, but structured enough that changes don't cascade unpredictably across all four sites. The integration layer added a second axis of complexity — frontend templates had to remain stable as data shapes and sources changed behind them through the **distributed API**.

## Outcome

Four Daoust brands now share one design and one platform — consistent to visitors, and far lighter to maintain than four separate sites. Live at [daoust.be](https://www.daoust.be).
