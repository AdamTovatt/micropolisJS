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
import { PLANE_CRASHED } from './messages.ts';
import { MiscUtils } from './miscUtils.js';
import { SPRITE_AIRPLANE, SPRITE_HELICOPTER } from './spriteConstants.ts';
import { SpriteUtils } from './spriteUtils.js';

function AirplaneSprite(map, spriteManager, random, x, y) {
  this.init(SPRITE_AIRPLANE, map, spriteManager, random, x, y);
  if (x > SpriteUtils.worldToPix(map.width - 20)) {
    this.x -= 100 + 48;
    this.destX = this.x - 200;
    this.frame = 7;
  } else {
    this.destX = this.x + 200;
    this.frame = 11;
  }
  this.destY = this.y;
}


BaseSprite(AirplaneSprite, {width: 48, height: 48, xOffset: 24, yOffset: 0, xHot: 48, yHot: 16,
                            crashMessage: PLANE_CRASHED});


var xDelta = [0, 0, 6, 8, 6, 0, -6, -8, -6, 8, 8, 8];
var yDelta = [0, -8, -6, 0, 6, 8,  6, 0, -6, 0, 0, 0];

AirplaneSprite.prototype.move = function(spriteCycle, disasterManager) {
  var frame = this.frame;

  if ((spriteCycle % 5) === 0) {
    // Frames > 8 mean the plane is taking off
    if (frame > 8) {
      frame--;
      if (frame < 9) {
        // Planes always take off to the east
        frame = 3;
      }
      this.frame = frame;
    } else {
      var d = this.spriteManager.getDir(this.x, this.y, this.destX, this.destY);
      frame = SpriteUtils.turnTo(frame, d);
      this.frame = frame;
    }
  }

  // The distance getDir last found, which is the plane's own only on a step that turned it: on the others it is
  // whatever getDir last measured, for any sprite, as in the original
  if (this.spriteManager.absDist < 50) {
    // At the destination: pick another, anywhere up to 50 pixels off the map
    this.destX = this.random.getRandom(SpriteUtils.worldToPix(this.map.width) + 100) - 50;
    this.destY = this.random.getRandom(SpriteUtils.worldToPix(this.map.height) + 100) - 50;
  }

  if (disasterManager.disastersEnabled) {
    var explode = false;

    var spriteList = this.spriteManager.getSpriteList();
    for (var i = 0; i < spriteList.length; i++) {
      var s = spriteList[i];

      if (s.frame === 0 || s === this)
        continue;

      if ((s.type === SPRITE_HELICOPTER ||
           s.type === SPRITE_AIRPLANE) &&
            SpriteUtils.checkSpriteCollision(this, s)) {
        s.explodeSprite();
        explode = true;
      }
    }

    if (explode)
      this.explodeSprite();
  }

  this.x += xDelta[frame];
  this.y += yDelta[frame];

  if (this.spriteNotInBounds())
    this.frame = 0;
};


// Metadata for image loading
Object.defineProperties(AirplaneSprite,
  {ID: MiscUtils.makeConstantDescriptor(3),
   width: MiscUtils.makeConstantDescriptor(48),
   frames: MiscUtils.makeConstantDescriptor(11)});


export { AirplaneSprite };
