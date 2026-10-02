# ruflo-platform-center

Run a new business as a neon city. Each building is one part of the business, and each has a ruflo crew member who works there. Nova, the manager in the HQ Tower, writes a morning brief and hands jobs to the rest of the crew. Crease Cam, nic's cricket project, has its own stadium, where Wicket keeps the update list for the Crease Cam website/app, and Buzz runs Crease Cam's social media launch from the Marketing building.

The city itself is a web page at [`docs/platform-center/`](../../docs/platform-center/). It works on its own in a browser and saves as you go. This plugin gives the crew real agents and commands inside Claude Code.

## The starter city

These are placeholders for a new business. Rename, add or delete any of them in the city (open a building, then **Edit**).

| Building | Crew | Covers |
|---|---|---|
| HQ Tower | `nova` | Manager: morning brief, planning, delegating, Friday review |
| Workshop | `forge` | Building the product, website, tools, automations |
| Studio | `pixel` | Content, social posts, brand, marketing |
| Research Lab | `atlas` | Market, competitors, customers, product ideas |
| Storefront | `sol` | Offers, pricing, sales pages, outreach |
| Bank | `ledger` | Budget, costs, revenue, the monthly goal |
| Depot | `cog` | Suppliers, orders, delivery, checklists |
| Crease Cam (stadium) | `wicket` | nic's cricket project: the Crease Cam website/app, its link and update list |
| Marketing | `buzz` | Crease Cam's launch on Instagram, TikTok and YouTube: starter kit, promo videos, weekly posting plan |
| Meeting Hall | (everyone) | Weekly standup and Friday retro |

## Set up (once)

1. In Claude Code, add the marketplace and install the plugin:
   ```
   /plugin marketplace add nicdogalog-cloud/ruflo
   /plugin install ruflo-platform-center@ruflo
   ```
   The crew agents use ruflo's memory and task tools, so install `ruflo-core` too if you have not already.
2. In the city, open **Settings** (the menu button, top right) and copy the **Save the whole city to ruflo memory** command. Run it in a terminal in your project. Do this again whenever the city changes a lot.

## Use it

| Command | What it does |
|---|---|
| `/morning-brief` | Nova reads the saved city and writes today's brief: goal, what is due, the schedule, the Crease Cam update list, the crew and the top 3 for today |
| `/delegate Pixel draft three launch posts` | Creates a task for that building and starts its crew member on it |
| `/delegate Wicket fix the Crease Cam menu on phones` | Adds a change to the Crease Cam update list and starts Wicket on it |
| "Use the atlas agent to find 10 trending product ideas" | Talk to any crew member directly |

Every building in the city also has a **Ruflo** tab with copy-ready commands for that building (spawn an agent, create a task, save it to memory).

## Crease Cam

Crease Cam is added to every city, including one saved before it existed: the page adds the stadium on load without touching anything else, and it is saved with your next change. If you delete it, it stays deleted.

- **Now** shows the Crease Cam website/app link (the test site, `creasecam-test-u5t8ga.pages.dev`, to start with) and what needs updating. Use **Change link** when the live site or app has its own address.
- **Updates** is the update list: one task per change. Tick a change off once it is live.
- Nova can hand cricket jobs to Wicket from the **Delegate** tab, and the morning brief has a Crease Cam section.

## How it fits together

- The city page keeps the full picture: buildings, tasks, links, notes and schedules.
- Running the save command copies a compact version into ruflo memory (`namespace: platform-center`, `key: city`).
- The agents and commands read that memory, do the work, store a short `<crew>-latest` note and queue follow-ups as ruflo tasks tagged `platform-center`.

The agents never invent sales, numbers or results. If they need a fact they do not have, they ask.
