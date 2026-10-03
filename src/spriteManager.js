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

import { AirplaneSprite } from './airplaneSprite.js';
import { BoatSprite } from './boatSprite.js';
import { CopterSprite } from './copterSprite.js';
import { EventEmitter } from './eventEmitter.js';
import { ExplosionSprite } from './explosionSprite.js';
import * as Messages from './messages.ts';
import { MiscUtils } from './miscUtils.js';
import { MonsterSprite } from './monsterSprite.js';
import * as SpriteConstants from './spriteConstants.ts';
import { SpriteUtils } from './spriteUtils.js';
import { BULLBIT } from "./tileFlags.ts";
import { CHANNEL, RIVER } from "./tileValues.ts";
import { TornadoSprite } from './tornadoSprite.js';
import { TrainSprite } from './trainSprite.js';

// The sprites, as the original's sprite list holds them: the newest first, which is the order they move in. A sprite
// that dies stays in the list, with frame 0, until the next pass of moveObjects reaches it, and a new sprite of its
// type takes its place rather than joining the list, as the original's makeSprite reuses the sprite of a type.
var SpriteManager = EventEmitter(function(map, random) {
  this.spriteList = [];
  this.map = map;
  this.random = random;
  this.spriteCycle = 0;

  // The distance getDir last found, in pixels across and down, which the original keeps in one variable for every
  // sprite: a sprite that reads it without calling getDir first reads whatever distance getDir last found
  this.absDist = 0;
});


// The live sprite of the type, or null. Only explosions may be more than one of a type: the original never asks for
// one.
SpriteManager.prototype.getSprite = function(type) {
  var sprite = this._spriteOfType(type);

  if (sprite === null || sprite.frame === 0)
    return null;

  return sprite;
};


// The sprite of the type the list holds, alive or not, or null: the original's globalSprites entry
SpriteManager.prototype._spriteOfType = function(type) {
  for (var i = 0, l = this.spriteList.length; i < l; i++) {
    if (this.spriteList[i].type === type)
      return this.spriteList[i];
  }

  return null;
};


SpriteManager.prototype.getSpriteList = function() {
  return this.spriteList.slice();
};


// The sprites on the map: those the list holds but the dead, which stay in it until the sprites next move
SpriteManager.prototype.getLiveSprites = function() {
  return this.spriteList.filter(function(sprite) {
    return sprite.frame !== 0;
  });
};


var directionTable = [0, 3, 2, 1, 3, 4, 5, 7, 6, 5, 7, 8, 1];

// The direction from the origin to the destination, as a sprite's frame numbers it, and the distance between them,
// which it leaves in absDist
SpriteManager.prototype.getDir = function(orgX, orgY, destX, destY) {
  var deltaX = destX - orgX;
  var deltaY = destY - orgY;
  var i;

  if (deltaX < 0) {
    if (deltaY < 0) {
      i = 11;
    } else {
      i = 8;
    }
  } else {
    if (deltaY < 0) {
      i = 2;
    } else {
      i = 5;
    }
  }

  deltaX = Math.abs(deltaX);
  deltaY = Math.abs(deltaY);
  this.absDist = deltaX + deltaY;

  // The original's other branch tests deltaY * 2 < deltaY, which never holds, so a destination mostly across never
  // turns the direction toward the horizontal
  if (deltaX * 2 < deltaY)
    i++;

  if (i < 0 || i > 12)
    i = 0;

  return directionTable[i];
};


// Each sprite still in the list when the pass reaches it moves if it is alive, and leaves the list if it is not. A
// sprite created during the pass joins at the front, so it first moves next pass, and one that dies after the pass
// has passed it stays, dead, until the next.
SpriteManager.prototype.moveObjects = function(simData) {
  var disasterManager = simData.disasterManager;
  var blockMaps = simData.blockMaps;

  this.spriteCycle += 1;

  var list = this.spriteList.slice();

  for (var i = 0, l = list.length; i < l; i++) {
    var sprite = list[i];

    if (sprite.frame > 0)
      sprite.move(this.spriteCycle, disasterManager, blockMaps);
    else
      this.spriteList.splice(this.spriteList.indexOf(sprite), 1);
  }
};


// A sprite of the type at (x, y): the sprite of the type the list holds, started afresh where it stands in the list,
// or a new sprite at the front
SpriteManager.prototype.makeSprite = function(type, x, y) {
  var sprite = this._spriteOfType(type);

  if (sprite !== null) {
    constructors[type].call(sprite, this.map, this, this.random, x, y);
    return sprite;
  }

  return this._newSprite(type, x, y);
};


