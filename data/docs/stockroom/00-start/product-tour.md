---
title: Product tour
description: The screens a clerk uses to see stock and move parts.
order: 2
---

# Product tour

The home screen is a list of parts. Each row shows the shelf, the quantity on hand, and a bar when stock is low.

![Stock list on the Stockroom home screen](/api/media/4f8c1a20-6b14-4c3e-9a11-0c0ffee00001)

## What each button does

| Button | Where | What it does |
| --- | --- | --- |
| Receive | Dock | Adds parts from a delivery |
| Issue | Job | Removes parts for a job |
| Move | Shelf | Changes the shelf without changing the total |
| Recount | Aisle | Replaces the count after a physical count |

The low-stock bar uses the minimum set in [warehouse.yml](../02-platform/warehouse.yml). The tables behind the list are in [schema.sql](../02-platform/schema.sql).
