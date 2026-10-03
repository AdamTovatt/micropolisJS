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

import { EventEmitter } from './eventEmitter.js';
import * as Messages from './messages.ts';
import { SPRITE_AIRPLANE } from './spriteConstants.ts';
import { TileUtils } from './tileUtils.js';
import * as TileValues from "./tileValues.ts";
import { ZoneUtils } from './zoneUtils.js';

var DisasterManager = EventEmitter(function(map, spriteManager, random) {
  this._map = map;
  this._spriteManager = spriteManager;
  this._random = random;

  this._floodCount = 0;
  this.disastersEnabled = false;
});


DisasterManager.prototype.save = function(saveData) {
  saveData.disasters = {floodCount: this._floodCount, disastersEnabled: this.disastersEnabled};
};


DisasterManager.prototype.load = function(saveData) {
  this._floodCount = saveData.disasters.floodCount;
  this.disastersEnabled = saveData.disasters.disastersEnabled;
};


// The maximum of the draw a disaster needs a 0 from, at each level: getRandom includes its maximum, so the chance is one
// in one more than these
var DisChance = [10 * 48, 5 * 48, 60];

DisasterManager.prototype.doDisasters = function(gameLevel, census) {
  if (this._floodCount)
      this._floodCount--;

  // TODO Scenarios

  if (!this.disastersEnabled)
      return;

  if (!this._random.getRandom(DisChance[gameLevel])) {
    switch (this._random.getRandom(8)) {
      case 0:
      case 1:
        this.setFire();
        break;

      case 2:
      case 3:
        this.makeFlood();
        break;

      case 4:
        break;

      case 5:
        this._spriteManager.makeTornado();
        break;

      case 6:
        this.makeEarthquake();
        break;

      case 7:
      case 8:
        if (census.pollutionAverage > 60)
          this._spriteManager.makeMonster();
        break;
    }
  }
};


DisasterManager.prototype.scenarioDisaster = function() {
  // TODO Scenarios
};


// User initiated meltdown: need to find the plant first
DisasterManager.prototype.makeMeltdown = function() {
  for (var x = 0; x < (this._map.width - 1); x++) {
    for (var y = 0; y < (this._map.height - 1); y++) {
      if (this._map.getTileValue(x, y) === TileValues.NUCLEAR) {
        this.doMeltdown(x, y);
        return;
      }
    }
  }
};


var vulnerable = function(tile) {
  var tileValue = tile.getValue();

  if (tileValue < TileValues.RESBASE || tileValue > TileValues.LASTZONE || tile.isZone())
    return false;

  return true;
};


// An earthquake, of a strength drawn first: each of that many tiles drawn at random, if a building but no zone's centre,
// falls to rubble three times in four, and catches fire the fourth. The original's doEarthquake, which shakes the
// screen, is the client's to do on the news.
DisasterManager.prototype.makeEarthquake = function() {
  var strength = this._random.getRandom(700) + 300;

  this._emitEvent(Messages.EARTHQUAKE, {showable: true, x: this._map.cityCentreX, y: this._map.cityCentreY});

  for (var i = 0; i < strength; i++)  {
    var x = this._random.getRandom(this._map.width - 1);
    var y = this._random.getRandom(this._map.height - 1);

    if (!this._map.testBounds(x, y))
      continue;

    if (vulnerable(this._map.getTile(x, y))) {
      if ((i & 0x3) !== 0)
        this._map.setTo(x, y, TileUtils.randomRubble(this._random));
      else
        this._map.setTo(x, y, TileUtils.randomFire(this._random));
    }
  }
};


// The random fire: one tile drawn at random, which burns if it is a building, but no zone's centre
DisasterManager.prototype.setFire = function() {
  var x = this._random.getRandom(this._map.width - 1);
  var y = this._random.getRandom(this._map.height - 1);
  var tile = this._map.getTile(x, y);

  if (!tile.isZone()) {
    var tileValue = tile.getValue();
    if (tileValue > TileValues.LHTHR && tileValue < TileValues.LASTZONE) {
      this._map.setTo(x, y, TileUtils.randomFire(this._random));
      this._emitEvent(Messages.FIRE_REPORTED, {showable: true, x: x, y: y});
    }
  }
};


// User initiated plane crash: the plane in the air, or a new one over the land away from the map's edges, crashes. The
// original's engine has no crash; this is MakeAirCrash from its older C version.
DisasterManager.prototype.makeCrash = function() {
  if (this._spriteManager.getSprite(SPRITE_AIRPLANE) === null) {
    var x = this._random.getRandom(this._map.width - 20) + 10;
    var y = this._random.getRandom(this._map.height - 10) + 5;
    this._spriteManager.generatePlane(x, y);
  }

  this._spriteManager.getSprite(SPRITE_AIRPLANE).explodeSprite();
};