// A new sprite at the front of the list, whatever the list holds
SpriteManager.prototype._newSprite = function(type, x, y) {
  var sprite = new constructors[type](this.map, this, this.random, x, y);
  this._listenTo(sprite);
  this.spriteList.unshift(sprite);
  return sprite;
};


// Passes on the sprite's news
SpriteManager.prototype._listenTo = function(sprite) {
  for (var i = 0, l = Messages.CRASHES.length; i < l; i++)
    sprite.addEventListener(Messages.CRASHES[i], MiscUtils.reflectEvent.bind(this, Messages.CRASHES[i]));

  if (sprite.type == SpriteConstants.SPRITE_HELICOPTER)
    sprite.addEventListener(Messages.HEAVY_TRAFFIC, MiscUtils.reflectEvent.bind(this, Messages.HEAVY_TRAFFIC));
};


SpriteManager.prototype.save = function(saveData) {
  saveData.sprites = {
    spriteCycle: this.spriteCycle,
    absDist: this.absDist,
    list: this.spriteList.map(function(sprite) {
      return sprite.save();
    })
  };
};


SpriteManager.prototype.load = function(saveData) {
  var sprites = saveData.sprites;
  this.spriteCycle = sprites.spriteCycle;
  this.absDist = sprites.absDist;
  this.spriteList = [];

  for (var i = 0, l = sprites.list.length; i < l; i++) {
    var data = sprites.list[i];
    var constructor = constructors[data.type];

    if (constructor === undefined)
      throw new Error('A saved sprite has unknown type ' + data.type);

    // A sprite's constructor sets a new sprite's starting state, and may draw from the stream: a restored sprite takes
    // its saved state instead
    var sprite = Object.create(constructor.prototype);
    sprite.init(data.type, this.map, this, this.random, data.x, data.y);
    sprite.load(data);
    this._listenTo(sprite);
    this.spriteList.push(sprite);
  }
};


// A tornado somewhere away from the map's edges, or more time for the one already blowing
SpriteManager.prototype.makeTornado = function() {
  var sprite = this.getSprite(SpriteConstants.SPRITE_TORNADO);
  if (sprite !== null) {
    sprite.count = 200;
    return;
  }

  var x = this.random.getRandom(SpriteUtils.worldToPix(this.map.width) - 800) + 400;
  var y = this.random.getRandom(SpriteUtils.worldToPix(this.map.height) - 200) + 100;

  sprite = this.makeSprite(SpriteConstants.SPRITE_TORNADO, x, y);
  this._emitEvent(Messages.TORNADO_SIGHTED, {trackable: true, x: (x >> 4) + 3, y: (y >> 4) + 2, sprite: sprite});
};


// An explosion over the middle of the tile at (x, y), or nothing off the map
SpriteManager.prototype.makeExplosion = function(x, y) {
  if (this.map.testBounds(x, y))
    this.makeExplosionAt(SpriteUtils.worldToPix(x) + 8, SpriteUtils.worldToPix(y) + 8);
};


// A new explosion whose hot spot is the pixel (x, y): explosions are the one type the original adds however many the
// list holds
SpriteManager.prototype.makeExplosionAt = function(x, y) {
  this._newSprite(SpriteConstants.SPRITE_EXPLOSION, x - 40, y - 16);
};


SpriteManager.prototype.generatePlane = function(x, y) {
  if (this.getSprite(SpriteConstants.SPRITE_AIRPLANE) !== null)
    return;

  this.makeSprite(SpriteConstants.SPRITE_AIRPLANE,
                  SpriteUtils.worldToPix(x) + 48,
                  SpriteUtils.worldToPix(y) + 12);
};


SpriteManager.prototype.generateTrain = function(census, x, y) {
  if (census.totalPop > 20 &&
      this.getSprite(SpriteConstants.SPRITE_TRAIN) === null &&
      this.random.getRandom(25) === 0)
    this.makeSprite(SpriteConstants.SPRITE_TRAIN,
                    SpriteUtils.worldToPix(x) - 39,
                    SpriteUtils.worldToPix(y) + 6);
};


