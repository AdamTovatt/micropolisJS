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

import { Command, SPEEDS, ToolName } from "../../src/protocol";
import { builtFixture, RUN_STEPS } from "./fixture";
import { buildingAt, lineOf } from "./toolCommands";

// A sprite-free city made to reach branches of the zone handlers that the suburbs never reach, whose unit snapshots
// are recorded from it alone (conformance/snapshotPoints.ts). Seed 8's map has open land and woods from (10, 10) to
// (53, 33).

const LEFT = 14;
const TOP = 10;
const ZONES_PER_ROW = 11;
const RIGHT = LEFT + 3 * ZONES_PER_ROW;

// R residential, C commercial, I industrial
const ZONE_TOOLS: Record<string, ToolName> = {R: "residential", C: "commercial", I: "industrial"};

function zoneRow(kinds: string, top: number): Command[] {
  if (kinds.length !== ZONES_PER_ROW) {
    throw new Error(`A row has ${ZONES_PER_ROW} zones, got ${kinds}`);
  }

  return Array.from(kinds, (kind, i) => buildingAt(ZONE_TOOLS[kind], LEFT + 3 * i + 1, top + 1));
}

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
    ...zoneRow("RRRRRRRRRRR", TOP),
    ...zoneRow("RRRRRRRRRRR", TOP + 3),
    lineOf("road", LEFT, TOP + 6, RIGHT, TOP + 6),
    ...zoneRow("CCCCCIIIIII", TOP + 7),
    lineOf("road", LEFT, TOP + 10, RIGHT, TOP + 10),
    lineOf("road", RIGHT, TOP + 7, RIGHT, TOP + 9),

    // The third row touches the plant only at a corner, which doesn't conduct
    lineOf("wire", LEFT - 1, TOP + 7, LEFT - 1, TOP + 7),
    {type: "setBudget", road: 100, fire: 100, police: 100, tax: 7},
    {type: "setSpeed", speed: SPEEDS.fast},
  ], [
    {step: 0, hash: "a7a53ca6c2c63da9a239e01be0d426052a637cc6047aeaaae549a5a4542f3604"},
    {step: RUN_STEPS, hash: "7f12ed18e624220a698aea6f314a71a210abaf8862983fb7a452cad4aa8f18c5"},
  ]);
