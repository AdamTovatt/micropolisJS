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

import { BuildingTool } from "./buildingTool.js";
import { BulldozerTool } from "./bulldozerTool.js";
import { GameMap } from "./gameMap.js";
import { ParkTool } from "./parkTool.js";
import { RailTool } from "./railTool.js";
import { Random } from "./random";
import { RoadTool } from "./roadTool.js";
import * as TileValues from "./tileValues";
import { WireTool } from "./wireTool.js";

// A tool that changes the city. doTool stages its edits at a tile, drawing from the simulation's stream, and
// modifyIfEnoughFunding applies them if the budget can pay, leaving the outcome in result.
export interface CityTool {
  result: number;
  doTool(x: number, y: number, blockMaps: object, random: Random): void;
  modifyIfEnoughFunding(budget: object): boolean;
}

export type CityToolName = "airport" | "bulldozer" | "coal" | "commercial" | "fire" | "industrial" | "nuclear" |
  "park" | "police" | "port" | "rail" | "residential" | "road" | "stadium" | "wire";

// The tools that change the city, with their costs: the player's, and the headless fixtures' too. They touch no DOM;
// gameTools.js adds the query tool.
export function cityTools(map: InstanceType<typeof GameMap>): Record<CityToolName, CityTool> {
  const tools = {
    airport: new BuildingTool(10000, TileValues.AIRPORT, map, 6, false),
    bulldozer: new BulldozerTool(map),
    coal: new BuildingTool(3000, TileValues.POWERPLANT, map, 4, false),
    commercial: new BuildingTool(100, TileValues.COMCLR, map, 3, false),
    fire: new BuildingTool(500, TileValues.FIRESTATION, map, 3, false),
    industrial: new BuildingTool(100, TileValues.INDCLR, map, 3, false),
    nuclear: new BuildingTool(5000, TileValues.NUCLEAR, map, 4, true),
    park: new ParkTool(map),
    police: new BuildingTool(500, TileValues.POLICESTATION, map, 3, false),
    port: new BuildingTool(3000, TileValues.PORT, map, 4, false),
    rail: new RailTool(map),
    residential: new BuildingTool(100, TileValues.FREEZ, map, 3, false),
    road: new RoadTool(map),
    stadium: new BuildingTool(5000, TileValues.STADIUM, map, 4, false),
    wire: new WireTool(map),
  };

  // The tools are legacy JavaScript, whose inferred types lack the members their prototypes add
  return tools as unknown as Record<CityToolName, CityTool>;
}
