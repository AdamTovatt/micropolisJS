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

import { Command, LOCAL_PLAYER, TilePosition, ToolName } from "../../src/commands";
import { cityFromSeed, Simulation } from "../city";

// Builds a fixture's city with tool commands, as the player does, with auto-bulldoze on as the player has it by
// default. Every command must succeed: a fixture whose build silently skipped an edit would pin a different city than
// its script describes.

export interface Fixture {
  // The game seed, which generates the map and seeds the stream
  seed: number;
  level: number;
  speed: number;
  build(builder: CityBuilder): void;
}

export class CityBuilder {
  constructor(readonly city: Simulation) {}

  // A building's position is its centre tile, as for the player's click: one in from the top left
  airport(x: number, y: number) { this.apply("airport", [{x, y}]); }
  coal(x: number, y: number) { this.apply("coal", [{x, y}]); }
  commercial(x: number, y: number) { this.apply("commercial", [{x, y}]); }
  fireStation(x: number, y: number) { this.apply("fire", [{x, y}]); }
  industrial(x: number, y: number) { this.apply("industrial", [{x, y}]); }
  policeStation(x: number, y: number) { this.apply("police", [{x, y}]); }
  residential(x: number, y: number) { this.apply("residential", [{x, y}]); }

  // A straight horizontal or vertical line of road, rail or wire, both ends included, dragged as one command
  rail(x1: number, y1: number, x2: number, y2: number) { this.line("rail", x1, y1, x2, y2); }
  road(x1: number, y1: number, x2: number, y2: number) { this.line("road", x1, y1, x2, y2); }
  wire(x1: number, y1: number, x2: number, y2: number) { this.line("wire", x1, y1, x2, y2); }

  private line(tool: ToolName, x1: number, y1: number, x2: number, y2: number) {
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

    this.apply(tool, path);
  }

  private apply(tool: ToolName, path: TilePosition[]) {
    const command: Command = {type: "tool", tool, path, autoBulldoze: true};
    const [result] = this.city.applyCommands([{player: LOCAL_PLAYER, command}]);

    if (result.outcome !== "ok") {
      const tile = ({x, y}: TilePosition) => `(${x}, ${y})`;
      const where = path.length === 1 ? `at ${tile(path[0])}` : `from ${tile(path[0])} to ${tile(path[path.length - 1])}`;
      throw new Error(`The ${tool} tool failed ${where} with outcome ${result.outcome}` +
                      (result.reason === null ? "" : `: ${result.reason}`));
    }
  }
}

export function buildFixture(fixture: Fixture): Simulation {
  const city = cityFromSeed(fixture.seed, fixture.level, fixture.speed);
  fixture.build(new CityBuilder(city));
  return city;
}
