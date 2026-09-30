---
name: delegate
description: Hand a job to a Platform Center building. Usage /delegate <building> <job>, for example /delegate Pixel draft three launch posts or /delegate Wicket fix the Crease Cam menu on phones
allowed-tools: mcp__plugin_ruflo-core_ruflo__memory_retrieve mcp__plugin_ruflo-core_ruflo__memory_store mcp__plugin_ruflo-core_ruflo__task_create
---
$ARGUMENTS

Delegate a job from Nova (the manager) to one building in the Platform Center.

1. Read $ARGUMENTS as `<building> <job>`. The first word is the building's name (for example Forge, Pixel, Atlas, Sol, Ledger, Cog or Wicket, or any building nic has added). A building can also be named by its place, so "Crease Cam" means Wicket. Everything after it is the job. If either part is missing, ask for it and stop.
2. Call `mcp__plugin_ruflo-core_ruflo__memory_retrieve` with `namespace: "platform-center"` and `key: "city"` and find the building by name or place (case does not matter). If it is not there, list the building names you do find and stop.
3. Call `mcp__plugin_ruflo-core_ruflo__task_create` with the job as the description, prefixed with the building name in brackets, for example `[Pixel] Draft three launch posts`, and tags `platform-center` and the building's name in lowercase.
4. If this plugin has an agent with the building's name in lowercase (nova, forge, pixel, atlas, sol, ledger, cog, wicket), start that agent on the job. Otherwise do the job yourself, working as that building's role from the city.
5. Tell nic to add the job in the Platform Center too, so the city shows it: open the building, go to the Tasks tab (called Updates in Crease Cam), and add it (or use the Delegate tab in Nova's HQ Tower).
