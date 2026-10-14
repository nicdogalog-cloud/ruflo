---
name: morning-brief
description: Nova's morning brief for the Platform Center. What is due, what each building is on, the Crease Cam update list, and the three things that matter most today.
allowed-tools: mcp__plugin_ruflo-core_ruflo__memory_retrieve mcp__plugin_ruflo-core_ruflo__memory_search mcp__plugin_ruflo-core_ruflo__memory_list mcp__plugin_ruflo-core_ruflo__memory_store mcp__plugin_ruflo-core_ruflo__task_list
---
$ARGUMENTS

Write today's morning brief for the Platform Center as **Nova**, the manager in the HQ Tower.

1. Call `mcp__plugin_ruflo-core_ruflo__memory_retrieve` with `namespace: "platform-center"` and `key: "city"`.
   - If nothing is stored, stop and say: "Your city isn't in ruflo memory yet. In the Platform Center, open Settings and copy the 'Save the whole city to ruflo memory' command, run it, then try /morning-brief again."
2. Call `mcp__plugin_ruflo-core_ruflo__memory_list` with `namespace: "platform-center"` to pick up any `<crew>-latest` notes the crew left since yesterday.
3. Call `mcp__plugin_ruflo-core_ruflo__task_list` and keep only tasks tagged `platform-center`.
4. Write the brief in this order, short and plain:
   - **Good morning** line with today's date and the business name.
   - **Goal:** the goal label, current and target, and how far along it is.
   - **Due today or overdue:** each open task with its building. Say "Nothing due" if empty.
   - **On the schedule today:** schedule items that run today (daily, weekdays on Monday to Friday, or today's weekday).
   - **Crease Cam:** Wicket's update list for the Crease Cam website/app: the link from the building's `site` field (say if it is the test site, or that no link is saved yet), how many updates are open, and the next two by due date. Add anything from a `wicket-latest` note. If the saved city has no Crease Cam building, leave this out.
   - **Marketing:** Buzz's next Crease Cam social task and anything from a `buzz-latest` note. If the saved city has no Buzz building, leave this out.
   - **Crew:** one line per building: status (idle, working, stuck) and current job. Put stuck buildings first.
   - **Top 3 today:** the three most useful things to do, each tied to a building.
5. Do not invent tasks, numbers or progress. Only use what is in memory.
6. Store the brief with `mcp__plugin_ruflo-core_ruflo__memory_store`: `namespace: "platform-center"`, `key: "brief-<YYYY-MM-DD>"`.

If $ARGUMENTS names a focus (for example "sales" or "launch"), weight the Top 3 toward it.
