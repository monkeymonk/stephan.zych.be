---
layout: page.njk
title: About — Stéphan Zych
heading: About
description: Lead developer, frontend architect, recovering CTO. Fifteen years building the web's unglamorous foundations — and having opinions about them.
permalink: /about/
---

<sz-neofetch user="{{ profile.identity.user }}" rows='{{ profile.identity.rows | dump }}'></sz-neofetch>

## The short version

Fifteen years turning *"can you just make it pop?"* into web platforms that survive contact with production. I co-founded a Brussels agency, **Cherry Pulp**, helped grow it from 6 to 20 people, shipped **200+ platforms**, and stuck around until it got acquired. These days I'm **Lead Developer at CBTW** — still suspiciously hands-on for someone with "lead" in the title.

## What I actually do

The unglamorous stuff that makes everyone else faster: architecture, tooling, conventions, developer experience. I build the boilerplates, CLIs, and standards that turn *"every project is a special snowflake"* into *"every project boots the same way and nobody cries on deploy day."*

Frontend is home turf — but I'm full-stack enough to be dangerous across the JavaScript and PHP worlds, and opinionated enough to tell you which one your project actually needs.

## The path so far

<sz-gitlog commits='{{ profile.timeline | dump }}'></sz-gitlog>

## By the numbers

<sz-stats counters='{{ profile.stats | dump }}' skills='{{ profile.skills | dump }}'></sz-stats>

A few names you might recognise, who trusted me not to break their websites: **Unicef · Oxfam · Engie · Delhaize · Telenet · KBC Brussels · RTL · RTBF · Monizze**. No pressure.
{% if wakapi %}
## Lately, at the keyboard

<sz-wakapi range="{{ wakapi.range }}" total="{{ wakapi.total }}" daily="{{ wakapi.dailyAverage }}" languages='{{ wakapi.languages | dump }}'></sz-wakapi>

Real coding stats from my self-hosted [Wakapi](https://wakapi.zych.link), baked in fresh on every deploy.
{% endif %}
## Plot twist

I didn't come up purely through computer science. I studied **fine arts** at the Académie Royale des Beaux-Arts de Bruxelles and visual narration at ERG, *then* landed at ULB doing computer science. Turns out composition, hierarchy, and obsessive attention to detail translate scarily well from a canvas to a component library. I still draw system diagrams like they belong in a gallery.

## Off the clock

- **AI-assisted workflows & local LLMs** — running models on my own hardware, because the cloud doesn't need to know *everything*.
- **A Docker-based homelab** — self-hosting is a personality trait now, apparently.
- **CLI utilities & terminal nerdery** — yes, this entire website is a terminal. No, I won't apologise. (I've even given the talk: *"Terminal utilities & advanced use cases."*)
- **Prototyping in Rust, Go, Python, and C#** — and building little games in **Godot** when I want pixels instead of pull requests.

## Why work with me

Because I've sat on both sides of the table. As a co-founder and CTO I learned that the code is the easy part — the hard part is scope, trade-offs, and building foundations a team can move fast on for years. You get someone who:

- **Thinks in systems, not tickets** — architecture, tooling, and conventions that keep paying off long after launch.
- **Has the receipts** — 200+ shipped platforms means I've already made (and fixed) most of the mistakes so your project doesn't have to.
- **Stays hands-on** — I don't draw the diagram and disappear; I'm in the codebase.
- **Translates** — I'll talk budget with your CEO and generics with your junior dev in the same afternoon.

## FAQ

<details>
<summary>Are you available for work?</summary>

Depends on the work. Interesting problem, decent humans, a little respect for craft? Let's talk — [email me](mailto:{{ site.email }}).

</details>

<details>
<summary>Frontend only, or full-stack?</summary>

Frontend is home turf, but I'm full-stack enough to be useful across the JavaScript and PHP worlds — and honest enough to tell you when you need a specialist instead of me.

</details>

<details>
<summary>WordPress? Really?</summary>

Really. Done properly — Bedrock, Sage, actual conventions — it ships institutional and editorial sites that non-developers can run themselves. The snobbery is a luxury most projects can't afford.

</details>

<details>
<summary>Why does your portfolio look like a terminal?</summary>

Because I like terminals, I had opinions, and "tasteful and forgettable" is the worse crime. While you're here, try typing <kbd>:</kbd> — or `:whoami`.

</details>

<details>
<summary>Can you work with my existing team?</summary>

That's most of what I do: raising the floor for a whole team through tooling, conventions, and mentoring — not just adding one more pair of hands.

</details>

## Say hi

I'm in Brussels 🇧🇪, I speak French natively and English professionally, and I'm always up for a good conversation about architecture, terminals, or why your build is slow. The fastest way is the [contact page](/contact/) — or type `:whoami` in the command palette to see who you're really talking to.
