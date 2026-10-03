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

import { ANIMBIT, BIT_MASK, POWERBIT, ZONEBIT } from "./tileFlags";
import { TileHistory } from "./tileHistory";
import { LIGHTNINGBOLT, TILE_COUNT, TILE_INVALID } from "./tileValues";

// How long each animation frame shows, and how long an unpowered zone shows each side of its blink, in milliseconds
const ANIMATION_PERIOD = 50;
const BLINK_PERIOD = 500;

// Each animated tile's sequence, starting from its base tile, in which each tile is followed by the next. A sequence
// that ends on one of its earlier tiles loops back to it: to the base tile, or to the first frame after it where the
// base tile isn't itself a frame. A sequence that ends on a new tile holds it.
const ANIMATIONS: ReadonlyArray<ReadonlyArray<number>> = [
  [56, 57, 58, 59, 60, 61, 62, 63, 56],
  [80, 128, 112, 96, 80],
  [81, 129, 113, 97, 81],
  [82, 130, 114, 98, 82],
  [83, 131, 115, 99, 83],
  [84, 132, 116, 100, 84],
  [85, 133, 117, 101, 85],
  [86, 134, 118, 102, 86],
  [87, 135, 119, 103, 87],
  [88, 136, 120, 104, 88],
  [89, 137, 121, 105, 89],
  [90, 138, 122, 106, 90],
  [91, 139, 123, 107, 91],
  [92, 140, 124, 108, 92],
  [93, 141, 125, 109, 93],
  [94, 142, 126, 110, 94],
  [95, 143, 127, 111, 95],
  [144, 192, 176, 160, 144],
  [145, 193, 177, 161, 145],
  [146, 194, 178, 162, 146],
  [147, 195, 179, 163, 147],
  [148, 196, 180, 164, 148],
  [149, 197, 181, 165, 149],
  [150, 198, 182, 166, 150],
  [151, 199, 183, 167, 151],
  [152, 200, 184, 168, 152],
  [153, 201, 185, 169, 153],
  [154, 202, 186, 170, 154],
  [155, 203, 187, 171, 155],
  [156, 204, 188, 172, 156],
  [157, 205, 189, 173, 157],
  [158, 206, 190, 174, 158],
  [159, 207, 191, 175, 159],
  [621, 852, 853, 854, 855, 856, 857, 858, 859, 852],
  [641, 884, 885, 886, 887, 884],
  [644, 888, 889, 890, 891, 888],
  [649, 892, 893, 894, 895, 892],
  [650, 896, 897, 898, 899, 896],
  [676, 900, 901, 902, 903, 900],
  [677, 904, 905, 906, 907, 904],
  [686, 908, 909, 910, 911, 908],
  [689, 912, 913, 914, 915, 912],
  [747, 916, 917, 918, 919, 916],
  [748, 920, 921, 922, 923, 920],
  [751, 924, 925, 926, 927, 924],
  [752, 928, 929, 930, 931, 928],
  [820, 952, 953, 954, 955, 952],
  [832, 833, 834, 835, 836, 837, 838, 839, 832],
  [840, 841, 842, 843, 840],
  [844, 845, 846, 847, 848, 849, 850, 851, 844],
  // An explosion holds its last frame until the simulation's scan turns the tile to rubble
  [860, 861, 862, 863, 864, 865, 866, 867],
  [932, 933, 934, 935, 936, 937, 938, 939, 932],
  [940, 941, 942, 943, 944, 945, 946, 947, 940],
];

// The frame that follows each tile. A tile that is not animated, or a sequence's last frame that doesn't loop, is
// followed by itself.
const NEXT_FRAME: ReadonlyArray<number> = (() => {
  const next: number[] = [];
  for (let i = 0; i < TILE_COUNT; i++) {
    next[i] = i;
  }

  for (const sequence of ANIMATIONS) {
    for (let i = 1; i < sequence.length; i++) {
      next[sequence[i - 1]] = sequence[i];
    }
  }

  return next;
})();

function nextAnimationFrame(tileValue: number): number {
  return NEXT_FRAME[tileValue];
}

