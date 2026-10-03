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

import { BlockMap } from './blockMap.ts';
import { forEachCardinalDirection } from './direction.ts';
import { EventEmitter } from './eventEmitter.js';
import { Position } from './position.ts';
import { NOT_ENOUGH_POWER } from './messages.ts';
import { ANIMBIT, BURNBIT, CONDBIT, POWERBIT } from "./tileFlags.ts";
import { COALSMOKE1, COALSMOKE2, COALSMOKE3, COALSMOKE4, NUCLEAR, POWERPLANT } from "./tileValues.ts";

var COAL_POWER_STRENGTH = 700;
var NUCLEAR_POWER_STRENGTH = 2000;


var PowerManager = EventEmitter(function(map) {
  this._map = map;
  this._powerStack = [];
  this.powerGridMap = new BlockMap(this._map.width, this._map.height, 1);

  // Every tile the scan has reached, powered or not. The scan walks on past the capacity limit to measure the
  // full load, and only the tiles it reached within the limit are marked in powerGridMap.
  this._visitedMap = new BlockMap(this._map.width, this._map.height, 1);

  // The result of the last scan. The load is counted in the same steps the capacity is compared against, so
  // the load exceeds the capacity exactly when the scan reports NOT_ENOUGH_POWER.
  this.powerCapacity = 0;
  this.powerLoad = 0;
});


PowerManager.prototype.setTilePower = function(x, y) {
  var tile = this._map.getTile(x, y);
  var tileValue = tile.getValue();

  if (tileValue === NUCLEAR || tileValue === POWERPLANT ||
      this.powerGridMap.worldGet(x, y) > 0) {
    tile.addFlags(POWERBIT);
    return;
  }

  tile.removeFlags(POWERBIT);
};


// The last power scan's grid and figures, and the stack of power sources the map scan found, which the next power
// scan consumes: part of the simulation's scanned state. The visited map is left out: each power scan clears it
// before reading it.
PowerManager.prototype.saveScan = function(scanData) {
  scanData.powerGrid = this.powerGridMap.save();
  scanData.powerStack = this._powerStack.map(function(pos) {
    return {x: pos.x, y: pos.y};
  });
  scanData.powerCapacity = this.powerCapacity;
  scanData.powerLoad = this.powerLoad;
};


PowerManager.prototype.loadScan = function(scanData) {
  this.powerGridMap.load(scanData.powerGrid);
  this._powerStack = scanData.powerStack.map(function(pos) {
    return new Position(pos.x, pos.y);
  });
  this.powerCapacity = scanData.powerCapacity;
  this.powerLoad = scanData.powerLoad;
};


PowerManager.prototype.clearPowerStack = function() {
  this._powerStack = [];
};


PowerManager.prototype.testForConductive = function(pos, testDir) {
  var movedPos = Position.move(pos, testDir);

  if (this._map.isPositionInBounds(movedPos)) {
    if (this._map.getTile(movedPos.x, movedPos.y).isConductive()) {
      if (this._visitedMap.worldGet(movedPos.x, movedPos.y) === 0)
          return true;
    }
  }

  return false;
};


// Note: the algorithm is buggy: if you have two adjacent power
// plants, the second will be regarded as drawing power from the first
// rather than as a power source itself
PowerManager.prototype.doPowerScan = function(census) {
  // Clear power this._map.
  this.powerGridMap.clear();
  this._visitedMap.clear();

  // Power that the combined coal and nuclear power plants can deliver.
  var maxPower = census.coalPowerPop * COAL_POWER_STRENGTH +
                 census.nuclearPowerPop * NUCLEAR_POWER_STRENGTH;

  var powerConsumption = 0; // Amount of power used.

  // The original stops the walk at the first step past maxPower. This walk goes on to the end to measure the
  // load, and stops powering tiles at that same step, so it powers exactly the tiles the original does.
  while (this._powerStack.length > 0) {
    var pos = this._powerStack.pop();
    var anyDir = undefined;
    var conNum;
    do {
      powerConsumption++;

      if (anyDir)
        pos = Position.move(pos, anyDir);

      this._visitedMap.worldSet(pos.x, pos.y, 1);
      if (powerConsumption <= maxPower)
        this.powerGridMap.worldSet(pos.x, pos.y, 1);
      conNum = 0;

      forEachCardinalDirection(dir => {
        if (conNum >= 2) {
          return;
        }

        if (this.testForConductive(pos, dir)) {
          conNum++;
          anyDir = dir;
        }
      });

      if (conNum > 1)
        this._powerStack.push(new Position(pos.x, pos.y));
    } while (conNum);
  }

  this.powerCapacity = maxPower;
  this.powerLoad = powerConsumption;

  if (powerConsumption > maxPower)
    this._emitEvent(NOT_ENOUGH_POWER);
};


// The coal plant's smokestacks, relative to its centre, and their smoke tiles
var dX = [1, 2, 1, 2];
var dY = [-1, -1, 0, 0];
var smokeTiles = [COALSMOKE1, COALSMOKE2, COALSMOKE3, COALSMOKE4];

PowerManager.prototype.coalPowerFound = function(map, x, y, simData) {
  simData.census.coalPowerPop += 1;

  this._powerStack.push(new Position(x, y));

  // As coalSmoke in simulate.cpp does, set the smokestacks to their animated smoke tiles
  for (var i = 0; i < 4; i++)
    map.setTile(x + dX[i], y + dY[i], smokeTiles[i], ANIMBIT | CONDBIT | POWERBIT | BURNBIT);
};


var meltdownTable = [30000, 20000, 10000];

PowerManager.prototype.nuclearPowerFound = function(map, x, y, simData) {
  // TODO With the auto repair system, zone gets repaired before meltdown
  // In original Micropolis code, we bail and don't repair if melting down
  if (simData.disasterManager.disastersEnabled &&
      simData.random.getRandom(meltdownTable[simData.gameLevel]) === 0) {
    simData.disasterManager.doMeltdown(x, y);
    return;
  }

  // As doSpecialZone in the original does, the plant's tiles are left as they are
  simData.census.nuclearPowerPop += 1;
  this._powerStack.push(new Position(x, y));
};


PowerManager.prototype.registerHandlers = function(mapScanner, repairManager) {
  mapScanner.addAction(POWERPLANT, this.coalPowerFound.bind(this));
  mapScanner.addAction(NUCLEAR, this.nuclearPowerFound.bind(this));
  repairManager.addAction(POWERPLANT, 7, 4);
  repairManager.addAction(NUCLEAR, 7, 4);
};


export { PowerManager };
