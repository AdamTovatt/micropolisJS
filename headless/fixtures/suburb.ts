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
    {step: RUN_STEPS, hash: "b37b475038a214ecb5bb8b6bd11e67cea742148661f78ffae59fe7594158d8fb"},
  ]);

// The suburb at slow and at fast speed, which gate the scans of phases 11 to 15 on other cycles than medium speed does
export const suburbSlow = fixture("The suburb at slow speed", [{type: "setSpeed", speed: SPEEDS.slow}], [
  {step: 0, hash: "97e7f14cefc13d584c4dd092cce2f08630d2c27e59ba647a631f38433ab2e1da"},
  {step: RUN_STEPS, hash: "75270743dd25ee8fa738ea87776258cd73314586d83591450a32913cebebcac0"},
]);

export const suburbFast = fixture("The suburb at fast speed", [{type: "setSpeed", speed: SPEEDS.fast}], [
  {step: 0, hash: "e4d4f8483402ca579b6e755b07294e528cac70ee369c9348eb8e5fe15369a6c7"},
  {step: RUN_STEPS, hash: "6da3ecaea8d105b5fa3abcfb16a8857cbcc0b783fae8ae49f48dfe2fcabb7e86"},
]);

// With auto-budget off, each year end pays every service at the share the player chose
export const suburbUnderfunded = fixture(
  "The suburb with its services funded below their need and auto-budget off", [
    {type: "setAutoBudget", on: false},
    {type: "setBudget", road: 60, fire: 40, police: 75, tax: 7},
  ], [
    {step: 0, hash: "490672ef0a69fe227a02ec583a0a5676ce83449ad7f077d3b8074eee05567a13"},
    {step: RUN_STEPS, hash: "70c96b4354abf3652d4defb0e4308a0085f2c634e903bd45f20eca0c97438494"},
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
    {step: RUN_STEPS, hash: "118d2066ee50faa4fe98a1ee73e38e0702ea2f85a6acc9c8671fa819c04fe7dc"},
  ]);
