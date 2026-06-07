---
target: filter sheet on ActivityScreen
total_score: 24
p0_count: 0
p1_count: 2
timestamp: 2026-06-07T02-12-46Z
slug: src-screens-activityscreen-tsx
---
## Design Health Score: 24/40

Key issues: catChip uses RADIUS.field (14) not RADIUS.chip (10). Fixed-width 48.6% chips vs content-sized pattern elsewhere. Three container patterns in one sheet with no visual hierarchy.

P1: Chip radius wrong token (RADIUS.field → RADIUS.chip)
P1: Chips hardcoded 48.6% width vs content-sized
P2: Three independent container patterns, no hierarchy
P2: Amount field value uses TYPE.subsectionTitle — too loud for secondary filter
P3: Sort/Date rows look like Settings.app anatomy
