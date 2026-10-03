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

import { Budget } from "./budget.js";
import { Random } from "./random";
import { UiRandom } from "./uiRandom";

// The text a game is saved as, and the migration of a save from an older version to the current one. Both belong to
// the simulation's side of the city source: the page stores a save's text and hands it back without reading it
// (storage.ts).

// A saved game, as JSON: the simulation's save, the game's own keys, and the version stamped on it. A migration
// rewrites saves of versions no type of today's describes, so it reads and writes their keys as plain JSON, and each
// step reads a key as the value that version held.
export type SavedGame = Record<string, unknown>;

// The text a game is saved as: its save data, stamped with the current version. A save file holds the same text.
function serialise(gameData: object): string {
  Object.assign(gameData, {version: CURRENT_VERSION});
  return JSON.stringify(gameData);
}

// A saved game from its text, migrated to the current version
function parse(text: string): SavedGame {
  const savedGame = JSON.parse(text) as SavedGame;

  if (savedGame.version !== CURRENT_VERSION) {
    transitionOldSave(savedGame);
  }

  return savedGame;
}

// One of a save's groups: the object under a top-level key
function group(savedGame: SavedGame, key: string): SavedGame {
  return savedGame[key] as SavedGame;
}

// Moves top-level keys of an old save into a new object, each under its new name, and returns the object
function regroup(savedGame: SavedGame, newNames: Record<string, string>): SavedGame {
  const regrouped: SavedGame = {};
  Object.keys(newNames).forEach((oldName) => {
    regrouped[newNames[oldName]] = savedGame[oldName];
    delete savedGame[oldName];
  });

  return regrouped;
}

function sameNames(names: string[]): Record<string, string> {
  const newNames: Record<string, string> = {};
  names.forEach((name) => {
    newNames[name] = name;
  });

  return newNames;
}

// Version 5 keeps each component's state under its own key, and holds the complete state. Version 4 kept every field
// at the top level: the names below are version 4's, and never change with today's components. The state version 4
// lacks starts as it did when such a save was loaded: no sprites, disasters off, the counters and the evaluation's
// working values reset, and the evaluation due again. The scanned state can only be derived by a scan: a null
// scannedState, which only a migrated save holds, makes the Simulation scan for it on load.
function migrateToVersion5(savedGame: SavedGame): void {
  const simulation = regroup(savedGame, {_cityTime: "cityTime", _gameLevel: "gameLevel", _speed: "speed",
                                         _speedCycle: "speedCycle", seed: "seed", randomState: "randomState"});
  simulation.phaseCycle = 0;
  simulation.simCycle = 0;
  simulation.cityPopLast = 0;
  simulation.messageLast = null;
  simulation.lastPowerMessage = null;
  simulation.initialEvaluationPending = true;

  // Version 4 held each tile as an object
  const tiles = savedGame.map as {value: number}[];
  delete savedGame.map;
  const map = regroup(savedGame, sameNames(["width", "height", "cityCentreX", "cityCentreY", "pollutionMaxX",
                                            "pollutionMaxY"]));
  map.tiles = tiles.map((tile) => tile.value);

  const evaluation = regroup(savedGame, sameNames(["cityClass", "cityScore"]));
  evaluation.cityYes = 0;
  evaluation.cityPop = 0;
  evaluation.cityPopDelta = 0;
  evaluation.cityAssessedValue = 0;
  evaluation.cityClassLast = "VILLAGE";
  evaluation.cityScoreDelta = 0;
  evaluation.problemVotes = [0, 1, 2, 3, 4, 5, 6].map((i) => ({index: i, voteCount: 0}));
  evaluation.problemOrder = [7, 7, 7, 7];

  const valves = regroup(savedGame, sameNames(["resValve", "comValve", "indValve"]));
  valves.resCap = false;
  valves.comCap = false;
  valves.indCap = false;

  const budget = regroup(savedGame, sameNames(["autoBudget", "totalFunds", "policePercent", "roadPercent",
                                               "firePercent", "roadSpend", "policeSpend", "fireSpend",
                                               "roadMaintenanceBudget", "policeMaintenanceBudget",
                                               "fireMaintenanceBudget", "cityTax", "roadEffect", "policeEffect",
                                               "fireEffect"]));
  budget.cashFlow = 0;
  budget.taxFund = 0;
  budget.awaitingValues = false;

  const census = regroup(savedGame, sameNames(["resPop", "comPop", "indPop", "crimeRamp", "pollutionRamp",
                                               "landValueAverage", "pollutionAverage", "crimeAverage", "totalPop",
                                               "resHist10", "resHist120", "comHist10", "comHist120", "indHist10",
                                               "indHist120", "crimeHist10", "crimeHist120", "moneyHist10",
                                               "moneyHist120", "pollutionHist10", "pollutionHist120"]));

  savedGame.simulation = simulation;
  savedGame.map = map;
  savedGame.evaluation = evaluation;
  savedGame.valves = valves;
  savedGame.budget = budget;
  savedGame.census = census;
  savedGame.sprites = {spriteCycle: 0, list: []};
  savedGame.disasters = {floodCount: 0, disastersEnabled: false};
  savedGame.scannedState = null;
}

