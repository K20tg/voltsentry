---
trigger: always_on
description: File ownership boundaries — prevents three agents editing the same files
---

# Boundaries

Read `AGENTS.md` at the workspace root first. It is the full constitution for this project.

The single most important rule, repeated here because it is always on:

**Never create, edit, delete or move a file outside the folder this workspace's owner owns.**

- Person 1 owns `proxy/` and `tests/test_rules.py`, `tests/test_ml.py`, `tests/test_ocpp.py`
- Person 2 owns `simulator/`, `cli/`, `tests/test_battery.py`
- Person 3 owns `dashboard/`

`shared/schemas.py`, `CONTEXT.md` and `requirements.txt` are frozen for everyone.

Reading any folder for context is fine. Writing outside your folder is not. If a task
seems to require it, stop and tell the user — it is a three-person decision, not yours.

Do not run `git clean`, `git reset --hard`, or `git push --force`.
