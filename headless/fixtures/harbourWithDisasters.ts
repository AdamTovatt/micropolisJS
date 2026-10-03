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

import { plainSavedState } from "../../src/stateHash";
import { Level, Simulation } from "../city";
import { atStart, RUN_STEPS } from "./fixture";
import { harbour } from "./harbour";
import type { DerivedFixture } from "./index";

// The harbour at the hard level, which no command sets, with random disasters on: its runs have every kind of sprite,
// and at the hard level's odds random disasters strike them, where at the easy level's few runs would see one
export const harbourWithDisasters: DerivedFixture = {
  from: harbour,
  save(city: Simulation): object {
    const saved = plainSavedState(city) as {simulation: {gameLevel: number}};
    saved.simulation.gameLevel = Level.hard;
    return saved;
  },
  description: "The harbour at the hard level, with random disasters on",
  entries: atStart([{type: "setDisasters", on: true}]),
  checkpoints: [
    {step: 0, hash: "d76115e83efc6cdb023598121cacf7259ca262dd288a7ba4b965b05b035cf23a"},
    {step: RUN_STEPS, hash: "feb5361037ef6cdc088edcbde89cf7a8caafb89947d064c0648fdd171c10c380"},
  ],
};
