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

import type { SettingsRecord } from "./protocol";

// The settings as the simulation keeps them, in budget.js, disasterManager.js and simulation.js. They are JavaScript,
// so the record's reader declares their shape, as evaluationRecord.ts does for the evaluation.
export interface SettingsSource {
  budget: {autoBudget: boolean};
  disasterManager: {disastersEnabled: boolean};
  getSpeed(): number;
}

// Builds the record field by field in the protocol's order
export function settingsRecord(simulation: SettingsSource): SettingsRecord {
  return {
    type: "settings",
    autoBudget: simulation.budget.autoBudget,
    disasters: simulation.disasterManager.disastersEnabled,
    speed: simulation.getSpeed(),
  };
}
