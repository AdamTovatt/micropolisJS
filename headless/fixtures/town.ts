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

import { Command } from "../../src/protocol";
import { builtFixture, RUN_STEPS } from "./fixture";
import { buildingAt, lineOf, zoneRow } from "./toolCommands";

// A small powered town: two rows of ten zones either side of a road, a coal plant at the west end, and an airport
// and a railway to the south, which bring planes, a helicopter and trains. It has no police or fire station: their
// upkeep would run its funds down until auto-budget couldn't pay, turned itself off and left the services
// underfunded, and the run would pin that slide rather than a growing town. Seed 8's map has open land and woods from
// (10, 10) to (53, 33), and the town fits inside it.

const LEFT = 14;
const TOP = 12;
const ZONES_PER_ROW = 10;
const RIGHT = LEFT + 3 * ZONES_PER_ROW;

const NORTH_ROW = "RRCRRCRRCR";
const SOUTH_ROW = "IIIRRCRRII";

// The commands that build the town's plant, zones and roads, which create no sprites
export const zonedTownCommands: Command[] = [
  // The plant's east side touches the north row's first zone
  buildingAt("coal", LEFT - 3, TOP + 1),
  ...zoneRow(NORTH_ROW, LEFT, TOP),
  lineOf("road", LEFT, TOP + 3, RIGHT, TOP + 3),
  ...zoneRow(SOUTH_ROW, LEFT, TOP + 4),
  lineOf("road", LEFT, TOP + 7, RIGHT, TOP + 7),
  lineOf("road", RIGHT, TOP + 4, RIGHT, TOP + 6),

  // The south row touches the plant only at a corner, which doesn't conduct
  lineOf("wire", LEFT - 1, TOP + 4, LEFT - 1, TOP + 4),
];

// The commands that build the town, which other fixtures build on
export const townCommands: Command[] = [
  ...zonedTownCommands,

  // A wire from the south row crosses the south road to the airport
  lineOf("wire", LEFT, TOP + 7, LEFT, TOP + 9),
  buildingAt("airport", LEFT + 1, TOP + 11),

  lineOf("rail", LEFT, TOP + 17, RIGHT + 6, TOP + 17),
];

// A fire and a police station east of the north row, which other fixtures add to the town: a wire from the row's last
// zone powers the fire station, and the police station touches it
export const stations: Command[] = [
  lineOf("wire", 44, 13, 44, 13),
  buildingAt("fire", 46, 13),
  buildingAt("police", 46, 16),
];

// Its checkpoints are its golden hashes: the town as built, and after its run
export const town = builtFixture(
  "A small powered town of twenty zones, with a coal plant, an airport and a railway", townCommands, [
    {step: 0, hash: "511c4154dd1a7184ac5f0ef97f91cf3b3886e9df0c03d1156372c701d43a8420"},
    {step: RUN_STEPS, hash: "f6976e05c913b58f81478ff8dec882c2a15361848391066e55d63f64226ab99c"},
  ]);