// User initiated fire: up to 40 tiles drawn at random until one burns, which must be flammable, past the trees, and no
// zone's centre. The original reports it without a picture.
DisasterManager.prototype.makeFire = function() {
  for (var i = 0; i < 40; i++) {
    var x = this._random.getRandom(this._map.width - 1);
    var y = this._random.getRandom(this._map.height - 1);
    var tile = this._map.getTile(x, y);

    if (!tile.isZone() && tile.isCombustible()) {
      var tileValue = tile.getValue();
      if (tileValue > TileValues.TREEBASE && tileValue < TileValues.LASTZONE) {
        this._map.setTo(x, y, TileUtils.randomFire(this._random));
        this._emitEvent(Messages.FIRE_REPORTED, {x: x, y: y});
        return;
      }
    }
  }
};


var Dx = [ 0, 1, 0, -1];
var Dy = [-1, 0, 1, 0];

DisasterManager.prototype.makeFlood = function() {
  for (var i = 0; i < 300; i++) {
    var x = this._random.getRandom(this._map.width - 1);
    var y = this._random.getRandom(this._map.height - 1);
    if (!this._map.testBounds(x, y))
      continue;

    var tileValue = this._map.getTileValue(x, y);

    if (tileValue > TileValues.CHANNEL && tileValue <= TileValues.WATER_HIGH) {
      for (var j = 0; j < 4; j++) {
        var xx = x + Dx[j];
        var yy = y + Dy[j];

        if (!this._map.testBounds(xx, yy))
          continue;

        var tile = this._map.getTile(xx, yy);

        // As in the original, only dirt without flags counts as dirt
        if (tile.getRawValue() === TileValues.DIRT || (tile.isBulldozable() && tile.isCombustible())) {
          this._map.setTile(xx, yy, TileValues.FLOOD, 0);
          this._floodCount = 30;
          this._emitEvent(Messages.FLOODING_REPORTED, {showable: true, x: xx, y: yy});
          return;
        }
      }
    }
  }
};


DisasterManager.prototype.doFlood = function(x, y, blockMaps) {
  if (this._floodCount > 0) {
    // Flood is not over yet
    for (var i = 0; i < 4; i++) {
      if (this._random.getChance(7)) {
        var xx = x + Dx[i];
        var yy = y + Dy[i];

        if (this._map.testBounds(xx, yy)) {
          var tile = this._map.getTile(xx, yy);
          var tileValue = tile.getValue();

          // As in makeFlood, only bare dirt, carrying no flags, floods unless it burns
          if (tile.isCombustible() || tile.getRawValue() === TileValues.DIRT ||
              (tileValue >= TileValues.WOODS5 && tileValue < TileValues.FLOOD)) {
            if (tile.isZone())
              ZoneUtils.fireZone(this._map, xx, yy, blockMaps);

            this._map.setTile(xx, yy, TileValues.FLOOD + this._random.getRandom(2), 0);
          }
        }
      }
    }
  } else {
    if (this._random.getChance(15))
      this._map.setTile(x, y, TileValues.DIRT, 0);
  }
};


DisasterManager.prototype.doMeltdown = function(x, y) {
  this._spriteManager.makeExplosion(x - 1, y - 1);
  this._spriteManager.makeExplosion(x - 1, y + 2);
  this._spriteManager.makeExplosion(x + 2, y - 1);
  this._spriteManager.makeExplosion(x + 2, y + 2);

  var dY, dX;

  // Whole power plant is on fire
  for (dX = x - 1; dX < x + 3; dX++) {
    for (dY = y - 1; dY < y + 3; dY++) {
      this._map.setTo(dX, dY, TileUtils.randomFire(this._random));
    }
  }

  // Add lots of radiation tiles around the plant
  for (var i = 0; i < 200; i++)  {
    dX = x - 20 + this._random.getRandom(40);
    dY = y - 15 + this._random.getRandom(30);

    if (!this._map.testBounds(dX, dY))
      continue;

    var tile = this._map.getTile(dX, dY);

    if (tile.isZone())
        continue;

    // As in the original, only dirt without flags counts as dirt
    if (tile.isCombustible() || tile.getRawValue() === TileValues.DIRT)
        this._map.setTile(dX, dY, TileValues.RADTILE, 0);
  }

  // Report disaster to the user
  this._emitEvent(Messages.NUCLEAR_MELTDOWN, {showable: true, x: x, y: y});
};


export { DisasterManager };