// The step that upgrades a save from each old version to the next: the first from version 1 to 2, and each after it
// from the version after. A save is upgraded by every step from its own version's on, and the current version is the
// one the last step upgrades to.
const UPGRADES: ReadonlyArray<(savedGame: SavedGame) => void> = [
  // From version 1
  () => {
    // Version 2 added the flag for whether the player had followed the donation link, which the step from version 5
    // drops again
  },

  // From version 2
  (savedGame) => {
    const width = savedGame.width as number;
    const height = savedGame.height as number;
    savedGame.pollutionMaxX = Math.floor(width / 2);
    savedGame.pollutionMaxY = Math.floor(height / 2);
    savedGame.cityCentreX = Math.floor(width / 2);
    savedGame.cityCentreY = Math.floor(height / 2);
  },

  // From version 3
  (savedGame) => {
    // Saves before the seeded stream have no seed: the city continues from a fresh one
    const seed = UiRandom.newSeed();
    savedGame.seed = seed;
    savedGame.randomState = Random.simulationStream(seed).getState();
    savedGame._speedCycle = 0;
  },

  // From version 4
  migrateToVersion5,

  // From version 5
  (savedGame) => {
    // Version 5 kept whether the player had followed the donation link, for a donation request the game no longer
    // makes
    delete savedGame.everClicked;
  },

  // From version 6
  (savedGame) => {
    // The score breakdown wasn't recorded: show none until the next evaluation
    group(savedGame, "evaluation").cityScoreBreakdown = [];
  },

  // From version 7
  (savedGame) => {
    // Auto-bulldoze is the player's preference, kept apart from the city under its own key, so a save no longer holds
    // it. The setting the save held is dropped rather than copied into the preference: the save is read on every page
    // load, so a copy would overwrite whatever the player had since chosen.
    delete savedGame.autoBulldoze;

    // Nor does the year-end budget wait for the player any more: a save made while it waited pays it on load, with the
    // values it holds, as the city now pays it at the year end. This is the one migration step that runs a game rule,
    // because no rewriting of the fields can stand in for a year end that never happened.
    if (group(savedGame, "budget").awaitingValues) {
      const budget = new Budget();
      budget.load(savedGame);
      budget.doBudgetNow();
      budget.save(savedGame);
    }

    delete group(savedGame, "budget").awaitingValues;
  },

  // From version 8
  (savedGame) => {
    // An evaluation wrote every problem in vote order, with null for none past the worst four: keep the worst four,
    // with 7 for none, as a new city and the original keep them
    const evaluation = group(savedGame, "evaluation");
    evaluation.problemOrder = (evaluation.problemOrder as (number | null)[]).slice(0, 4).map((problem) => {
      return problem === null ? 7 : problem;
    });
  },
];

const CURRENT_VERSION = UPGRADES.length + 1;

function transitionOldSave(savedGame: SavedGame): void {
  const from = savedGame.version;
  if (typeof from !== "number" || !Number.isInteger(from) || from < 1 || from >= CURRENT_VERSION) {
    throw new Error("Unknown save version!");
  }

  UPGRADES.slice(from - 1).forEach((upgrade) => upgrade(savedGame));
}

export const SaveFormat = {
  CURRENT_VERSION,
  parse,
  serialise,
  transitionOldSave,
} as const;
