# References

Concept sheets of 3×3 zones, seen from above in the game's view, that the zone scenes are modelled on. They are references to look at, never used in a render.

- `residential-sheet.png`: 17 residential zones in 3 rows of 6; the last place in the third row is empty.
- `commercial-sheet.png`: 21 commercial zones in 3 rows of 7.

`tools/reference.py` crops one zone by row and column, counted from 1 at the top left, or writes a whole sheet with each zone's row and column printed on it:

```bash
python art/tools/reference.py commercial 2 3 tower.png
python art/tools/reference.py residential all overview.png
```

Zone (1, 1) of each sheet is the empty zone: its letter on bare ground.

## Modelled so far

- `zones/commercial_glass_tower.py`: commercial (2, 3), the blue glass tower.
- `zones/commercial_green_tower.py`: commercial (2, 4), the green glass tower.
- `zones/commercial_office_park.py`: commercial (1, 2), the office building and the low store.
- `zones/commercial_stepped_terrace.py`: commercial (3, 6), the building stepping down in terraces.
- `zones/residential_apartment_slabs.py`: residential (1, 3), two slabs. The reference's streets are left out: a zone holds no street.
- `zones/residential_courtyard_block.py`: residential (2, 5), the red and navy blocks round a courtyard.
- `zones/residential_green_l_block.py`: residential (2, 2), the green L block and its wing round a garden.
- `zones/residential_round_towers.py`: residential (3, 4), the two round towers.

Issue #57 tracks every asset still to make, these zone designs included.

A scene matches its reference in layout, proportions, colours and roof detail rather than pixel for pixel, and leaves out what the conventions in `../README.md` forbid, such as streets.
