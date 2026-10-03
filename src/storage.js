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

import { MiscUtils } from './miscUtils.js';
import { Random } from './random.ts';
import { UiRandom } from './uiRandom.ts';

// A very thin wrapper around localStorage, in case we wish to move to some other storage mechanism
// (such as indexedDB) in the future

var getSavedGame = function() {
  var savedGame = window.localStorage.getItem(this.KEY);

  if (savedGame !== null) {
    savedGame = JSON.parse(savedGame);

    if (savedGame.version !== this.CURRENT_VERSION)
      this.transitionOldSave(savedGame);

    // Flag as a saved game for Game/Simulation etc...
    savedGame.isSavedGame = true;
  }

  return savedGame;
};


var saveGame = function(gameData) {
  gameData.version = this.CURRENT_VERSION;
  gameData = JSON.stringify(gameData);

  window.localStorage.setItem(this.KEY, gameData);
};


var transitionOldSave = function(savedGame) {
  switch (savedGame.version) {
    case 1:
      savedGame.everClicked = false;

      /* falls through */
    case 2:
      savedGame.pollutionMaxX = Math.floor(savedGame.width / 2);
      savedGame.pollutionMaxY = Math.floor(savedGame.height / 2);
      savedGame.cityCentreX = Math.floor(savedGame.width / 2);
      savedGame.cityCentreY = Math.floor(savedGame.height / 2);

      /* falls through */
    case 3:
      // Saves before the seeded stream have no seed: the city continues from a fresh one
      savedGame.seed = UiRandom.newSeed();
      savedGame.randomState = Random.simulationStream(savedGame.seed).getState();
      savedGame._speedCycle = 0;

      /* falls through */
    case 4:
      // Saves before version 5 hold only part of the state. The rest starts as it did when such a save was loaded:
      // no sprites, disasters off, the counters and the evaluation's working values reset, and the evaluation due
      // again. The scanned state can only be derived by a scan: a null scannedState, which only a migrated save
      // holds, makes the Simulation scan for it on load.
      savedGame._phaseCycle = 0;
      savedGame._simCycle = 0;
      savedGame._cityPopLast = 0;
      savedGame._messageLast = null;
      savedGame._lastPowerMessage = null;
      savedGame._initialEvaluationPending = true;
      savedGame.evaluation = {cityYes: 0, cityPop: 0, cityPopDelta: 0, cityAssessedValue: 0, cityClassLast: 'VILLAGE',
                              cityScoreDelta: 0, problemVotes: [0, 1, 2, 3, 4, 5, 6].map(function(i) {
                                return {index: i, voteCount: 0};
                              }), problemOrder: [7, 7, 7, 7]};
      savedGame.valves = {resCap: false, comCap: false, indCap: false};
      savedGame.budget = {cashFlow: 0, taxFund: 0, awaitingValues: false};
      savedGame.sprites = {spriteCycle: 0, list: []};
      savedGame.disasters = {floodCount: 0, disastersEnabled: false};
      savedGame.scannedState = null;

      break;

    default:
      throw new Error('Unknown save version!');
  }
};


var Storage = {
  getSavedGame: getSavedGame,
  saveGame: saveGame,
  transitionOldSave: transitionOldSave
};


Object.defineProperty(Storage, 'CURRENT_VERSION', MiscUtils.makeConstantDescriptor(5));
Object.defineProperty(Storage, 'KEY', MiscUtils.makeConstantDescriptor('micropolisJSGame'));
Object.defineProperty(Storage, 'canStore', MiscUtils.makeConstantDescriptor(window.localStorage !== undefined));


export { Storage };
