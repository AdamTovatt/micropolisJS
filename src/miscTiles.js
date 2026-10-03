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

import { TileUtils } from './tileUtils.js';
import { DIRT, IZB, RADTILE } from "./tileValues.ts";
import { ZoneUtils } from './zoneUtils.js';

var xDelta = [-1,  0,  1,  0 ];
var yDelta = [ 0, -1,  0,  1 ];

var fireFound = function(map, x, y, simData) {
  simData.census.firePop += 1;

  if ((simData.random.getRandom16() & 3) !== 0)
    return;

  // Try to set neighbouring tiles on fire as well
  for (var i = 0; i < 4; i++) {
    if (simData.random.getChance(7)) {
      var xTem = x + xDelta[i];
      var yTem = y + yDelta[i];

      if (map.testBounds(xTem, yTem)) {
        var tile = map.getTile(xTem, yTem);
        if (!tile.isCombustible())
            continue;

        if (tile.isZone()) {
          // Neighbour is a zone and burnable
          ZoneUtils.fireZone(map, xTem, yTem, simData.blockMaps);

          // Industrial zones etc really go boom
          if (tile.getValue() > IZB)
            simData.spriteManager.makeExplosion(xTem, yTem);
        }

        map.setTo(xTem, yTem, TileUtils.randomFire(simData.random));
      }
    }
  }

  // Compute likelyhood of fire running out of fuel
  var rate = 10; // Likelyhood of extinguishing (bigger means less chance)
  i = simData.blockMaps.fireStationEffectMap.worldGet(x, y);

  if (i > 100)
    rate = 1;
  else if (i > 20)
    rate = 2;
  else if (i > 0)
    rate = 3;

  // Decide whether to put out the fire.
  if (simData.random.getRandom(rate) === 0)
    map.setTo(x, y, TileUtils.randomRubble(simData.random));
};


var radiationFound = function(map, x, y, simData) {
  if (simData.random.getChance(4095))
    map.setTile(x, y, DIRT, 0);
};


var floodFound = function(map, x, y, simData) {
  simData.disasterManager.doFlood(x, y, simData.blockMaps);
};


// The original's scan clears explosions from their middle frames on, as its map tiles step through the animation.
// Here the map keeps the frame an explosion was placed with and only the renderer animates it, so the whole range is
// cleared. An explosion lasts until its column's next scan, which at fast speed can come before its animation ends
var explosionFound = function(map, x, y, simData) {
  map.setTo(x, y, TileUtils.randomRubble(simData.random));
};


var MiscTiles = {
  registerHandlers: function(mapScanner) {
    mapScanner.addAction(TileUtils.isFire, fireFound);
    mapScanner.addAction(RADTILE, radiationFound);
    mapScanner.addAction(TileUtils.isFlood, floodFound);
    mapScanner.addAction(TileUtils.isManualExplosion, explosionFound);
  }
};


export { MiscTiles };
