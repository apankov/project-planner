---
tags:
  - project
---

# Finance fixture

Tasks for checking the finance dashboard by hand. With the default 8 h/day,
calendar days and suggested dates included, these come to 14,875 of labour and
657.50 of materials — 15,532.50 in total. `finance-fixture.test.ts` pins that.

## Priced and dated

- [ ] Fit the sensor loom [hoursPerDay:: 6] [people:: Alice Smith 60%, Bob Jones 40%] [costs:: Loom kit 240, Travel 85] 🛫 2026-03-02 📅 2026-03-06 🆔 fin001
- [ ] Write the FAT report [hours:: 12] [people:: Alice Smith 100%] 🛫 2026-03-09 📅 2026-03-10 🆔 fin002
- [ ] Bench test [people:: Cara Diaz 50%; Bob Jones 50%] 🛫 2026-03-11 📅 2026-03-13 🆔 fin003

## Deliberately awkward

Shares that do not add up, somebody with no rate, somebody who is not in the
note at all, and a task with hours but nobody on it. All four should show up
under Problems rather than changing the total silently.

- [ ] Calibrate rig [hours:: 10] [people:: Alice Smith 60%, Bob Jones 30%] 📅 2026-03-16 🆔 fin004
- [ ] Sign off drawings [hours:: 4] [people:: Dan Fox 100%] 📅 2026-03-17 🆔 fin005
- [ ] Chase the supplier [hours:: 2] [people:: Nobody At All 100%] 📅 2026-03-18 🆔 fin006
- [ ] Tidy the bench [hours:: 3] 📅 2026-03-19 🆔 fin007

## No dates at all

Cost on this one rests entirely on a suggested bar, so it should be called out
in the total's caveat and disappear when suggested dates are excluded.

- [ ] Someday: rewrite the harness [hours:: 40] [people:: Alice Smith 100%] 🆔 fin008

## Materials only

- [ ] Buy the enclosure [costs:: Enclosure 320, Postage 12.50] 📅 2026-03-20 🆔 fin009
