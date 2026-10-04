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

- `zones/commercial_blue_tower_wings.py`: commercial (1, 5), the dark blue tower with two stone wings.
- `zones/commercial_brick_l_and_grey_tower.py`: commercial (1, 6), the tall brick L block, the lower brick block and the grey tower.
- `zones/commercial_dark_glass_tower.py`: commercial (3, 2), the very tall dark glass tower.
- `zones/commercial_domes_and_l_block.py`: commercial (2, 6), the stone L block with a grey dome, the glass hall and the blue globe.
- `zones/commercial_empty.py`: commercial (1, 1), the empty zone.
- `zones/commercial_glass_tower.py`: commercial (2, 3), the blue glass tower.
- `zones/commercial_green_red_glass_court.py`: commercial (1, 4), the green L block, the blue glass block and the red block round a garden.
- `zones/commercial_green_l_and_tower.py`: commercial (2, 2), the pale green L block and the green glass tower.
- `zones/commercial_green_tower.py`: commercial (2, 4), the green glass tower.
- `zones/commercial_long_block_and_parking_court.py`: commercial (3, 5), the long block down the west side, two lower blocks and the parking court between them.
- `zones/commercial_long_store_and_car_park.py`: commercial (2, 5), the long store, the car park with its painted letter, and the blue buildings on bare ground.
- `zones/commercial_office_park.py`: commercial (1, 2), the office building and the low store.
- `zones/commercial_offices_and_fountain_plaza.py`: commercial (3, 4), the office block with the blue letter and the fountain plaza in front.
- `zones/commercial_offices_and_store.py`: commercial (1, 7), the stone office, the car park and the red store. The reference's crossing streets become a lane that stops short of the zone's edges.
- `zones/commercial_radio_mast_and_car_park.py`: commercial (2, 1), the lattice radio mast, the office with a grid of skylights, the blue store and the car park with its painted letter. The mast leans north-east, as every tall thing does in this view.
- `zones/commercial_round_tower.py`: commercial (3, 7), the round white tower.
- `zones/commercial_stepped_terrace.py`: commercial (3, 6), the building stepping down in terraces.
- `zones/commercial_strip_mall_and_car_park.py`: commercial (3, 3), the strip of shops, the car park and the small office on bare ground.
- `zones/commercial_tank_under_construction.py`: commercial (1, 3), the building site with the spherical tank on its legs.
- `zones/commercial_twin_towers.py`: commercial (2, 7), the two blue towers.
- `zones/commercial_white_tower_on_pyramids.py`: commercial (3, 1), the white tower on a podium roofed with pyramids.
- `zones/residential_apartment_slabs.py`: residential (1, 3), two slabs. The reference's streets are left out: a zone holds no street.
- `zones/residential_blue_and_green_houses.py`: residential (2, 4), the blue block with a hipped end and the long green house.
- `zones/residential_blue_l_tall_wing.py`: residential (2, 3), the blue L block with its tall wing and the two small houses.
- `zones/residential_blue_c_block.py`: residential (2, 1), the blue C block round a car park, and the slab beside it. Lower than the reference, so the sun reaches the court.
- `zones/residential_brick_s_block_and_blue_roofs.py`: residential (2, 6), the winding brick block and the two houses with blue mansard roofs.
- `zones/residential_courtyard_block.py`: residential (2, 5), the red and navy blocks round a courtyard.
- `zones/residential_domed_hall_and_blocks.py`: residential (3, 2), the white hall with a blue dome among blue blocks and car parks. The reference's crossroads becomes drives that stop short of the zone's edges.
- `zones/residential_empty.py`: residential (1, 1), the empty zone.
- `zones/residential_grey_blocks_and_fountain.py`: residential (3, 3), the two blue-grey L blocks round a garden court, and the fountain plaza.
- `zones/residential_grey_l_on_bare_ground.py`: residential (1, 2), the grey L block on bare ground.
- `zones/residential_grey_ring.py`: residential (1, 4), the grey blocks in a ring round a courtyard.
- `zones/residential_green_l_block.py`: residential (2, 2), the green L block and its wing round a garden.
- `zones/residential_red_and_blue.py`: residential (1, 6), the red L block and the blue block. The reference's crossroads becomes a paved square, a playground and a car park.
- `zones/residential_red_blue_over_car_park.py`: residential (1, 5), the red, blue and grey blocks above a row of parking.
- `zones/residential_round_towers.py`: residential (3, 4), the two round towers.
- `zones/residential_three_towers.py`: residential (3, 1), the three towers, the south one on a glass podium.
- `zones/residential_white_blocks_and_terraces.py`: residential (3, 5), the white blocks round a glass-roofed court, and the terraced houses.

Issue #57 tracks every asset still to make, these zone designs included.

A scene matches its reference in layout, proportions, colours and roof detail rather than pixel for pixel, and leaves out what the conventions in `../README.md` forbid, such as streets.
