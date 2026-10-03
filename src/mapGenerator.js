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

import { getRandomCardinalDirection, getRandomDirection } from './direction.ts';
import { GameMap } from './gameMap.js';
import { Position } from './position.ts';
import { BLBNBIT, BULLBIT } from "./tileFlags.ts";
import { CHANNEL, DIRT, REDGE, RIVER, WOODS, WOODS_LOW, WOODS_HIGH } from "./tileValues.ts";

var TERRAIN_TREE_LEVEL = -1;
var TERRAIN_LAKE_LEVEL = -1;
var TERRAIN_CURVE_LEVEL = -1;
var ISLAND_RADIUS = 18;

// Generates a map from the given stream: the same stream state always generates the same map
var MapGenerator = function(random, w, h) {
  w = w || 120;
  h = h || 100;

  var createIsland = random.getRandom(2) - 1;

  var map = new GameMap(w, h);
  // Construct land.
  if (createIsland < 0) {
    if (random.getRandom(100) < 10) {
      makeIsland(map, random);
      return map;
    }
  }

  if (createIsland === 1)
    makeNakedIsland(map, random);
  else
    clearMap(map);

  // Lay a river.
  if (TERRAIN_CURVE_LEVEL !== 0) {
    var terrainXStart = 40 + random.getRandom(map.width - 80);
    var terrainYStart = 33 + random.getRandom(map.height - 67);

    var terrainPos = new Position(terrainXStart, terrainYStart);
    doRivers(map, terrainPos, random);
  }

  // Lay a few lakes.
  if (TERRAIN_LAKE_LEVEL !== 0)
      makeLakes(map, random);

  smoothRiver(map, random);

  // And add trees.
  if (TERRAIN_TREE_LEVEL !== 0)
      doTrees(map, random);

  return map;
};


var clearMap = function(map) {
  for (var x = 0; x < map.width; x++) {
    for (var y = 0; y < map.height; y++) {
      map.setTile(x, y, DIRT, 0);
    }
  }
};


var makeNakedIsland = function(map, random) {
  var terrainIslandRadius = ISLAND_RADIUS;
  var x, y;

  for (x = 0; x < map.width; x++) {
    for (y = 0; y < map.height; y++) {
      if ((x < 5) || (x >= map.width - 5) ||
          (y < 5) || (y >= map.height - 5)) {
        map.setTile(x, y, RIVER, 0);
      } else {
        map.setTile(x, y, DIRT, 0);
      }
    }
  }

  for (x = 0; x < map.width - 5; x += 2) {
    var mapY = random.getERandom(terrainIslandRadius);
    plopBRiver(map, new Position(x, mapY));

    mapY = (map.height - 10) - random.getERandom(terrainIslandRadius);
    plopBRiver(map, new Position(x, mapY));

    plopSRiver(map, new Position(x, 0));
    plopSRiver(map, new Position(x, map.height - 6));
  }

  for (y = 0; y < map.height - 5; y += 2) {
    var mapX = random.getERandom(terrainIslandRadius);
    plopBRiver(map, new Position(mapX, y));

    mapX = map.width - 10 - random.getERandom(terrainIslandRadius);
    plopBRiver(map, new Position(mapX, y));

    plopSRiver(map, new Position(0, y));
    plopSRiver(map, new Position(map.width - 6, y));
  }
};


var makeIsland = function(map, random) {
  makeNakedIsland(map, random);
  smoothRiver(map, random);
  doTrees(map, random);
};


var makeLakes = function(map, random) {
  var numLakes;
  if (TERRAIN_LAKE_LEVEL < 0)
      numLakes = random.getRandom(10);
  else
      numLakes = TERRAIN_LAKE_LEVEL / 2;

  while (numLakes > 0) {
    var x = random.getRandom(map.width - 21) + 10;
    var y = random.getRandom(map.height - 20) + 10;

    makeSingleLake(map, new Position(x, y), random);
    numLakes--;
  }
};


var makeSingleLake = function(map, pos, random) {
  var numPlops = random.getRandom(12) + 2;

  while (numPlops > 0) {
    // The original's Position(pos, dx, dy) offsets pos. C++ leaves the order of the two draws unspecified; the port
    // draws the x offset first.
    var plopPos = new Position(pos.x + random.getRandom(12) - 6, pos.y + random.getRandom(12) - 6);

    if (random.getRandom(4))
        plopSRiver(map, plopPos);
    else
        plopBRiver(map, plopPos);

    numPlops--;
  }
};


