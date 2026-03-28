---
layout: project.njk
title: MyTribuNews — Scaling an automated magazine platform
description: A responsive Vue.js magazine compositor backed by infrastructure built to survive exponential growth — massive uploads, load balancing, and a Redis task system.
tags: [vue, frontend, architecture, scaling]
---

**MyTribuNews** turns user-uploaded content into automatically generated magazines. The catch: when thousands of people generate magazines at once, naïve infrastructure falls over — and the product had just been named *Startup of the Year*, so the traffic was real.

<iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/-0qingwt_Sw" title="My Tribu News" allowfullscreen></iframe>

## The challenge

Handle large-scale uploads, concurrent connections, and CPU-heavy magazine generation for thousands of simultaneous users — without generation times ballooning or the platform going dark under peak load. And it had just been named *Startup of the Year*, so the traffic was real.

## What we built

The heart of the product is a **magazine compositor** I built in **Vue.js** — an in-browser editor where users assemble their own magazine from their photos and text. It had to feel immediate and stay **fully responsive**, working as well on a phone as on a desktop, while swallowing **massive uploads** — whole albums at a time — without freezing the interface or losing a layout in progress.

- A component-driven **Vue.js** editor for arranging pages, photos, and copy
- **Mobile-first and responsive** — the same composition experience on phone, tablet, and desktop
- Resilient handling of **large batch uploads** straight from the composer
- Tightly coupled to the generation pipeline, so what you compose is exactly what gets produced

Behind it, we moved the platform onto a horizontally scalable architecture:

- **Microservices** splitting the heavy generation work from the user-facing app
- A **Redis-backed task system** for real-time job queuing and orchestration
- **Load balancing** across **parallel worker servers** so generation scales out instead of up
- A cloud migration to make all of the above elastic under spiky demand

## My role

The frontend — the **Vue.js** compositor and its upload flow — plus architectural direction on the front-of-house side.

## Outcome

Magazines kept generating within hours even as usage grew exponentially, and the platform held performance and availability through its peaks. The result: an editor people actually enjoyed using, and a system that scaled with the company instead of against it.
