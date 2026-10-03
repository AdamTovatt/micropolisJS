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

import { dragPath } from "../../src/dragPath";
import { ToolCommand, ToolName } from "../../src/protocol";

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

  // As the player's drag along the line sends it
  const from = {x: x1, y: y1};
  return {type: "tool", tool, path: [from, ...dragPath(from, {x: x2, y: y2})], autoBulldoze: true};
}
