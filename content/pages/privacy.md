---
layout: page.njk
title: Privacy — Stéphan Zych
heading: Privacy
description: How this site measures audience — cookieless, anonymized server logs, no third parties, no banner.
permalink: /privacy/
eleventyExcludeFromCollections: true
noindex: true
lineNumbers: false
---

Privacy notice — **STEPHAN ZYCH** · Governing law: Belgium (GDPR / RGPD)

## Controller

- **Controller:** [STEPHAN ZYCH (SRL)](https://stephanzych.be)
- **Registered office:** avenue de l'université, 101 — 1050 Ixelles, Belgium
- **VAT:** BE 0804.229.671
- **Contact:** stephan@zych.be

## No cookies

This site sets **no cookies** — none, for any purpose. There is no advertising, no social widget, and no third-party tracker on any page. Audience is measured on this site's own infrastructure (see below), and none of it stores anything on your device.

It does save **one functional entry in your browser's `localStorage`** (`sz-state-v1`) so the interface looks the way you left it. It records only the display preferences you choose yourself — the **theme**, the window/layout mode, reading-vs-code view, transparency, and ambient-sound on/off and volume. That data:

- never leaves your device — it is **not transmitted** anywhere;
- contains **no identifier** and is **not used to recognise or track you**;
- exists only to honour the settings you actively pick.

Because this storage is strictly functional and no cookie is ever set, **there is no consent banner**: under the ePrivacy rules, storage that is strictly necessary to deliver a preference you explicitly chose is exempt from consent. You can clear it at any time from your browser's settings.

## Audience measurement

Two self-hosted, cookieless systems measure which pages get read — across both ways of visiting this site, the browser and the SSH terminal. Everything runs on this site's own server: no data is sold, shared, or sent to any external service, and there is **no cross-site tracking** — there is no profile of you to follow anywhere.

### Server access logs

The web server's own access log, analyzed with **[GoAccess](https://goaccess.io/)**, a self-hosted open-source tool. The report is private and used solely to understand which pages are read.

- **What's measured:** pages requested, referring sites, browser/OS family, HTTP status codes, bandwidth, and request times — all aggregated.
- **Your IP address:** anonymized **at the moment of logging** (the last IPv4 octet / low IPv6 bits are zeroed). No full IP address is ever stored.
- **Retention:** raw anonymized logs are rotated and kept for a limited period (≈30 days); only aggregate counts persist beyond that.

### Umami

A self-hosted instance of **[Umami](https://umami.is/)**, an open-source analytics tool, running at `analytics.zych.be` — this site's own machine, not a third-party account. It loads one small script that records the page being viewed.

- **What's measured:** page path and title, referring site, browser / operating system / device family, screen size, browser language, and country of origin — all aggregated.
- **What it stores on your device:** *nothing.* It sets no cookie and writes nothing to `localStorage` or `sessionStorage`. The only device storage it touches is a **read** of an optional `umami.disabled` flag — set it to `1` in your browser's local storage and the script stops sending anything.
- **Do Not Track:** if your browser sends a **`Do Not Track`** signal, the script sends nothing at all — no page view, no event.
- **No identifier:** visits are grouped by a value computed on the server from a rotating salt. Nothing is stored on your side to recognise you by, and no personally identifying data is kept.
- **Retention:** aggregate counts are kept until deleted; they contain no identifying information.

### The SSH terminal

This site is also readable over SSH (`ssh stephan.zych.be`). Those sessions report into the same self-hosted Umami as the web front-end, so a page read in the terminal counts the same as one read in a browser.

- **What's measured:** the pages you open, your terminal's size, and how long the session lasted — all aggregated.
- **Your IP address:** **never sent.** Sessions are counted with a random identifier generated per connection and kept nowhere else.
- **What it stores on your machine:** nothing. Nothing is written to your device at any point.

**Legal basis:** legitimate interest (art. 6(1)(f) GDPR) in measuring audience, with a minimal, privacy-preserving design. Because neither system stores anything on your device, there is nothing to consent to — hence no banner.

## Your rights

You can object to this processing or ask what is held about you by emailing **stephan@zych.be**. You may also lodge a complaint with the Belgian Data Protection Authority (Autorité de protection des données).

## Embedded content

Some pages embed videos via **youtube-nocookie.com**, YouTube's privacy-enhanced mode, which does not store cookies until you press play. Those embeds are governed by Google's own privacy policy.

---

© Stéphan Zych — VAT: BE 0804.229.671 — stephan@zych.be
