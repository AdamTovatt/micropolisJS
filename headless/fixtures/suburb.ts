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
import { Command, SPEEDS } from "../../src/protocol";
import { builtFixture, RUN_STEPS } from "./fixture";
import { buildingAt } from "./toolCommands";
import { stations, zonedTownCommands } from "./town";

// Three towns that create no sprites: the town's plant, zones and roads with a fire and a police station, and no
// airport, railway or port. A city with no sprites is one whose every step the C# port can run before it ports the
// sprites, so these are the cities its unit snapshots are recorded from (conformance/README.md). Each run passes three
// year ends.

function fixture(description: string, commands: Command[], checkpoints: Checkpoint[]): CommandLog {
  return builtFixture(description, [...zonedTownCommands, ...stations, ...commands], checkpoints);
}

// Auto-budget pays every service in full at each year end, and the town grows
export const suburb = fixture(
  "The town without its airport and railway, with a fire and a police station", [], [
    {step: 0, hash: "fa08081b6f968bd5bf255a57c4bbe78dac6169496f8928c1ea1d98b9aee03a2f"},
    {step: RUN_STEPS, hash: "f1e22eda4d0360d5b24d9416102f25ef58384eaf66a9a570ef5bf0cf664ad029"},
  ]);

// The suburb at slow and at fast speed, which gate the scans of phases 11 to 15 on other cycles than medium speed does
export const suburbSlow = fixture("The suburb at slow speed", [{type: "setSpeed", speed: SPEEDS.slow}], [
  {step: 0, hash: "97e7f14cefc13d584c4dd092cce2f08630d2c27e59ba647a631f38433ab2e1da"},
  {step: RUN_STEPS, hash: "54d7a65841fe59b82dc25ff2996105cbe76dc92fb3bca2b2c8a1d7cbde3148e4"},
]);

export const suburbFast = fixture("The suburb at fast speed", [{type: "setSpeed", speed: SPEEDS.fast}], [
  {step: 0, hash: "e4d4f8483402ca579b6e755b07294e528cac70ee369c9348eb8e5fe15369a6c7"},
  {step: RUN_STEPS, hash: "8932d5a635b6d922c3af3dc398fcf21c73e483591520d4bae0b63fdde1bae8b8"},
]);

// With auto-budget off, each year end pays every service at the share the player chose
export const suburbUnderfunded = fixture(
  "The suburb with its services funded below their need and auto-budget off", [
    {type: "setAutoBudget", on: false},
    {type: "setBudget", road: 60, fire: 40, police: 75, tax: 7},
  ], [
    {step: 0, hash: "490672ef0a69fe227a02ec583a0a5676ce83449ad7f077d3b8074eee05567a13"},
    {step: RUN_STEPS, hash: "aa735ceb9ace650d68493c94016e80722213efb835b3ce982c6cc1bbd8770e23"},
  ]);

// No tax comes in, and building a stadium, a nuclear plant and more stations has spent all but a couple of hundred of
// the funds: the first year end pays roads in full, fire with what is left and police nothing, and auto-budget, which
// couldn't pay, turns itself off
export const suburbBroke = fixture(
  "The suburb with a stadium, a nuclear plant and eight stations, no tax, and too little in the bank for their upkeep", [
    buildingAt("police", 50, 13),
    buildingAt("police", 50, 16),
    buildingAt("fire", 46, 19),
    buildingAt("fire", 50, 19),
    buildingAt("stadium", 16, 23),
    buildingAt("nuclear", 22, 23),
    buildingAt("police", 27, 23),
    buildingAt("police", 31, 23),
    {type: "setBudget", road: 100, fire: 100, police: 100, tax: 0},
  ], [
    {step: 0, hash: "4b9e31eace4bf0bb72f2eb20cad5f02f6d1e094060e3b6edde1339cdc187200c"},
    {step: RUN_STEPS, hash: "525749ab675ceea55f48e74bbceb4e92b24d29f4d3a7b449dab6032f0e885e62"},
  ]);
