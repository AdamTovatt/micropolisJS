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
    {step: 0, hash: "c5f5fb32520e5e74c967e2b9001a0bca83ecd3440200df1f1d1a901b6733b02f"},
    {step: RUN_STEPS, hash: "396763d6c1abe7bd5a3e787d7286c489eeea97bcafa1fc0c97b1fe33a86c323c"},
  ]);

// The suburb at slow and at fast speed, which gate the scans of phases 11 to 15 on other cycles than medium speed does
export const suburbSlow = fixture("The suburb at slow speed", [{type: "setSpeed", speed: SPEEDS.slow}], [
  {step: 0, hash: "3d113663769481815655350bb21285312c377b499cecb8b60ad4df7fcd41949c"},
  {step: RUN_STEPS, hash: "99a42e13c8e063d4836cd5b42c303ad926a80255c213b6c5c08c68aa7c0a8f65"},
]);

export const suburbFast = fixture("The suburb at fast speed", [{type: "setSpeed", speed: SPEEDS.fast}], [
  {step: 0, hash: "ee6cf1717e213ca516bc3548e1a3ec5ad8232990d416e27ee4a2679c3c225ba3"},
  {step: RUN_STEPS, hash: "ffb108b8006875d60186e29d8744b851d58f5cf0b6bf3654dce5f733f7b63e96"},
]);

// With auto-budget off, each year end pays every service at the share the player chose
export const suburbUnderfunded = fixture(
  "The suburb with its services funded below their need and auto-budget off", [
    {type: "setAutoBudget", on: false},
    {type: "setBudget", road: 60, fire: 40, police: 75, tax: 7},
  ], [
    {step: 0, hash: "1a745dcb07498a6548fde4bd1f6adbdb27fb2501d93b9ae5f727ab402d0dfac0"},
    {step: RUN_STEPS, hash: "f3773d07752ee292a78a350d2e4d58d1321458afdfe3f06cb0b18399f47deddd"},
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
    {step: 0, hash: "c3291dc8394080bec0e9fcfd45c9142f6b07fad975f04bc6624b6687e3b841f0"},
    {step: RUN_STEPS, hash: "bf91fbe40b106fda6ebc3a0d0ec922fd6c7ddf25baf32e6618b72153acbadf89"},
  ]);
