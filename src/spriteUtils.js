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

import { ANIMBIT, BULLBIT } from "./tileFlags.ts";
import * as TileValues from "./tileValues.ts";
import { ZoneUtils } from './zoneUtils.js';

var pixToWorld = function(p) {
  return p >> 4;
};


// The tile of a pixel by C's integer division, which truncates toward zero, as the original's p / 16: the pixels from
// -15 to -1 fall in tile 0, where pixToWorld's shift puts them in tile -1
var truncatingPixToWorld = function(p) {
  return p < 0 ? 0 - ((-p) >> 4) : p >> 4;
};


var worldToPix = function(w) {
  return w << 4;
};


// Attempt to move 45° towards the desired direction, either
// clockwise or anticlockwise, whichever gets us there quicker
var turnTo = function(presentDir, desiredDir) {
  if (presentDir === desiredDir)
      return presentDir;

  if (presentDir < desiredDir) {
    // select clockwise or anticlockwise
    if (desiredDir - presentDir < 4)
      presentDir++;
    else
      presentDir--;
  } else {
    if (presentDir - desiredDir < 4)
      presentDir--;
    else
      presentDir++;
  }

  if (presentDir > 8)
    presentDir = 1;

  if (presentDir < 1)
    presentDir = 8;

  return presentDir;
};


var getTileValue = function(map, x, y) {
  var wX = pixToWorld(x);
  var wY = pixToWorld(y);

  if (wX < 0 || wX >= map.width || wY < 0 || wY >= map.height)
    return -1;

  return map.getTileValue(wX, wY);
};


var checkWet = function(tileValue) {
  if (tileValue === TileValues.HPOWER || tileValue === TileValues.VPOWER ||
      tileValue === TileValues.HRAIL || tileValue === TileValues.VRAIL ||
      tileValue === TileValues.BRWH || tileValue === TileValues.BRWV)
    return true;
  else
    return false;
};


var destroyMapTile = function(spriteManager, map, blockMaps, ox, oy) {
  var x = pixToWorld(ox);
  var y = pixToWorld(oy);

  if (!map.testBounds(x, y))
    return;

  var tile = map.getTile(x, y);
  var tileValue = tile.getValue();

  if (tileValue < TileValues.TREEBASE)
    return;

  if (!tile.isCombustible()) {
    if (tileValue >= TileValues.ROADBASE && tileValue <= TileValues.LASTROAD)
      map.setTile(x, y, TileValues.RIVER, 0);

    return;
  }

  if (tile.isZone()) {
    ZoneUtils.fireZone(map, x, y, blockMaps);

    if (tileValue > TileValues.RZB)
      spriteManager.makeExplosionAt(ox, oy);
  }

  if (checkWet(tileValue))
    map.setTile(x, y, TileValues.RIVER, 0);
  else
    map.setTile(x, y, TileValues.TINYEXP, BULLBIT | ANIMBIT);
};


var getDistance = function(x1, y1, x2, y2) {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
};


// Whether two live sprites' hot spots are close enough to collide
var checkSpriteCollision = function(s1, s2) {
  return s1.frame !== 0 && s2.frame !== 0 &&
         getDistance(s1.x + s1.xHot, s1.y + s1.yHot, s2.x + s2.xHot, s2.y + s2.yHot) < 30;
};


var SpriteUtils = {
  checkSpriteCollision: checkSpriteCollision,
  destroyMapTile: destroyMapTile,
  getTileValue: getTileValue,
  turnTo: turnTo,
  pixToWorld: pixToWorld,
  truncatingPixToWorld: truncatingPixToWorld,
  worldToPix: worldToPix
};


export { SpriteUtils };