var treeSplash = function(map, x, y, random) {
  var numTrees;

  if (TERRAIN_TREE_LEVEL < 0)
    numTrees = random.getRandom(150) + 50;
  else
    numTrees = random.getRandom(100 + (TERRAIN_TREE_LEVEL * 2)) + 50;

  var treePos = new Position(x, y);

  while (numTrees > 0) {
    var dir = getRandomDirection(random);
    treePos = Position.move(treePos, dir);

    if (!map.isPositionInBounds(treePos))
      return;

    if (map.getTileValue(treePos) === DIRT)
      map.setTile(treePos, WOODS, BLBNBIT);

    numTrees--;
  }
};


var doTrees = function(map, random) {
  var amount;

  if (TERRAIN_TREE_LEVEL < 0)
    amount = random.getRandom(100) + 50;
  else
    amount = TERRAIN_TREE_LEVEL + 3;

  for (var x = 0; x < amount; x++) {
      var xloc = random.getRandom(map.width - 1);
      var yloc = random.getRandom(map.height - 1);
      treeSplash(map, xloc, yloc, random);
  }

  smoothTrees(map);
  smoothTrees(map);
};


var riverEdges = [
  13 | BULLBIT, 13 | BULLBIT, 17 | BULLBIT, 15 | BULLBIT,
   5 | BULLBIT,        RIVER, 19 | BULLBIT, 17 | BULLBIT,
   9 | BULLBIT, 11 | BULLBIT,        RIVER, 13 | BULLBIT,
   7 | BULLBIT,  9 | BULLBIT,  5 | BULLBIT,        RIVER];

var smoothRiver = function(map, random) {
  var dx = [-1,  0,  1,  0];
  var dy = [0,  1,  0, -1];

  for (var x = 0; x < map.width; x++) {
    for (var y = 0; y < map.height; y++) {
      if (map.getTileValue(x, y) === REDGE) {
        var bitIndex = 0;

        for (var z = 0; z < 4; z++) {
          bitIndex = bitIndex << 1;
          var xTemp = x + dx[z];
          var yTemp = y + dy[z];
          if (map.testBounds(xTemp, yTemp) &&
              map.getTileValue(xTemp, yTemp) !== DIRT &&
              (map.getTileValue(xTemp, yTemp) < WOODS_LOW ||
               map.getTileValue(xTemp, yTemp) > WOODS_HIGH)) {
            bitIndex++;
          }
        }

        var temp = riverEdges[bitIndex & 15];
        if (temp !== RIVER && random.getRandom(1))
          temp++;

        map.setTileValue(x, y, temp, 0);
      }
    }
  }
};


var isTree = function(tileValue) {
  return tileValue >= WOODS_LOW && tileValue <= WOODS_HIGH;
};


var smoothTrees = function(map) {
  for (var x = 0; x < map.width; x++) {
    for (var y = 0; y < map.height; y++) {
      if (isTree(map.getTileValue(x, y)))
        smoothTreesAt(map, x, y, false);
    }
  }
};


var treeTable = [
   0,   0,  0, 34,
   0,   0, 36, 35,
   0,  32,  0, 33,
  30,  31, 29, 37];

var smoothTreesAt = function(map, x, y, preserve) {
  var dx = [-1,  0,  1,  0 ];
  var dy = [ 0,  1,  0, -1 ];
  if (!isTree(map.getTileValue(x, y)))
      return;

  var bitIndex = 0;
  for (var i = 0; i < 4; i++) {
    bitIndex = bitIndex << 1;
    var xTemp = x + dx[i];
    var yTemp = y + dy[i];
    if (map.testBounds(xTemp, yTemp) &&
        isTree(map.getTileValue(xTemp, yTemp)))
      bitIndex++;
  }

  var temp = treeTable[bitIndex & 15];
  if (temp) {
    if (temp !== WOODS) {
      if ((x + y) & 1)
          temp = temp - 8;
    }
    map.setTile(x, y, temp, BLBNBIT);
  } else {
    if (!preserve)
      map.setTileValue(x, y, temp, 0);
  }
};



var doRivers = function(map, terrainPos, random) {
  var riverDir = getRandomCardinalDirection(random);
  doBRiver(map, terrainPos, riverDir, riverDir, random);

  riverDir = riverDir.oppositeDirection();
  var terrainDir = doBRiver(map, terrainPos, riverDir, riverDir, random);

  riverDir = getRandomCardinalDirection(random);
  doSRiver(map, terrainPos, riverDir, terrainDir, random);
};


