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

import { SPEEDS } from "../../src/protocol";
import { builtFixture, RUN_STEPS } from "./fixture";
import { buildingAt, lineOf, zoneRow } from "./toolCommands";

// A sprite-free city made to reach branches of the zone handlers that the suburbs never reach, whose unit snapshots
// are recorded from it alone (conformance/snapshotPoints.ts). Seed 8's map has open land and woods from (10, 10) to
// (53, 33).

const LEFT = 14;
const TOP = 10;
const ZONES_PER_ROW = 11;
const RIGHT = LEFT + 3 * ZONES_PER_ROW;

// Three rows of zones with a road under the second and the third. The first row has no road within the reach of a
// zone's drive, so a house built there moves out again once the zone drives, and the zone is often empty. The
// residential population grows past the 256 that need a hospital and then hovers about it, so an empty zone of the
// first row becomes a hospital, and the hospital empties again when the population falls back. Taxes are low enough
// to grow the city that far, and high enough that it falls back again. The city runs at fast speed, so it does both
// in fewer steps than a snapshot point may run.
export const hospitalTown = builtFixture(
  "Three rows of zones, the first with no road, whose residents grow to need a hospital and then shrink", [
    // The plant's east side touches the second row's first zone, which powers the first row through its zones
    buildingAt("coal", LEFT - 3, TOP + 4),
    ...zoneRow("RRRRRRRRRRR", LEFT, TOP),
    ...zoneRow("RRRRRRRRRRR", LEFT, TOP + 3),
    lineOf("road", LEFT, TOP + 6, RIGHT, TOP + 6),
    ...zoneRow("CCCCCIIIIII", LEFT, TOP + 7),
    lineOf("road", LEFT, TOP + 10, RIGHT, TOP + 10),
    lineOf("road", RIGHT, TOP + 7, RIGHT, TOP + 9),

    // The third row touches the plant only at a corner, which doesn't conduct
    lineOf("wire", LEFT - 1, TOP + 7, LEFT - 1, TOP + 7),
    {type: "setBudget", road: 100, fire: 100, police: 100, tax: 7},
    {type: "setSpeed", speed: SPEEDS.fast},
  ], [
    {step: 0, hash: "1733cfeb5cc6c15b6129f2481a8f3adc1962d28001922c904117a1440996a5d9"},
    {step: RUN_STEPS, hash: "4fd55aeb5ee314c5f72d68e5c9c7a17829ea4d563a94ff497065d5977933aa0a"},
  ]);
