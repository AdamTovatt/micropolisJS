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
  }

  return savedGame;
};


var saveGame = function(gameData) {
  gameData.version = this.CURRENT_VERSION;
  gameData = JSON.stringify(gameData);

  window.localStorage.setItem(this.KEY, gameData);
};


// Moves top-level keys of an old save into a new object, each under its new name, and returns the object
var regroup = function(savedGame, newNames) {
  var group = {};
  Object.keys(newNames).forEach(function(oldName) {
    group[newNames[oldName]] = savedGame[oldName];
    delete savedGame[oldName];
  });

  return group;
};


var sameNames = function(names) {
  var newNames = {};
  names.forEach(function(name) {
    newNames[name] = name;
  });

  return newNames;
};


// Version 5 keeps each component's state under its own key, and holds the complete state. Version 4 kept every field
// at the top level: the names below are version 4's, and never change with today's components. The state version 4
// lacks starts as it did when such a save was loaded: no sprites, disasters off, the counters and the evaluation's
// working values reset, and the evaluation due again. The scanned state can only be derived by a scan: a null
// scannedState, which only a migrated save holds, makes the Simulation scan for it on load.
var migrateToVersion5 = function(savedGame) {
  // Whether the player followed the donation link, which version 4 kept for a donation request no game makes any more
  delete savedGame.everClicked;

  var simulation = regroup(savedGame, {_cityTime: 'cityTime', _gameLevel: 'gameLevel', _speed: 'speed',
                                       _speedCycle: 'speedCycle', seed: 'seed', randomState: 'randomState'});
  simulation.phaseCycle = 0;
  simulation.simCycle = 0;
  simulation.cityPopLast = 0;
  simulation.messageLast = null;
  simulation.lastPowerMessage = null;
  simulation.initialEvaluationPending = true;

  var tiles = savedGame.map;
  delete savedGame.map;
  var map = regroup(savedGame, sameNames(['width', 'height', 'cityCentreX', 'cityCentreY', 'pollutionMaxX',
                                          'pollutionMaxY']));
  map.tiles = tiles.map(function(tile) {
    return tile.value;
  });

  var evaluation = regroup(savedGame, sameNames(['cityClass', 'cityScore']));
  evaluation.cityYes = 0;
  evaluation.cityPop = 0;
  evaluation.cityPopDelta = 0;
  evaluation.cityAssessedValue = 0;
  evaluation.cityClassLast = 'VILLAGE';
  evaluation.cityScoreDelta = 0;
  evaluation.problemVotes = [0, 1, 2, 3, 4, 5, 6].map(function(i) {
    return {index: i, voteCount: 0};
  });
  evaluation.problemOrder = [7, 7, 7, 7];

  var valves = regroup(savedGame, sameNames(['resValve', 'comValve', 'indValve']));
  valves.resCap = false;
  valves.comCap = false;
  valves.indCap = false;

  var budget = regroup(savedGame, sameNames(['autoBudget', 'totalFunds', 'policePercent', 'roadPercent', 'firePercent',
                                             'roadSpend', 'policeSpend', 'fireSpend', 'roadMaintenanceBudget',
                                             'policeMaintenanceBudget', 'fireMaintenanceBudget', 'cityTax',
                                             'roadEffect', 'policeEffect', 'fireEffect']));
  budget.cashFlow = 0;
  budget.taxFund = 0;
  budget.awaitingValues = false;

  var census = regroup(savedGame, sameNames(['resPop', 'comPop', 'indPop', 'crimeRamp', 'pollutionRamp',
                                             'landValueAverage', 'pollutionAverage', 'crimeAverage', 'totalPop',
                                             'resHist10', 'resHist120', 'comHist10', 'comHist120', 'indHist10',
                                             'indHist120', 'crimeHist10', 'crimeHist120', 'moneyHist10',
                                             'moneyHist120', 'pollutionHist10', 'pollutionHist120']));

  savedGame.simulation = simulation;
  savedGame.map = map;
  savedGame.evaluation = evaluation;
  savedGame.valves = valves;
  savedGame.budget = budget;
  savedGame.census = census;
  savedGame.sprites = {spriteCycle: 0, list: []};
  savedGame.disasters = {floodCount: 0, disastersEnabled: false};
  savedGame.scannedState = null;
};


var transitionOldSave = function(savedGame) {
  switch (savedGame.version) {
    case 1:
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
      migrateToVersion5(savedGame);
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
