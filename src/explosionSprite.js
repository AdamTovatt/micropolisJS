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
import { EXPLOSION_REPORTED, SOUND_EXPLOSIONHIGH } from './messages.ts';
import { MiscUtils } from './miscUtils.js';
import { SPRITE_EXPLOSION } from './spriteConstants.ts';
import { TileUtils } from './tileUtils.js';
import { DIRT } from "./tileValues.ts";

function ExplosionSprite(map, spriteManager, random, x, y) {
  this.init(SPRITE_EXPLOSION, map, spriteManager, random, x, y);
  this.frame = 1;
}


BaseSprite(ExplosionSprite, {width: 48, height: 48, xOffset: 24, yOffset: 0, xHot: 40, yHot: 16});


// Fire on the tile under the pixel (x, y), if it burns or is bare dirt, and isn't a zone's centre
ExplosionSprite.prototype.startFire = function(x, y) {
  x = x >> 4;
  y = y >> 4;

  if (!this.map.testBounds(x, y))
    return;

  var tile = this.map.getTile(x, y);
  var tileValue = tile.getValue();

  if (!tile.isCombustible() && tileValue !== DIRT)
    return;

  if (tile.isZone())
    return;

  this.map.setTo(x, y, TileUtils.randomFire(this.random));
};


ExplosionSprite.prototype.move = function(spriteCycle) {
  if ((spriteCycle & 1) === 0) {
    if (this.frame === 1) {
      this._emitEvent(SOUND_EXPLOSIONHIGH);
      this._emitEvent(EXPLOSION_REPORTED, {x: (this.x >> 4) + 3, y: this.y >> 4});
    }

    this.frame++;
  }

  // Burnt out: fire under the hot spot, and on the four tiles diagonally around it
  if (this.frame > 6) {
    this.frame = 0;

    this.startFire(this.x + 48 - 8, this.y + 16);
    this.startFire(this.x + 48 - 24, this.y);
    this.startFire(this.x + 48 + 8, this.y);
    this.startFire(this.x + 48 - 24, this.y + 32);
    this.startFire(this.x + 48 + 8, this.y + 32);
  }
};


// Metadata for image loading
Object.defineProperties(ExplosionSprite,
  {ID: MiscUtils.makeConstantDescriptor(7),
   width: MiscUtils.makeConstantDescriptor(48),
   frames: MiscUtils.makeConstantDescriptor(6)});


export { ExplosionSprite };
