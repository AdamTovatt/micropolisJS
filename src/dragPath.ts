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

import { TilePosition, ToolName } from "./protocol";

// The tiles a drag passes over on its way from one tile to the next the mouse was seen on, so that a fast mouse skips
// none: the tiles after from, up to and including to, each one step along a row or a column from the one before, as a
// tool command's path takes them. They follow the line between the two tiles' centres, which crosses one column or row
// boundary at a time; where it crosses both at once, at a corner, the column comes first.
export function dragPath(from: TilePosition, to: TilePosition): TilePosition[] {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const stepX = Math.sign(to.x - from.x);
  const stepY = Math.sign(to.y - from.y);
  const path: TilePosition[] = [];
  let x = from.x;
  let y = from.y;

  // After crossing i column boundaries, the line crosses the next (i + 0.5) / dx of the way along, and likewise for
  // rows: crossing a column next is (2i + 1) / 2dx <= (2j + 1) / 2dy, kept in whole numbers
  for (let i = 0, j = 0; i < dx || j < dy;) {
    if (j === dy || (i < dx && (2 * i + 1) * dy <= (2 * j + 1) * dx)) {
      x += stepX;
      i++;
    } else {
      y += stepY;
      j++;
    }

    path.push({x, y});
  }

  return path;
}

// A tool and the tiles to apply it at, in order: one tool command
export interface ToolPath {
  tool: ToolName;
  path: TilePosition[];
}

// Gathers the tiles the player's clicks and drags reach into tool paths, which the game takes each tick and sends as
// tool commands. A click, or a drag's first tile, starts a path; each later tile a drag reaches extends it, with the
// tiles between the two filled in. A drag still under way when its path is taken goes on in a new path, from the tile
// it last reached. A drag that leaves the map starts afresh where it comes back.
export class ToolPaths {
  // Paths that a newer one ended since the last take
  private ended: ToolPath[] = [];
  // The path still gathering tiles, empty again once taken
  private current: ToolPath | null = null;
  // The tile a drag continues from, or null when the next tile starts a path
  private last: TilePosition | null = null;

  // The tool reached the tile: start is true for a click and for a drag's first tile
  reached(tool: ToolName, tile: TilePosition, start: boolean): void {
    if (start || this.last === null || this.current === null || tool !== this.current.tool) {
      this.endCurrent();
      this.current = {tool, path: [tile]};
    } else {
      this.current.path.push(...dragPath(this.last, tile));
    }

    this.last = tile;
  }

  // The pointer is off the map, or no tool is chosen: the next tile reached starts a path
  lost(): void {
    this.last = null;
  }

  // The paths gathered since the last take, in the order they were started
  take(): ToolPath[] {
    const continuing = this.current;
    this.endCurrent();
    if (continuing !== null) {
      this.current = {tool: continuing.tool, path: []};
    }

    const taken = this.ended;
    this.ended = [];
    return taken;
  }

  private endCurrent(): void {
    if (this.current !== null && this.current.path.length > 0) {
      this.ended.push(this.current);
    }
    this.current = null;
  }
}
