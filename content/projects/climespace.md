---
layout: project.njk
title: Climespace — Managing cooling for landmark buildings
description: A platform for building owners on district-cooling systems to track budgets, consumption, and equipment — including a schematic/graph view of their installations.
tags: [platform, frontend, backend, data-viz]
poster: /assets/content/climespace.webp
client: Climespace
role: Full frontend & part of the backend
---

**Climespace** runs district-cooling networks for major buildings — the kind of client list that includes the owners of the Louvre. We built **Mon Climespace**, a platform that lets those building owners manage their cooling budgets and consumption, and get a detailed read on their equipment.

![District cooling serves landmark buildings across Paris — here, the Place de la Concorde](/assets/content/climespace-landmark.webp)

## The challenge

Cooling at this scale is data-heavy and technical: owners need to see budgets and consumption clearly, but also understand their physical installations — which equipment is where, how it connects, how it performs. The hard part was making that legible.

## What we built

Delivered at Cherry Pulp:

- A client platform for tracking **budgets and consumption** across buildings
- Detailed analysis and reporting on each owner's cooling equipment
- A **schematic / graph view** of the installations, so technical equipment reads at a glance

## My role

I built the **whole frontend** and a good part of the **backend** — including the schematic/graph implementation that turns the installation data into a visual the owners can actually reason about.

## The interesting part

The **schematic/graph view** was the piece that mattered most. Cooling installations are physical, spatial, and hierarchical — equipment connected in specific sequences with specific relationships — and the brief was to render that as something a building owner (not a technician) could actually read. Turning structured equipment data into a legible graph layout, with meaningful visual hierarchy, was the core design and engineering problem here.

## Outcome

Building owners got a single place to manage cooling budgets, consumption, and equipment, with their installations rendered as a clear visual schematic rather than a spreadsheet.
