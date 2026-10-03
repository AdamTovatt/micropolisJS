/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 *
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details. Alternatively,
 * consult http://micropolisjs.graememcc.co.uk/LICENSE and
 * http://micropolisjs.graememcc.co.uk/COPYING
 *
 * The name/term "MICROPOLIS" is a registered trademark of Micropolis (https://www.micropolis.com) GmbH
 * (Micropolis Corporation, the "licensor") and is licensed here to the authors/publishers of the "Micropolis"
 * city simulation game and its source code (the project or "licensee(s)") as a courtesy of the owner.
 *
 */

import { Level, Speed } from "../city";
import { CityBuilder, Fixture } from "./builder";

// A small powered town: two rows of ten zones either side of a road, a coal plant at the west end, and an airport
// and a railway to the south, which bring planes, a helicopter and trains. It has no police or fire station: their
// upkeep would run its funds down until the simulation stops for the player's budget. Seed 8's map has open land
// and woods from (10, 10) to (53, 33), and the town fits inside it.

const LEFT = 14;
const TOP = 12;
const ZONES_PER_ROW = 10;
const RIGHT = LEFT + 3 * ZONES_PER_ROW;

// R residential, C commercial, I industrial
const NORTH_ROW = "RRCRRCRRCR";
const SOUTH_ROW = "IIIRRCRRII";

function zoneRow(builder: CityBuilder, kinds: string, top: number) {
  for (let i = 0; i < ZONES_PER_ROW; i++) {
    const x = LEFT + 3 * i + 1;
    const y = top + 1;

    switch (kinds[i]) {
      case "R":
        builder.residential(x, y);
        break;

      case "C":
        builder.commercial(x, y);
        break;

      case "I":
        builder.industrial(x, y);
        break;

      default:
        throw new Error(`Unknown zone kind ${kinds[i]}`);
    }
  }
}

export const town: Fixture = {
  seed: 8,
  level: Level.easy,
  speed: Speed.medium,

  build(builder) {
    // The plant's east side touches the north row's first zone
    builder.coal(LEFT - 3, TOP + 1);
    zoneRow(builder, NORTH_ROW, TOP);
    builder.road(LEFT, TOP + 3, RIGHT, TOP + 3);
    zoneRow(builder, SOUTH_ROW, TOP + 4);
    builder.road(LEFT, TOP + 7, RIGHT, TOP + 7);
    builder.road(RIGHT, TOP + 4, RIGHT, TOP + 6);

    // The south row touches the plant only at a corner, which doesn't conduct
    builder.wire(LEFT - 1, TOP + 4, LEFT - 1, TOP + 4);

    // A wire from the south row crosses the south road to the airport
    builder.wire(LEFT, TOP + 7, LEFT, TOP + 9);
    builder.airport(LEFT + 1, TOP + 11);

    builder.rail(LEFT, TOP + 17, RIGHT + 6, TOP + 17);
  },
};
