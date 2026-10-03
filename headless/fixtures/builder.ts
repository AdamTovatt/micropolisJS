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

import { BaseTool } from "../../src/baseTool.js";
import { CityTool, CityToolName, cityTools } from "../../src/cityTools";
import { cityFromSeed, Simulation } from "../city";

// Builds a fixture's city by driving the tool objects directly, as the browser does when the player clicks. Every
// edit must succeed: a fixture whose build silently skipped an edit would pin a different city than its script
// describes.

export interface Fixture {
  // The game seed, which generates the map and seeds the stream
  seed: number;
  level: number;
  speed: number;
  build(builder: CityBuilder): void;
}

export class CityBuilder {
  private readonly tools: Record<CityToolName, CityTool>;

  constructor(readonly city: Simulation) {
    // The tools the player is given, with the same costs
    this.tools = cityTools(city.getMap());
  }

  // A building's position is its centre tile, as for the player's click: one in from the top left
  airport(x: number, y: number) { this.apply("airport", x, y); }
  coal(x: number, y: number) { this.apply("coal", x, y); }
  commercial(x: number, y: number) { this.apply("commercial", x, y); }
  fireStation(x: number, y: number) { this.apply("fire", x, y); }
  industrial(x: number, y: number) { this.apply("industrial", x, y); }
  policeStation(x: number, y: number) { this.apply("police", x, y); }
  residential(x: number, y: number) { this.apply("residential", x, y); }

  // A straight horizontal or vertical line of road, rail or wire, both ends included
  rail(x1: number, y1: number, x2: number, y2: number) { this.line("rail", x1, y1, x2, y2); }
  road(x1: number, y1: number, x2: number, y2: number) { this.line("road", x1, y1, x2, y2); }
  wire(x1: number, y1: number, x2: number, y2: number) { this.line("wire", x1, y1, x2, y2); }

  private line(toolName: CityToolName, x1: number, y1: number, x2: number, y2: number) {
    if (x1 !== x2 && y1 !== y2) {
      throw new Error(`A ${toolName} line must be horizontal or vertical, got (${x1}, ${y1}) to (${x2}, ${y2})`);
    }

    const length = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    const dx = Math.sign(x2 - x1);
    const dy = Math.sign(y2 - y1);

    for (let i = 0; i <= length; i++) {
      this.apply(toolName, x1 + i * dx, y1 + i * dy);
    }
  }

  private apply(toolName: CityToolName, x: number, y: number) {
    const tool = this.tools[toolName];
    tool.doTool(x, y, this.city.blockMaps, this.city.random);

    if (!tool.modifyIfEnoughFunding(this.city.budget)) {
      throw new Error(`The ${toolName} tool failed at (${x}, ${y}) with result ${tool.result}`);
    }
  }
}

export function buildFixture(fixture: Fixture): Simulation {
  // The building tools clear trees only with auto-bulldoze on: the player's setting, on by default, and not part of
  // the city's state
  if (!(BaseTool as unknown as {getAutoBulldoze(): boolean}).getAutoBulldoze()) {
    throw new Error("Fixtures are built with auto-bulldoze on");
  }

  const city = cityFromSeed(fixture.seed, fixture.level, fixture.speed);
  fixture.build(new CityBuilder(city));
  return city;
}