// A ship from the first channel tile, without flags, along an edge of the map, each edge with a chance in four
SpriteManager.prototype.generateShip = function() {
  var x,y;

  if (this.random.getChance(3)) {
    for (x = 4; x < this.map.width - 2; x++) {
      if (this.map.getTile(x, 0).getRawValue() === CHANNEL)  {
        this.makeShipHere(x, 0);
        return;
      }
    }
  }

  if (this.random.getChance(3)) {
    for (y = 1; y < this.map.height - 2; y++) {
      if (this.map.getTile(0, y).getRawValue() === CHANNEL)  {
        this.makeShipHere(0, y);
        return;
      }
    }
  }

  if (this.random.getChance(3)) {
    for (x = 4; x < this.map.width - 2; x++) {
      if (this.map.getTile(x, this.map.height - 1).getRawValue() === CHANNEL)  {
        this.makeShipHere(x, this.map.height - 1);
        return;
      }
    }
  }

  if (this.random.getChance(3)) {
    for (y = 1; y < this.map.height - 2; y++) {
      if (this.map.getTile(this.map.width - 1, y).getRawValue() === CHANNEL)  {
        this.makeShipHere(this.map.width - 1, y);
        return;
      }
    }
  }
};


// The distance in pixels, across and down, from the middle of the tile at (x, y) to the nearest live ship's hot spot:
// 99999 with none
SpriteManager.prototype.getBoatDistance = function(x, y) {
  var dist = 99999;
  var pixelX = SpriteUtils.worldToPix(x) + 8;
  var pixelY = SpriteUtils.worldToPix(y) + 8;

  for (var i = 0, l = this.spriteList.length; i < l; i++) {
    var sprite = this.spriteList[i];
    if (sprite.type === SpriteConstants.SPRITE_SHIP && sprite.frame !== 0) {
      var sprDist = Math.abs(sprite.x + sprite.xHot - pixelX) + Math.abs(sprite.y + sprite.yHot - pixelY);

      dist = Math.min(dist, sprDist);
    }
  }

  return dist;
};


SpriteManager.prototype.makeShipHere = function(x, y) {
  this.makeSprite(SpriteConstants.SPRITE_SHIP,
                  SpriteUtils.worldToPix(x) - 47,
                  SpriteUtils.worldToPix(y));
};


SpriteManager.prototype.generateCopter = function(x, y) {
  if (this.getSprite(SpriteConstants.SPRITE_HELICOPTER) !== null)
    return;

  this.makeSprite(SpriteConstants.SPRITE_HELICOPTER,
                  SpriteUtils.worldToPix(x),
                  SpriteUtils.worldToPix(y) + 30);
};


// The monster rises from the river tile at (x, y), which places its hot spot five tiles east and one south
SpriteManager.prototype.makeMonsterAt = function(x, y) {
  var sprite = this.makeSprite(SpriteConstants.SPRITE_MONSTER,
                  SpriteUtils.worldToPix(x) + 48,
                  SpriteUtils.worldToPix(y));
  this._emitEvent(Messages.MONSTER_SIGHTED, {trackable: true, x: x + 5, y: y, sprite: sprite});
};


// A monster from a river tile, without flags but the bulldozable one, or a live monster sent back to the most
// polluted place
SpriteManager.prototype.makeMonster = function() {
  var sprite = this.getSprite(SpriteConstants.SPRITE_MONSTER);
  if (sprite !== null) {
    sprite.soundCount = 1;
    sprite.count = 1000;
    sprite.destX = SpriteUtils.worldToPix(this.map.pollutionMaxX);
    sprite.destY = SpriteUtils.worldToPix(this.map.pollutionMaxY);
    return;
  }

  for (var i = 0; i < 300; i++)  {
    var x = this.random.getRandom(this.map.width - 20) + 10;
    var y = this.random.getRandom(this.map.height - 10) + 5;

    var rawValue = this.map.getTile(x, y).getRawValue();
    if (rawValue === RIVER || rawValue === (RIVER | BULLBIT)) {
      this.makeMonsterAt(x, y);
      return;
    }
  }

  this.makeMonsterAt(60, 50);
};


var constructors = {};
constructors[SpriteConstants.SPRITE_TRAIN] = TrainSprite;
constructors[SpriteConstants.SPRITE_SHIP] = BoatSprite;
constructors[SpriteConstants.SPRITE_MONSTER] = MonsterSprite;
constructors[SpriteConstants.SPRITE_HELICOPTER] = CopterSprite;
constructors[SpriteConstants.SPRITE_AIRPLANE] = AirplaneSprite;
constructors[SpriteConstants.SPRITE_TORNADO] = TornadoSprite;
constructors[SpriteConstants.SPRITE_EXPLOSION] = ExplosionSprite;


export { SpriteManager };
