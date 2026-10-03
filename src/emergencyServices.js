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

import { Position } from './position.ts';
import { FIRESTATION, POLICESTATION } from "./tileValues.ts";

var handleService = function(censusStat, budgetEffect, blockMap) {
  return function(map, x, y, simData) {
    simData.census[censusStat] += 1;

    var effect = simData.budget[budgetEffect];
    var isPowered = map.getTile(x, y).isPowered();
    // Unpowered buildings are half as effective
    if (!isPowered)
      effect = Math.floor(effect / 2);

    // As the original's doSpecialZone does, the effect is noted at the road tile found on the station's perimeter,
    // which may be in a block other than the station's, or at the station when it has no road
    var pos = new Position(x, y);
    var roadPos = simData.trafficManager.findPerimeterRoad(pos);
    if (roadPos === null) {
      effect = Math.floor(effect / 2);
      roadPos = pos;
    }

    var currentEffect = simData.blockMaps[blockMap].worldGet(roadPos.x, roadPos.y);
    currentEffect += effect;
    simData.blockMaps[blockMap].worldSet(roadPos.x, roadPos.y, currentEffect);
  };
};


var policeStationFound = handleService('policeStationPop', 'policeEffect', 'policeStationMap');
var fireStationFound = handleService('fireStationPop', 'fireEffect', 'fireStationMap');


var EmergencyServices = {
  registerHandlers: function(mapScanner) {
    mapScanner.addAction(POLICESTATION, policeStationFound);
    mapScanner.addAction(FIRESTATION, fireStationFound);
  }
};


export { EmergencyServices };
