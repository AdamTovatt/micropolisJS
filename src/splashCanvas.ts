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

import { placeNewCanvas, requiredElement } from "./domElements";
import type { TileSet } from "./tileSet";
import type { PixelPoint } from "./viewPosition";

// What the preview reads of the map
interface PreviewMap {
  readonly width: number;
  readonly height: number;
  getTileValue(x: number, y: number): number;
}

// Each tile is drawn this many pixels square: the canvas scales the tile's image down
const PREVIEW_TILE_SIZE = 3;

const CANVAS_ID = "SplashCanvas";

// Where the tile at map position (x, y) is drawn on the preview, in canvas pixels
function previewTileOrigin(x: number, y: number): PixelPoint {
  return {x: x * PREVIEW_TILE_SIZE, y: y * PREVIEW_TILE_SIZE};
}

// Paints the minimap the player sees when choosing a map to play on. It is a far lighter cousin of GameCanvas: the
// map is painted once, and again whenever the player generates a new one.
class SplashCanvas {
  static readonly DEFAULT_WIDTH = 360;
  static readonly DEFAULT_HEIGHT = 300;

  private readonly canvas: HTMLCanvasElement;

  // Creates the canvas in the container with the given id, replacing an earlier preview's canvas there. It paints
  // nothing until asked to paint a map.
  constructor(parentId: string, private readonly tileSet: TileSet) {
    if (!tileSet.isValid) {
      throw new Error("Tileset is not valid!");
    }

    this.canvas = placeNewCanvas(requiredElement(parentId), CANVAS_ID);
    this.canvas.width = SplashCanvas.DEFAULT_WIDTH;
    this.canvas.height = SplashCanvas.DEFAULT_HEIGHT;
  }

  paint(map: PreviewMap): void {
    const ctx = this.canvas.getContext("2d")!;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const origin = previewTileOrigin(x, y);
        ctx.drawImage(this.tileSet.tile(map.getTileValue(x, y)), origin.x, origin.y, PREVIEW_TILE_SIZE,
                      PREVIEW_TILE_SIZE);
      }
    }
  }
}

export { PREVIEW_TILE_SIZE, SplashCanvas, previewTileOrigin };
export type { PreviewMap };
