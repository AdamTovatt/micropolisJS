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

import { builtFixture, RUN_STEPS } from "./fixture";
import { buildingAt, lineOf, zoneRow } from "./toolCommands";

// A sprite-free city made to reach branches of the zone handlers and their drives that neither the suburbs nor the
// hospital town reach, whose unit snapshots are recorded from it alone (conformance/snapshotPoints.ts). Seed 8's map
// has open land and woods from (10, 10) to (53, 33).

// A row of ten zones along a road, which gives the city its demand
const TOWN_LEFT = 14;
const TOWN_TOP = 17;
const TOWN_ROW = "RRCRIRRCIR";
const TOWN_ROAD_Y = TOWN_TOP + 3;

// A residential zone south-east of the town, whose own road runs east from the corner of its perimeter where a drive
// starts, twelve tiles on to a dead end with nothing beside it
const SPUR_ZONE_X = 40;
const SPUR_ZONE_Y = 25;
const SPUR_Y = SPUR_ZONE_Y + 2;
const SPUR_END = 53;

// A commercial and an industrial zone in the north-west with no road within the reach of their drives, beside the
// plant that powers them, and the town: each grows, then drives, finds no road and declines to empty. The zone at the
// end of the spur grows a house, then drives along the spur: its twelve moves leave it six positions to forget at the
// dead end, more than the five back-ups the distance left allows, so it backs up until it has gone its whole distance.
export const roadlessTown = builtFixture(
  "A town whose first commercial and industrial zones have no road, and a house at the end of a dead-end road", [
    buildingAt("coal", 11, 11),
    buildingAt("commercial", 15, 11),
    buildingAt("industrial", 18, 11),
    ...zoneRow(TOWN_ROW, TOWN_LEFT, TOWN_TOP),
    lineOf("road", TOWN_LEFT, TOWN_ROAD_Y, TOWN_LEFT + 3 * TOWN_ROW.length, TOWN_ROAD_Y),

    // From beside the plant and under the commercial zone to the town's first zone
    lineOf("wire", TOWN_LEFT, 13, TOWN_LEFT, TOWN_TOP - 1),

    buildingAt("residential", SPUR_ZONE_X, SPUR_ZONE_Y),
    lineOf("road", SPUR_ZONE_X + 1, SPUR_Y, SPUR_END, SPUR_Y),

    // Across the town's road to the zone at the end of the spur
    lineOf("wire", SPUR_ZONE_X, TOWN_ROAD_Y, SPUR_ZONE_X, SPUR_ZONE_Y - 2),
  ], [
    {step: 0, hash: "95fdb0f1bad52ead924a0ca17601a65b2338c280f485a676d3597869432c1a70"},
    {step: RUN_STEPS, hash: "3b3cd2194981315a38165a2a6ed24c2b731b7ab372d7831dbd2c79d0726a4aad"},
  ]);
