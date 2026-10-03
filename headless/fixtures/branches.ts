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

// Sprite-free cities, each made to reach branches of the scans that the suburbs never reach, whose unit snapshots are
// recorded from them alone (conformance/snapshotPoints.ts). Seed 8's map has open land and woods from (10, 10) to
// (53, 33).

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
    {step: 0, hash: "6db6d42ac774965450d4fad4900132d4380947a93ebe778356ea81a23d5a432f"},
    {step: RUN_STEPS, hash: "d559f2106317ab1fd9f55d855749f51d643969056c22e464c9b15c821e5f625c"},
  ]);

// Seed 8's map as generated: no zone, no developed tile and no pollution
export const wilderness = builtFixture(
  "Seed 8's map with nothing built", [], [
    {step: 0, hash: "464e4fd88b7a6bdb3e511da11e7d920c7b06e609b6d6a88b63786ed8ef0f685b"},
    {step: RUN_STEPS, hash: "817d4860b30fd2d2bc3f476a0fba5abc38023c0bfc14473c5dcca4c8b31d25f9"},
  ]);

// Two coal plants side by side, the second's west side against the first's east side. The power scan takes the last
// source stacked first, the second plant, and its walk reaches the first, which it then walks as a load of the second
// rather than as a source
export const twinPlants = builtFixture(
  "Two coal plants side by side, with nothing else built", [
    buildingAt("coal", PLANT_LEFT + 1, PLANT_TOP + 1),
    buildingAt("coal", PLANT_LEFT + 5, PLANT_TOP + 1),
  ], [
    {step: 0, hash: "d75e7922d6b7914bfef42b17d70bfdda1c56577c5cfa1c66de4d5c564bce2456"},
    {step: RUN_STEPS, hash: "9958a8868b4718086aa2383945495cd1cbc4d239b7c35465b0546fcb270db210"},
  ]);

// Two fires set in the woods, which spread through them: the scan that scores pollution meets burning tiles, and a tile
// of FIRE itself, which falls in the band of radiation
export const forestFire = builtFixture(
  "Seed 8's map with two fires set and nothing built", [
    {type: "triggerDisaster", kind: "fire"},
    {type: "triggerDisaster", kind: "fire"},
  ], [
    {step: 0, hash: "2b3fafa39fc0154b1b25c4cf8bdd57e8600978260b33a9724db12d09cdc5be80"},
    {step: RUN_STEPS, hash: "4f8a19384c27d625b074cdacff9955993a76d777cc0a3e5ea9e2a3ef74c22b26"},
  ]);
