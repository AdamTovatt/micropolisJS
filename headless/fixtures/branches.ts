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
import { buildingAt, lineOf } from "./toolCommands";

// Cities, each made to reach branches of the scans that the suburbs never reach, whose unit snapshots are recorded
// from them alone (conformance/snapshotPoints.ts). Seed 8's map has open land and woods from (10, 10) to (53, 33).

// The coal plant's top left corner, and a block of wire filling the land east of it, which the plant's east side
// touches
const PLANT_LEFT = 10;
const PLANT_TOP = 10;
const WIRE_LEFT = PLANT_LEFT + 4;
const WIRE_RIGHT = 43;
const WIRE_BOTTOM = 33;

function wireBlock(): Command[] {
  return Array.from({length: WIRE_BOTTOM - PLANT_TOP + 1},
                    (_, i) => lineOf("wire", WIRE_LEFT, PLANT_TOP + i, WIRE_RIGHT, PLANT_TOP + i));
}

// The plant's 16 tiles and 720 of wire are more than the 700 a coal plant powers, so every power scan finds a
// shortage, and the power messages' throttle sends the first and holds those that follow within three city years
export const overloaded = builtFixture(
  "A coal plant feeding a block of wire larger than it can power", [
    buildingAt("coal", PLANT_LEFT + 1, PLANT_TOP + 1),
    ...wireBlock(),
  ], [
    {step: 0, hash: "5bb2b4396e3eadac841f0dcb9faef1259c39b19ad119b25537cab5768dc5751f"},
    {step: RUN_STEPS, hash: "13569d2c3b1aec97d82c4484ff387edd47ad8f3b4ac0a53579c6ade7e96c3312"},
  ]);

// Seed 8's map as generated: no zone, no developed tile and no pollution
export const wilderness = builtFixture(
  "Seed 8's map with nothing built", [], [
    {step: 0, hash: "de47377aaf535ab182de27aeb65e6671def8944661238109c430ee1f95878a98"},
    {step: RUN_STEPS, hash: "7a724f9c2e95be5c3691ddb77b3c5b38b7a552a7655c9b0c2b43e09b67145791"},
  ]);

// Two coal plants side by side, the second's west side against the first's east side. The power scan takes the last
// source stacked first, the second plant, and its walk reaches the first, which it then walks as a load of the second
// rather than as a source
export const twinPlants = builtFixture(
  "Two coal plants side by side, with nothing else built", [
    buildingAt("coal", PLANT_LEFT + 1, PLANT_TOP + 1),
    buildingAt("coal", PLANT_LEFT + 5, PLANT_TOP + 1),
  ], [
    {step: 0, hash: "1005389f49c511bdaaec8c4262d947399359f9240eb307e959dee3942737e0b4"},
    {step: RUN_STEPS, hash: "e8e97db919cc48ab7d66bb57bbdd870a0a0fc54002152eb9ae28cfaddbb8f986"},
  ]);

// Two fires set in the woods, which spread through them: the scan that scores pollution meets burning tiles, and a tile
// of FIRE itself, which falls in the band of radiation
export const forestFire = builtFixture(
  "Seed 8's map with two fires set and nothing built", [
    {type: "triggerDisaster", kind: "fire"},
    {type: "triggerDisaster", kind: "fire"},
  ], [
    {step: 0, hash: "46ab566ecdb9905ee982fc254789c6d86b7e66b579b1cb26e7ffdc97e709c4ec"},
    {step: RUN_STEPS, hash: "9d8d06cd17af0e6742db35bbf1af2430180456c1c4361ccd85ccbda75953907b"},
  ]);
