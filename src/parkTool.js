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

import { BaseTool } from './baseTool.js';
import { ANIMBIT, BULLBIT, BURNBIT } from "./tileFlags.ts";
import { DIRT, FOUNTAIN, WOODS2 } from "./tileValues.ts";

var makeTool = BaseTool.makeTool;
var ParkTool = makeTool(function(map) {
  this.init(10, map);
});


// As putDownPark in the original, the tool picks what to plant before it looks at the tile, so it draws from the stream
// even where it can't plant
ParkTool.prototype.doTool = function(x, y, random) {
  var value = random.getRandom(4);

  if (this._worldEffects.getTileValue(x, y) !== DIRT) {
    this.result = this.TOOLRESULT_NEEDS_BULLDOZE;
    return;
  }

  var tileFlags = BURNBIT | BULLBIT;
  var tileValue;

  if (value === 4) {
    tileValue = FOUNTAIN;
    tileFlags |= ANIMBIT;
  } else {
    tileValue = value + WOODS2;
  }

  this._worldEffects.setTile(x, y, tileValue, tileFlags);
  this.addCost(10);
  this.result = this.TOOLRESULT_OK;
};


export { ParkTool };
