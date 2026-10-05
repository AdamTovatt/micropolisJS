/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 * Modified in Adam Tovatt's continuation of micropolisJS. Copyright (C) 2026 Adam Tovatt
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

import { TileReportAnswer } from "./protocol";
import { QuerySource } from "./querySource";

// The query tool: asks the simulation for the report of the tile the player clicks, and shows the answer. It reads
// nothing of the city but the answer.
export class QueryTool {
  constructor(private readonly source: QuerySource, private readonly show: (report: TileReportAnswer) => void) {}

  // The tile must be on the map. The tool asks only for the report of a tile on the map, so a rejection, or any other
  // answer, is a defect.
  query(x: number, y: number): void {
    this.source.ask({type: "tileReport", x, y}, (answer) => {
      if (answer.type === "rejected") {
        throw new Error(`The simulation rejected a tile report query: ${answer.reason}`);
      }

      if (answer.type !== "tileReport") {
        throw new Error(`The simulation answered a tile report query with an answer of type ${answer.type}`);
      }

      this.show(answer);
    });
  }
}
