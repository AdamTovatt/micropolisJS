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

import { TILE_COUNT } from "./tileValues";

// Tiles must be 16px square
const TILE_SIZE = 16;
const TILES_PER_ROW = Math.sqrt(TILE_COUNT);
const ACCEPTABLE_DIMENSION = TILES_PER_ROW * TILE_SIZE;

// We expect tilesets to be square, and of the required width/height
function isAcceptableTileImage(width: number, height: number): boolean {
  return width === height && width === ACCEPTABLE_DIMENSION;
}

// Where a tile's image starts in the tileset image, in pixels: tiles run in rows, in order of their value
function tileImageOrigin(tileValue: number): {x: number, y: number} {
  return {
    x: tileValue % TILES_PER_ROW * TILE_SIZE,
    y: Math.floor(tileValue / TILES_PER_ROW) * TILE_SIZE,
  };
}

// Splits a tileset image into one image per tile. Creation is asynchronous: the set calls back once every tile's
// image has loaded, or calls the error callback if the image is not an acceptable tileset.
class TileSet {
  readonly tileWidth = TILE_SIZE;
  private loaded = false;
  private readonly images: HTMLImageElement[] = [];

  // An image of the wrong size, such as one still loading, calls the error callback
  constructor(image: HTMLImageElement, callback: () => void, errorCallback: () => void) {
    if (!isAcceptableTileImage(image.width, image.height)) {
      // Spin the event loop
      setTimeout(errorCallback, 0);
      return;
    }

    this.splitImage(image, callback);
  }

  // Whether every tile's image has loaded
  get isValid(): boolean {
    return this.loaded;
  }

  // The image of the tile with the given value
  tile(tileValue: number): HTMLImageElement {
    return this.images[tileValue];
  }

  // Break up the source image into tiles by painting each tile onto a canvas, computing the dataURI of the canvas, and
  // using that to create a new image
  private splitImage(image: HTMLImageElement, callback: () => void): void {
    const tileWidth = this.tileWidth;

    // We paint the image onto a canvas so we can split it up
    const c = document.createElement("canvas");
    c.width = tileWidth;
    c.height = tileWidth;
    const cx = c.getContext("2d")!;

    // Checks to see if we are done creating images, and if so notifies the caller
    let notifications = 0;
    const imageLoad = () => {
      notifications++;

      if (notifications === TILE_COUNT) {
        this.loaded = true;
        // Spin the event loop
        setTimeout(callback, 0);
      }
    };

    for (let i = 0; i < TILE_COUNT; i++) {
      cx.clearRect(0, 0, tileWidth, tileWidth);

      const source = tileImageOrigin(i);
      cx.drawImage(image, source.x, source.y, tileWidth, tileWidth, 0, 0, tileWidth, tileWidth);

      const tile = new Image();
      tile.onload = imageLoad;
      tile.src = c.toDataURL();
      this.images[i] = tile;
    }
  }
}

export { TileSet, isAcceptableTileImage, tileImageOrigin };