// Whether the tile's animation, starting from the tile, reaches the frame. The tile itself counts only if the animation
// returns to it. It is important that we use the base value as the starting point rather than the last painted value:
// base values often don't recur in their sequences.
function isInSequence(tileValue: number, frame: number): boolean {
  const seen = [tileValue];
  let current = NEXT_FRAME[tileValue];

  while (seen.indexOf(current) === -1) {
    if (current === frame) {
      return true;
    }

    seen.push(current);
    current = NEXT_FRAME[current];
  }
  return false;
}

// The map's extent, which is all the manager reads of it
interface MapBounds {
  readonly width: number;
  readonly height: number;
}

// Animates tiles from the client's clock, and blinks unpowered zones. It only chooses which frame to paint: it never
// writes the map.
class AnimationManager {
  // The clock times, in milliseconds, of the last frame change and the last blink. They start long past, so the first
  // paint changes both.
  private lastAnimation = Number.NEGATIVE_INFINITY;
  private lastBlink = Number.NEGATIVE_INFINITY;
  private shouldBlink = false;

  // The frames painted at each place in the view, by tile offset from its origin, so an animation carries on from the
  // frame painted there last. A tile that scrolls to another place starts its sequence again unless the frame there
  // belongs to the same sequence.
  private lastPainted: TileHistory | null = null;
  private currentPainted: TileHistory | null = null;

  constructor(private readonly map: MapBounds) {}

  // Takes an array of tile values, and overwrites with the correct tile after factoring in animations and power
  // blinks. offsetX and offsetY represent the offset into the map the tileValues represent; xBound and yBound note how
  // far to iterate (the idea being that GameCanvas recycles its tile value array)
  getTiles(tileValues: number[], offsetX: number, offsetY: number, xBound: number, yBound: number,
           isPaused = false): void {
    let shouldChangeAnimation = false;
    const now = Date.now();

    // Zones blink even while the game is paused
    if (now - this.lastBlink > BLINK_PERIOD) {
      this.shouldBlink = !this.shouldBlink;
      this.lastBlink = now;
    }
    const shouldBlink = this.shouldBlink;

    if (!isPaused) {
      if (now - this.lastAnimation > ANIMATION_PERIOD) {
        shouldChangeAnimation = true;
        this.lastAnimation = now;
      }
    }

    const newPainted = this.currentPainted === null ? new TileHistory() : this.currentPainted;

    for (let y = 0; y < yBound; y++) {
      for (let x = 0; x < xBound; x++) {
        const mapX = x + offsetX;
        const mapY = y + offsetY;
        const index = y * xBound + x;

        if (mapX < 0 || mapX >= this.map.width || mapY < 0 || mapY >= this.map.height) {
          continue;
        }

        const tile = tileValues[index];
        if (tile === TILE_INVALID) {
          continue;
        }

        if (shouldBlink && (tile & ZONEBIT) && !(tile & POWERBIT)) {
          tileValues[index] = LIGHTNINGBOLT;
          continue;
        }

        if (!(tile & ANIMBIT)) {
          tileValues[index] = tile & BIT_MASK;
          continue;
        }

        const tileValue = tile & BIT_MASK;
        let newTile = TILE_INVALID;
        const last = this.lastPainted === null ? undefined : this.lastPainted.getTile(x, y);
        // Have we painted any of this sequence here before? If not, we haven't painted anything here, or the last tile
        // painted here belongs to a different tile's animation sequence.
        const continuesSequence = last !== undefined && isInSequence(tileValue, last);

        if (shouldChangeAnimation) {
          // Paint the next frame: the one after the last painted, or the first of the sequence
          newTile = nextAnimationFrame(continuesSequence ? last : tileValue);
        } else if (continuesSequence) {
          // Paint the same frame again
          newTile = last;
        }

        if (newTile === TILE_INVALID) {
          tileValues[index] = tileValue;
          continue;
        }

        tileValues[index] = newTile;
        newPainted.setTile(x, y, newTile);
      }
    }

    // Rotate tile histories
    const temp = this.lastPainted;
    this.lastPainted = newPainted;

    if (temp !== null) {
      temp.clear();
    }
    this.currentPainted = temp;
  }
}

export { ANIMATION_PERIOD, AnimationManager, BLINK_PERIOD, isInSequence, nextAnimationFrame };
