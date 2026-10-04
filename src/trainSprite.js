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

import { BaseSprite } from './baseSprite.js';
import { TRAIN_CRASHED } from './messages.ts';
import { MiscUtils } from './miscUtils.js';
import { SPRITE_TRAIN } from './spriteConstants.ts';
import { SpriteUtils } from './spriteUtils.js';
import * as TileValues from "./tileValues.ts";

function TrainSprite(map, spriteManager, random, x, y) {
  this.init(SPRITE_TRAIN, map,
            spriteManager, random, x, y);
  this.frame = 1;
  this.dir = 4;
}


BaseSprite(TrainSprite, {width: 32, height: 32, xOffset: 32, yOffset: -16, xHot: 40, yHot: -8,
                         crashMessage: TRAIN_CRASHED});


var tileDeltaX = [  0, 16, 0, -16];
var tileDeltaY = [-16, 0, 16, 0 ];
var xDelta = [  0, 4, 0, -4, 0];
var yDelta = [ -4, 0, 4, 0, 0];

// Frame values
var NORTHSOUTH = 1;
var EASTWEST = 2;
var NWSE = 3;
var NESW = 4;
var UNDERWATER = 5;

// Direction values: 0 north, 1 east, 2 south, 3 west
var CANTMOVE = 4;

// A turn between north and west, or between east and south, has directions summing to this, and shows the NWSE frame
var NWSE_TURN_SUM = 3;

// The frame for each direction of travel
var TrainPic2 = [NORTHSOUTH, EASTWEST, NORTHSOUTH, EASTWEST, UNDERWATER];

TrainSprite.prototype.move = function(spriteCycle) {
  // Trains can only move in the 4 cardinal directions
  // Over the course of 4 frames, we move through a tile, so
  // ever fourth frame, we try to find a direction to move in
  // (excluding the opposite direction from the current direction
  // of travel). If there is no possible direction found, our direction
  // is set to CANTMOVE. (Thus, if we're in a dead end, we can start heading
  // backwards next time round). If we fail to find a destination after 2 attempts,
  // we die.

  if (this.frame === NWSE || this.frame === NESW)
    this.frame = TrainPic2[this.dir];

  this.x += xDelta[this.dir];
  this.y += yDelta[this.dir];

  // Find a new direction.
  if ((spriteCycle & 3) === 0) {
    // Choose a random starting point for our search
    var dir = this.random.getRandom16() & 3;

    for (var i = dir; i < dir + 4; i++) {
      var dir2 = i & 3;

      if (this.dir !== CANTMOVE) {
        // Avoid the opposite direction
        if (dir2 === ((this.dir + 2) & 3))
            continue;
      }

      var tileValue = SpriteUtils.getTileValue(this.map, this.x + tileDeltaX[dir2] + 48, this.y + tileDeltaY[dir2]);

      if ((tileValue >= TileValues.RAILBASE && tileValue <= TileValues.LASTRAIL) ||
          tileValue === TileValues.RAILVPOWERH || tileValue === TileValues.RAILHPOWERV) {
        if (this.dir !== dir2 && this.dir !== CANTMOVE) {
          if (this.dir + dir2 === NWSE_TURN_SUM)
            this.frame = NWSE;
          else
            this.frame = NESW;
        } else {
          this.frame = TrainPic2[dir2];
        }

        if (tileValue === TileValues.HRAIL || tileValue === TileValues.VRAIL)
          this.frame = UNDERWATER;

        this.dir = dir2;
        return;
      }
    }

    // Nowhere to go. Die.
    if (this.dir === CANTMOVE) {
      this.frame = 0;
      return;
    }

    // We didn't find a direction this time. We'll try the opposite
    // next time around
    this.dir = CANTMOVE;
  }
};


// Metadata for image loading
Object.defineProperties(TrainSprite,
  {ID: MiscUtils.makeConstantDescriptor(1),
   width: MiscUtils.makeConstantDescriptor(32),
   frames: MiscUtils.makeConstantDescriptor(5)});


export { TrainSprite };
