---
name: find-skills
description: "Find installable skills when the user asks to discover a skill or extend agent capabilities."
---

# Find Skills

Find a skill when the user asks for skill discovery or an extension of agent capabilities. Complete ordinary tasks with existing capabilities; a general "how do I" or "can you" request is not a skill-search request.

## Discovery

- Identify the requested capability and check whether an installed skill already covers it.
- For ecosystem discovery, use `npx skills find <specific-query>` and inspect the candidate's actual scope and source.
- Present only relevant candidates with their purpose, source link, and installation command. Do not infer quality or trust from a matching name.
- If no suitable skill exists, report that result and continue any separately authorised task using available capabilities.

## Installation

An explicit request to install the selected skill authorises installation. Use `npx skills add <owner/repo@skill>` with the requested scope. Add `-g` only for a user-level installation. Preserve existing skills and configuration.

Use `npx skills check` for requested update checks. Do not run a bulk update as part of discovery or a single-skill installation.
