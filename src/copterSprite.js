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
import { HEAVY_TRAFFIC, HELICOPTER_CRASHED, SOUND_HEAVY_TRAFFIC } from './messages.ts';
import { MiscUtils } from './miscUtils.js';
import { SPRITE_HELICOPTER, SPRITE_MONSTER, SPRITE_TORNADO } from './spriteConstants.ts';
import { SpriteUtils } from './spriteUtils.js';

function CopterSprite(map, spriteManager, random, x, y) {
  this.init(SPRITE_HELICOPTER, map, spriteManager, random, x, y);
  this.frame = 5;
  this.count = 1500;
  this.destX = this.random.getRandom(SpriteUtils.worldToPix(map.width) - 1);
  this.destY = this.random.getRandom(SpriteUtils.worldToPix(map.height) - 1);
  this.origX = x - 30;
  this.origY = y;
}


BaseSprite(CopterSprite, {width: 32, height: 32, xOffset: 32, yOffset: -16, xHot: 40, yHot: -8,
                          crashMessage: HELICOPTER_CRASHED});


var xDelta = [0, 0, 3, 5, 3, 0, -3, -5, -3];
var yDelta = [0, -5, -3, 0, 3, 5, 3, 0, -3];

CopterSprite.prototype.move = function(spriteCycle, disasterManager, blockMaps) {
  if (this.soundCount > 0)
    this.soundCount--;

  if (this.count > 0)
    this.count--;

  if (this.count === 0) {
    // Head towards a monster, and certain doom
    var s = this.spriteManager.getSprite(SPRITE_MONSTER);

    if (s !== null) {
      this.destX = s.x;
      this.destY = s.y;
    } else {
      // No monsters. Hm. I bet flying near that tornado is sensible
      s = this.spriteManager.getSprite(SPRITE_TORNADO);

      if (s !== null) {
          this.destX = s.x;
          this.destY = s.y;
      } else {
          this.destX = this.origX;
          this.destY = this.origY;
      }
    }

    // If near home, let's get her on the ground
    this.spriteManager.getDir(this.x, this.y, this.origX, this.origY);
    if (this.spriteManager.absDist < 30) {
      this.frame = 0;
      return;
    }
  }

  if (this.soundCount === 0) {
    var x = SpriteUtils.truncatingPixToWorld(this.x + 48);
    var y = SpriteUtils.truncatingPixToWorld(this.y);

    if (x >= 0 && x < this.map.width && y >= 0 && y < this.map.height) {
      if (blockMaps.trafficDensityMap.worldGet(x, y) > 170 && (this.random.getRandom16() & 7) === 0) {
        this._emitEvent(HEAVY_TRAFFIC, {showable: true, x: x + 1, y: y + 1});
        this._emitEvent(SOUND_HEAVY_TRAFFIC);
        this.soundCount = 200;
      }
    }
  }

  var frame = this.frame;

  if ((spriteCycle & 3) === 0) {
    var dir = this.spriteManager.getDir(this.x, this.y, this.destX, this.destY);
    frame = SpriteUtils.turnTo(frame, dir);
    this.frame = frame;
  }

  this.x += xDelta[frame];
  this.y += yDelta[frame];
};


// Metadata for image loading
Object.defineProperties(CopterSprite,
  {ID: MiscUtils.makeConstantDescriptor(2),
   width: MiscUtils.makeConstantDescriptor(32),
   frames: MiscUtils.makeConstantDescriptor(8)});


export { CopterSprite };
