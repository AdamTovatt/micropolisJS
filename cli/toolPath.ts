/* micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
 * Copyright (C) 2026 Adam Tovatt
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

import { TilePosition, ToolName } from "../src/protocol";

// The tiles the command line's points name, and the paths of tile commands it sends from them

// The tools a player drags along a line of tiles, applied at every tile the line crosses. Every other tool puts down
// a building, which each point places by a click of its own.
export const LINE_TOOLS: ReadonlySet<ToolName> = new Set<ToolName>(["road", "rail", "wire", "bulldozer", "park"]);

// A tile written as x,y, two whole numbers from 0
export function parsePoint(text: string): TilePosition {
  const match = /^(\d+),(\d+)$/.exec(text);
  if (match === null) {
    throw new Error(`"${text}" isn't a tile: write one as x,y, such as 12,40`);
  }

  return {x: Number(match[1]), y: Number(match[2])};
}

// The tiles from each point to the next, along the row first and then the column, each tile one step along a row or
// column from the last, as a drag's are. A line with one point is that tile.
export function linePath(points: readonly TilePosition[]): TilePosition[] {
  if (points.length === 0) {
    throw new Error("A line needs at least one tile");
  }

  const path: TilePosition[] = [{...points[0]}];

  for (const next of points.slice(1)) {
    let {x, y} = path[path.length - 1];

    while (x !== next.x) {
      x += Math.sign(next.x - x);
      path.push({x, y});
    }

    while (y !== next.y) {
      y += Math.sign(next.y - y);
      path.push({x, y});
    }
  }

  return path;
}
