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

import { ToolCommand, ToolName } from "../../src/commands";

// Tool commands as scripts write them, with auto-bulldoze on as the player has it by default

// A building, placed by its centre tile as the player's click places it: one in from the top left
export function buildingAt(tool: ToolName, x: number, y: number): ToolCommand {
  return {type: "tool", tool, path: [{x, y}], autoBulldoze: true};
}

// A straight horizontal or vertical line, both ends included, dragged as one command
export function lineOf(tool: ToolName, x1: number, y1: number, x2: number, y2: number): ToolCommand {
  if (x1 !== x2 && y1 !== y2) {
    throw new Error(`A ${tool} line must be horizontal or vertical, got (${x1}, ${y1}) to (${x2}, ${y2})`);
  }

  const length = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  const dx = Math.sign(x2 - x1);
  const dy = Math.sign(y2 - y1);

  const path = [];
  for (let i = 0; i <= length; i++) {
    path.push({x: x1 + i * dx, y: y1 + i * dy});
  }

  return {type: "tool", tool, path, autoBulldoze: true};
}