var doBRiver = function(map, pos, riverDir, terrainDir, random) {
  var rate1, rate2;

  if (TERRAIN_CURVE_LEVEL < 0) {
    rate1 = 100;
    rate2 = 200;
  } else {
    rate1 = TERRAIN_CURVE_LEVEL + 10;
    rate2 = TERRAIN_CURVE_LEVEL + 100;
  }

  while (map.testBounds(pos.x + 4, pos.y + 4)) {
    plopBRiver(map, pos);
    if (random.getRandom(rate1) < 10) {
      terrainDir = riverDir;
    } else {
      if (random.getRandom(rate2) > 90)
        terrainDir = terrainDir.rotateClockwise();
      if (random.getRandom(rate2) > 90)
        terrainDir = terrainDir.rotateCounterClockwise();
    }
    pos = Position.move(pos, terrainDir);
  }

  return terrainDir;
};


var doSRiver = function(map, pos, riverDir, terrainDir, random) {
  var rate1, rate2;

  if (TERRAIN_CURVE_LEVEL < 0) {
    rate1 = 100;
    rate2 = 200;
  } else {
    rate1 = TERRAIN_CURVE_LEVEL + 10;
    rate2 = TERRAIN_CURVE_LEVEL + 100;
  }

  while (map.testBounds(pos.x + 3, pos.y + 3)) {
    plopSRiver(map, pos);
    if (random.getRandom(rate1) < 10) {
      terrainDir = riverDir;
    } else {
      if (random.getRandom(rate2) > 90)
        terrainDir = terrainDir.rotateClockwise();
      if (random.getRandom(rate2) > 90)
        terrainDir = terrainDir.rotateCounterClockwise();
    }
    pos = Position.move(pos, terrainDir);
  }

  return terrainDir;
};


var putOnMap = function(map, newVal, x, y) {
  if (newVal === 0)
    return;

  if (!map.testBounds(x, y))
    return;

  var tileValue = map.getTileValue(x, y);

  if (tileValue !== DIRT) {
    if (tileValue === RIVER) {
      if (newVal !== CHANNEL)
          return;
    }
    if (tileValue === CHANNEL)
      return;
  }
  map.setTile(x, y, newVal, 0);
};


var plopBRiver = function(map, pos) {
  var BRMatrix = [
   [    0,     0,     0, REDGE,  REDGE,  REDGE,     0,     0,     0],
   [    0,     0, REDGE, RIVER,  RIVER,  RIVER, REDGE,     0,     0],
   [    0, REDGE, RIVER, RIVER,  RIVER,  RIVER, RIVER, REDGE,     0],
   [REDGE, RIVER, RIVER, RIVER,  RIVER,  RIVER, RIVER, RIVER, REDGE],
   [REDGE, RIVER, RIVER, RIVER, CHANNEL, RIVER, RIVER, RIVER, REDGE],
   [REDGE, RIVER, RIVER, RIVER,  RIVER,  RIVER, RIVER, RIVER, REDGE],
   [    0, REDGE, RIVER, RIVER,  RIVER,  RIVER, RIVER, REDGE,     0],
   [    0,     0, REDGE, RIVER,  RIVER,  RIVER, REDGE,     0,     0],
   [    0,     0,     0, REDGE,  REDGE,  REDGE,     0,     0,     0]];

  for (var x = 0; x < 9; x++) {
    for (var y = 0; y < 9; y++) {
      putOnMap(map, BRMatrix[y][x], pos.x + x, pos.y + y);
    }
  }
};


var plopSRiver = function(map, pos) {
  var SRMatrix = [
    [    0,     0, REDGE, REDGE,     0,     0],
    [    0, REDGE, RIVER, RIVER, REDGE,     0],
    [REDGE, RIVER, RIVER, RIVER, RIVER, REDGE],
    [REDGE, RIVER, RIVER, RIVER, RIVER, REDGE],
    [    0, REDGE, RIVER, RIVER, REDGE,     0],
    [    0,     0, REDGE, REDGE,     0,     0]];


  for (var x = 0; x < 6; x++) {
    for (var y = 0; y < 6; y++) {
      putOnMap(map, SRMatrix[y][x], pos.x + x, pos.y + y);
    }
  }
};


export { MapGenerator };
