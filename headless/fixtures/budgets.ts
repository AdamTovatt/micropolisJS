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
import { Command } from "../../src/protocol";
import { builtFixture, RUN_STEPS } from "./fixture";
import { buildingAt } from "./toolCommands";
import { stations, townCommands } from "./town";

// Two towns whose golden hashes pin the year-end budget's rules, which the town alone never reaches: its services are
// always fully funded. Each is the town with a fire and a police station east of its north row, whose upkeep the
// year end has to pay, and a budget set before the first step. Their runs, like the town's, pass three year ends.

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
    {step: 0, hash: "99394d3b50e55da27586d1b8982ae93690c82126e9ba4b309d37919824269c1e"},
    {step: RUN_STEPS, hash: "8a4ec13c355a8abd35961455b4f7fc6646e5450bdd2a19d0f2ee29878e733a80"},
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
    {step: 0, hash: "55f86f6a27ea1c58475acac7362c45836312de779a716b331923aacd121c7d31"},
    {step: RUN_STEPS, hash: "c48d834657e6e5743e8c40be82abaa548958d69a42efc9953198a66011f71767"},
  ]);
