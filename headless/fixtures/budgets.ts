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

import { Checkpoint, CommandLog } from "../../src/commandLog";
import { Command } from "../../src/commands";
import { builtFixture, RUN_STEPS } from "./fixture";
import { buildingAt, lineOf } from "./toolCommands";
import { townCommands } from "./town";

// Two towns whose golden hashes pin the year-end budget's rules, which the town alone never reaches: its services are
// always fully funded. Each is the town with a fire and a police station east of its north row, whose upkeep the
// year end has to pay, and a budget set before the first step. Their runs, like the town's, pass three year ends.

// A wire from the north row's last zone powers the fire station, and the police station touches it
const stations: Command[] = [
  lineOf("wire", 44, 13, 44, 13),
  buildingAt("fire", 46, 13),
  buildingAt("police", 46, 16),
];

function fixture(description: string, commands: Command[], checkpoints: Checkpoint[]): CommandLog {
  return builtFixture(description, [...townCommands, ...commands], checkpoints);
}

// With auto-budget off, each year end pays every service at the share the player chose, and each works at that share
export const underfunded = fixture(
  "The town with a fire and a police station, its services funded below their need with auto-budget off", [
    ...stations,
    {type: "setAutoBudget", on: false},
    {type: "setBudget", road: 60, fire: 40, police: 75, tax: 7},
  ], [
    {step: 0, hash: "b2035d45d6e2606a45fd9f635110fc041b3b0bf599ffe04a5acdc294dafb4895"},
    {step: RUN_STEPS, hash: "4df2d576f8bff33cb1d376aface4352c227b99cbdee5f568d77c834a2020f10c"},
  ]);

// No tax comes in, and building has spent all but a few hundred of the funds: the first year end pays roads and fire
// in full and police with what is left, and auto-budget, which couldn't pay, turns itself off. The year ends after it
// find no funds at all.
export const broke = fixture(
  "The town with three fire and three police stations, no tax, and too little in the bank for their upkeep", [
    ...stations,
    buildingAt("police", 50, 13),
    buildingAt("police", 50, 16),
    buildingAt("fire", 46, 19),
    buildingAt("fire", 50, 19),
    {type: "setBudget", road: 100, fire: 100, police: 100, tax: 0},
  ], [
    {step: 0, hash: "970021decc0479ac930850bb5cc9a2e58ee962a4240f26239b7286d5527a82c9"},
    {step: RUN_STEPS, hash: "01539e6968d7ac33b2ed6f549bc198554eb34b446a4a7989232bae1fea5878a3"},
  ]);
