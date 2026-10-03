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
import { BlockMapUtils } from './blockMapUtils.js';
import { Budget } from './budget.js';
import { Census } from './census.js';
import { buildCityStatus, conditionHolds } from './cityStatus.ts';
import { Commercial } from './commercial.js';
import { DisasterManager } from './disasterManager.js';
import { EventEmitter } from './eventEmitter.js';
import { EmergencyServices } from './emergencyServices.js';
import { Evaluation } from './evaluation.js';
import { GameMap } from './gameMap.js';
import { Industrial } from './industrial.js';
import { MapScanner } from './mapScanner.js';
import * as Messages from './messages.ts';
import { MiscTiles } from './miscTiles.js';
import { MiscUtils } from './miscUtils.js';
import { PowerManager } from './powerManager.js';
import { Random } from './random.ts';
import { RepairManager } from './repairManager.js';
import { Residential } from './residential.js';
import { Road } from './road.js';
import { SpriteManager } from './spriteManager.js';
import { Stadia } from './stadia.js';
import { Traffic } from './traffic.js';
import { Transport } from './transport.js';
import { Valves } from './valves.js';

// A new city on gameMap, simulated from the stream of seed, the game seed its map was generated from. A saved game is
// restored over a new city by load.
var Simulation = EventEmitter(function (gameMap, gameLevel, speed, seed) {
  this._map = gameMap;
  this.setLevel(gameLevel);
  this.setSpeed(speed);

  // Every random draw that changes the city comes from this stream
  this.seed = seed;
  this.random = Random.simulationStream(seed);

  this._speedCycle = 0;
  this._phaseCycle = 0;
  this._simCycle = 0;
  this._cityTime = 0;
  this._cityPopLast = 0;
  this._messageLast = null;
  this._initialEvaluationPending = true;
  this._startingYear = 1900;

  // Last date sent to front end
  this._cityYearLast = -1;
  this._cityMonthLast = -1;

  // The city time we last sent a power message to the front end
  this._lastPowerMessage = null;

  // And now, the main cast of characters
  this.evaluation = new Evaluation(this.random);
  this._valves = new Valves();
  this.budget = new Budget();
  this._census = new Census();
  this._powerManager = new PowerManager(this._map);
  this.spriteManager = new SpriteManager(this._map, this.random);
  this._mapScanner = new MapScanner(this._map);
  this._repairManager = new RepairManager(this._map);
  this._traffic = new Traffic(this._map, this.spriteManager, this.random);
  this.disasterManager = new DisasterManager(this._map, this.spriteManager, this.random);

  this.blockMaps = {
    // Holds a "distance score" for the block from the city centre, range  -64 to 64
    cityCentreDistScoreMap: new BlockMap(this._map.width, this._map.height, 8),

    // Holds a score representing how dangerous an area is, in range 0-250 (larger is worse)
    crimeRateMap: new BlockMap(this._map.width, this._map.height, 2),

    // A map used to note positions of fire stations during the map scan, range 0-1000
    fireStationMap: new BlockMap(this._map.width, this._map.height, 8),

    // Holds a value containing a score representing the effect of fire cover in this neighborhood, range 0-1000
    fireStationEffectMap: new BlockMap(this._map.width, this._map.height, 8),

    // Holds scores representing the land value in the range 0-250
    landValueMap: new BlockMap(this._map.width, this._map.height, 2),

    // A map used to note positions of police stations during the map scan, range 0-1000
    policeStationMap: new BlockMap(this._map.width, this._map.height, 8),

    // Holds a value containing a score representing how much crime is dampened in this block, range 0-1000
    policeStationEffectMap: new BlockMap(this._map.width, this._map.height, 8),

    // Holds a value representing the amount of pollution in a neighbourhood, in the range 0-255
    pollutionDensityMap: new BlockMap(this._map.width, this._map.height, 2),

    // Holds a value representing population density of a block, in the range 0-510
    populationDensityMap: new BlockMap(this._map.width, this._map.height, 2),

    // Holds a value representing the rate of growth of a neighbourhood in the range -200 to +200
    rateOfGrowthMap: new BlockMap(this._map.width, this._map.height, 8),

    // Scores a block on how undeveloped/unspoilt it is, range 0-240
    terrainDensityMap: new BlockMap(this._map.width, this._map.height, 4),

    // Scores the volume of traffic in this cluster, range 0-240
    trafficDensityMap: new BlockMap(this._map.width, this._map.height, 2),

    // Temporary maps
    tempMap1: new BlockMap(this._map.width, this._map.height, 2),
    tempMap2: new BlockMap(this._map.width, this._map.height, 2),
    tempMap3: new BlockMap(this._map.width, this._map.height, 4)
  };

  this._clearCensus();
  this.init();

  this.budget.setFunds(20000);
  this._census.totalPop = 1;
  this._scan();
});


Simulation.prototype.setLevel = function(l) {
  if (l !== Simulation.LEVEL_EASY &&
      l !== Simulation.LEVEL_MED &&
      l !== Simulation.LEVEL_HARD)
    throw new Error('Invalid level!');

  this._gameLevel = l;
};


Simulation.prototype.getMap = function() {
  return this._map;
};


Simulation.prototype.getLevel = function() {
  return this._gameLevel;
};


Simulation.prototype.setSpeed = function(s) {
  if (s !== Simulation.SPEED_PAUSED &&
      s !== Simulation.SPEED_SLOW &&
      s !== Simulation.SPEED_MED &&
      s !== Simulation.SPEED_FAST)
    throw new Error('Invalid speed!');

  this._speed = s;
};


Simulation.prototype.getSpeed = function() {
  return this._speed;
};


Simulation.prototype.isPaused = function() {
  return this._speed === Simulation.SPEED_PAUSED;
};


// A save holds the complete state, so a loaded city continues exactly as it would have without the save. The format
// is specified in docs/state-hash.md, which the state hash is computed over.
// The simulation's counters, each saved under its field's name without the underscore. The level and speed are saved
// beside them, and restored through their setters.
var saveProps = ['cityTime', 'speedCycle', 'phaseCycle', 'simCycle', 'cityPopLast', 'messageLast', 'lastPowerMessage',
                 'initialEvaluationPending'];

// The temporary block maps are left out: each scan writes them in full before reading them
var scannedBlockMaps = ['cityCentreDistScoreMap', 'crimeRateMap', 'fireStationMap', 'fireStationEffectMap',
                        'landValueMap', 'policeStationMap', 'policeStationEffectMap', 'pollutionDensityMap',
                        'populationDensityMap', 'rateOfGrowthMap', 'terrainDensityMap', 'trafficDensityMap'];

Simulation.prototype.save = function(saveData) {
  var simulation = {gameLevel: this._gameLevel, speed: this._speed, seed: this.seed,
                    randomState: this.random.getState()};
  for (var i = 0, l = saveProps.length; i < l; i++)
    simulation[saveProps[i]] = this['_' + saveProps[i]];

  saveData.simulation = simulation;

  this._map.save(saveData);
  this.evaluation.save(saveData);
  this._valves.save(saveData);
  this.budget.save(saveData);
  this._census.save(saveData);
  this.spriteManager.save(saveData);
  this.disasterManager.save(saveData);

  var scannedState = {blockMaps: {}, census: {}, power: {}};
  for (i = 0, l = scannedBlockMaps.length; i < l; i++)
    scannedState.blockMaps[scannedBlockMaps[i]] = this.blockMaps[scannedBlockMaps[i]].save();

  this._census.saveScan(scannedState.census);
  this._powerManager.saveScan(scannedState.power);
  saveData.scannedState = scannedState;
};


// A new city restored from a save, on a blank map of the save's size
Simulation.fromSave = function(saveData) {
  var saved = saveData.simulation;
  var simulation = new Simulation(new GameMap(saveData.map.width, saveData.map.height), saved.gameLevel, saved.speed,
                                  saved.seed);
  simulation.load(saveData);
  return simulation;
};


// Restores a saved game over this city of the same map size. The save holds the complete state, the level, speed,
// seed and stream's included, so nothing of the city it replaces survives, down to the date last sent to the UI.
Simulation.prototype.load = function(saveData) {
  if (saveData.scannedState === undefined)
    throw new Error('A save from before version 5 must be migrated before it is loaded');

  var map = saveData.map;
  if (map.width !== this._map.width || map.height !== this._map.height)
    throw new Error('A ' + map.width + 'x' + map.height + ' save cannot be loaded over a ' +
                    this._map.width + 'x' + this._map.height + ' city');

  this._loadSaved(saveData);
  this._cityYearLast = -1;
  this._cityMonthLast = -1;

  if (saveData.scannedState !== null) {
    this._loadScanned(saveData.scannedState);
  } else {
    // A browser save migrated from an older version holds no scanned state (see storage.js), so derive it by
    // scanning, as the original does on every load. The scan's handlers change the map and draw from the stream:
    // the rest of the saved state is then restored over them. The scan adds to what it finds, such as the census
    // counts and the rate of growth, so it starts from a new city's scanned state.
    this._clearScanned();
    this._scan();
    this._loadSaved(saveData);
  }
};


// Everything a save holds but its scanned state
Simulation.prototype._loadSaved = function(saveData) {
  var simulation = saveData.simulation;
  this.setLevel(simulation.gameLevel);
  this.setSpeed(simulation.speed);
  for (var i = 0, l = saveProps.length; i < l; i++)
    this['_' + saveProps[i]] = simulation[saveProps[i]];

  this.seed = simulation.seed;
  this.random.setState(simulation.randomState);

  this._map.load(saveData);
  this.evaluation.load(saveData);
  this._valves.load(saveData);
  this.budget.load(saveData);
  this._census.load(saveData);
  this.spriteManager.load(saveData);
  this.disasterManager.load(saveData);
};


// Everything a save's scanned state holds, as a new city has it
Simulation.prototype._clearScanned = function() {
  for (var i = 0, l = scannedBlockMaps.length; i < l; i++)
    this.blockMaps[scannedBlockMaps[i]].clear();

  this._census.clearScan();
  this._powerManager.clearPowerStack();
};


Simulation.prototype._loadScanned = function(scannedState) {
  for (var i = 0, l = scannedBlockMaps.length; i < l; i++)
    this.blockMaps[scannedBlockMaps[i]].load(scannedState.blockMaps[scannedBlockMaps[i]]);

  this._census.loadScan(scannedState.census);
  this._powerManager.loadScan(scannedState.power);
};


// One loop of the simulation, as simLoop in the original: a phase of the city cycle when the game speed lets one
// through, then one move of every sprite, so sprites move at the same rate whatever the speed. The number of steps,
// never wall time, is what advances the city: the same seed and the same steps give the same city. A paused
// simulation's step does nothing, as the original's simFrame and moveObjects do nothing at speed 0.
Simulation.prototype.step = function() {
  if (this.isPaused())
    return;

  this._simFrame();
  this.spriteManager.moveObjects(this._constructSimData());
  this._updateTime();
  // TODO Graphs
};


// As simFrame in the original: speedCycle lets a phase through on every 5th step at slow speed, every 3rd at medium,
// and every step at fast
Simulation.prototype._simFrame = function() {
  if (this.budget.awaitingValues)
    return;

  if (++this._speedCycle > 1023)
    this._speedCycle = 0;

  if (this._speed === Simulation.SPEED_SLOW && (this._speedCycle % 5) !== 0)
    return;

  if (this._speed === Simulation.SPEED_MED && (this._speedCycle % 3) !== 0)
    return;

  this._simulate(this._constructSimData());
};


Simulation.prototype._clearCensus = function() {
  this._census.clearCensus();
  this._powerManager.clearPowerStack();
  this.blockMaps.fireStationMap.clear();
  this.blockMaps.policeStationMap.clear();
};


Simulation.prototype._constructSimData = function() {
  return {
    blockMaps: this.blockMaps,
    budget: this.budget,
    census: this._census,
    cityTime: this._cityTime,
    disasterManager: this.disasterManager,
    gameLevel: this._gameLevel,
    repairManager: this._repairManager,
    powerManager: this._powerManager,
    random: this.random,
    simulator: this,
    spriteManager: this.spriteManager,
    trafficManager: this._traffic,
    valves: this._valves
  };
};


Simulation.prototype.init = function() {
  // Add various listeners that we will in turn transmit upwards
  var evaluationEvents = ['CLASSIFICATION_UPDATED', 'POPULATION_UPDATED', 'SCORE_UPDATED'].map(function(m) {
    return Messages[m];
  });
  for (var i = 0, l = evaluationEvents.length; i < l; i++)
    this.evaluation.addEventListener(evaluationEvents[i], MiscUtils.reflectEvent.bind(this, evaluationEvents[i]));

  this._powerManager.addEventListener(Messages.NOT_ENOUGH_POWER,
                                      this._sendPowerMessage.bind(this, Messages.NOT_ENOUGH_POWER));

  this.budget.addEventListener(Messages.FUNDS_CHANGED, MiscUtils.reflectEvent.bind(this, Messages.FUNDS_CHANGED));
  this.budget.addEventListener(Messages.BUDGET_NEEDED, MiscUtils.reflectEvent.bind(this, Messages.BUDGET_NEEDED));
  this.budget.addEventListener(Messages.NO_MONEY, this._wrapMessage.bind(this, Messages.NO_MONEY));

  this._valves.addEventListener(Messages.VALVES_UPDATED, this._onValveChange.bind(this));

  for (i = 0, l = Messages.DISASTER_MESSAGES.length; i < l; i++) {
    this.spriteManager.addEventListener(Messages.DISASTER_MESSAGES[i], this._wrapMessage.bind(this, Messages.DISASTER_MESSAGES[i]));
    this.disasterManager.addEventListener(Messages.DISASTER_MESSAGES[i], this._wrapMessage.bind(this, Messages.DISASTER_MESSAGES[i]));
  }
  for (i = 0, l = Messages.CRASHES.length; i < l; i++)
    this.spriteManager.addEventListener(Messages.CRASHES[i], this._wrapMessage.bind(this, Messages.CRASHES[i]));

  this.spriteManager.addEventListener(Messages.HEAVY_TRAFFIC, this._wrapMessage.bind(this, Messages.HEAVY_TRAFFIC));

  // Register actions
  Commercial.registerHandlers(this._mapScanner, this._repairManager);
  EmergencyServices.registerHandlers(this._mapScanner, this._repairManager);
  Industrial.registerHandlers(this._mapScanner, this._repairManager);
  MiscTiles.registerHandlers(this._mapScanner, this._repairManager);
  this._powerManager.registerHandlers(this._mapScanner, this._repairManager);
  Road.registerHandlers(this._mapScanner, this._repairManager);
  Residential.registerHandlers(this._mapScanner, this._repairManager);
  Stadia.registerHandlers(this._mapScanner, this._repairManager);
  Transport.registerHandlers(this._mapScanner, this._repairManager);
};


// A new city's first scans, which a saved game holds the results of
Simulation.prototype._scan = function() {
  var simData = this._constructSimData();
  this._mapScanner.mapScan(0, this._map.width, simData);
  this._powerManager.doPowerScan(this._census);
  BlockMapUtils.pollutionTerrainLandValueScan(this._map, this._census, this.blockMaps, this.random);
  BlockMapUtils.crimeScan(this._census, this.blockMaps);
  BlockMapUtils.populationDensityScan(this._map, this.blockMaps);
  BlockMapUtils.fireAnalysis(this.blockMaps);
};


var speedPowerScan = [2, 4, 5];
var speedPollutionTerrainLandValueScan = [2, 7, 17];
var speedCrimeScan = [1, 8, 18];
var speedPopulationDensityScan = [1, 9,19];
var speedFireAnalysis = [1, 10, 20];
var CENSUS_FREQUENCY_10 = 4;
var CENSUS_FREQUENCY_120 = CENSUS_FREQUENCY_10 * 10;
var TAX_FREQUENCY = 48;


var simulate = function(simData) {
  this._phaseCycle &= 15;
  var speedIndex = this._speed - 1;

  switch (this._phaseCycle)  {
    case 0:
      if (++this._simCycle > 1023)
          this._simCycle = 0;

      this._cityTime++;

      if ((this._simCycle & 1) === 0)
        this._valves.setValves(this._gameLevel, this._census, this.budget);

      this._clearCensus();
      break;

    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
    case 6:
    case 7:
    case 8:
      this._mapScanner.mapScan((this._phaseCycle - 1) * this._map.width / 8,
                                this._phaseCycle * this._map.width / 8, simData);
      break;

    case 9:
      if (this._cityTime % CENSUS_FREQUENCY_10 === 0)
        this._census.take10Census(this.budget);

      if (this._cityTime % CENSUS_FREQUENCY_120 === 0)
        this._census.take120Census();

      if (this._cityTime % TAX_FREQUENCY === 0)  {
        this.budget.collectTax(this._gameLevel, this._census);
        this.evaluation.cityEvaluation(simData);
      }

      break;

    case 10:
      if ((this._simCycle % 5) === 0)
        BlockMapUtils.neutraliseRateOfGrowthMap(simData.blockMaps);

      BlockMapUtils.neutraliseTrafficMap(this.blockMaps);
      this._sendMessages();
      break;

    case 11:
      if ((this._simCycle % speedPowerScan[speedIndex]) === 0)
        this._powerManager.doPowerScan(this._census);
      break;

    case 12:
      if ((this._simCycle % speedPollutionTerrainLandValueScan[speedIndex]) === 0)
        BlockMapUtils.pollutionTerrainLandValueScan(this._map, this._census, this.blockMaps, this.random);
      break;

    case 13:
      if ((this._simCycle % speedCrimeScan[speedIndex]) === 0)
        BlockMapUtils.crimeScan(this._census, this.blockMaps);
      break;

    case 14:
      if ((this._simCycle % speedPopulationDensityScan[speedIndex]) === 0)
        BlockMapUtils.populationDensityScan(this._map, this.blockMaps);
      break;

    case 15:
      if ((this._simCycle % speedFireAnalysis[speedIndex]) === 0)
        BlockMapUtils.fireAnalysis(this.blockMaps);

      this.disasterManager.doDisasters(this._gameLevel, this._census);
      this._publishCityStatus();
      break;
  }

  // Go on the the next phase.
  this._phaseCycle = (this._phaseCycle + 1) & 15;
};


Simulation.prototype._simulate = function(simData) {
  // A city is evaluated before the first phase it runs. A saved game records whether that has happened.
  if (this._initialEvaluationPending) {
    this.evaluation.cityEvaluation(simData);
    this._initialEvaluationPending = false;
  }

  simulate.call(this, simData);
};


// The power messages, NOT_ENOUGH_POWER and BLACKOUTS_REPORTED, share one throttle: after either is sent, neither is
// sent again until this much city time has passed, three city years
var POWER_MESSAGE_INTERVAL = 3 * 48;

Simulation.prototype._sendPowerMessage = function(subject) {
  if (this._lastPowerMessage !== null && this._cityTime - this._lastPowerMessage <= POWER_MESSAGE_INTERVAL)
    return;

  this._emitEvent(Messages.FRONT_END_MESSAGE, {subject: subject});
  this._lastPowerMessage = this._cityTime;
};


Simulation.prototype._wrapMessage = function(message, data) {
  this._emitEvent(Messages.FRONT_END_MESSAGE, {subject: message, data: data});
};


Simulation.prototype._sendMessages = function() {
  this._checkGrowth();

  var holds = function(condition) {
    return conditionHolds(condition, this._census, this.budget, this._powerManager);
  }.bind(this);

  var sendIfHolds = function(condition) {
    if (holds(condition))
      this._emitEvent(Messages.FRONT_END_MESSAGE, {subject: condition});
  }.bind(this);

  switch (this._cityTime & 63) {
    case 1:
      sendIfHolds(Messages.NEED_MORE_RESIDENTIAL);
      break;

    case 5:
      sendIfHolds(Messages.NEED_MORE_COMMERCIAL);
      break;

    case 10:
      sendIfHolds(Messages.NEED_MORE_INDUSTRIAL);
      break;

    case 14:
      sendIfHolds(Messages.NEED_MORE_ROADS);
      break;

    case 18:
      sendIfHolds(Messages.NEED_MORE_RAILS);
      break;

    case 22:
      sendIfHolds(Messages.NEED_ELECTRICITY);
      break;

    case 26:
      if (holds(Messages.NEED_STADIUM)) {
        this._emitEvent(Messages.FRONT_END_MESSAGE, {subject: Messages.NEED_STADIUM});
        this._valves.resCap = true;
      } else {
        this._valves.resCap = false;
      }
      break;

    case 28:
      if (holds(Messages.NEED_SEAPORT)) {
          this._emitEvent(Messages.FRONT_END_MESSAGE, {subject: Messages.NEED_SEAPORT});
        this._valves.indCap = true;
      } else {
        this._valves.indCap = false;
      }
      break;

    case 30:
      if (holds(Messages.NEED_AIRPORT)) {
          this._emitEvent(Messages.FRONT_END_MESSAGE, {subject: Messages.NEED_AIRPORT});
        this._valves.comCap = true;
      } else {
        this._valves.comCap = false;
      }
      break;

    case 32:
      if (holds(Messages.BLACKOUTS_REPORTED))
        this._sendPowerMessage(Messages.BLACKOUTS_REPORTED);
      break;

    case 35:
      if (holds(Messages.HIGH_POLLUTION))
        this._emitEvent(Messages.FRONT_END_MESSAGE,
                       {subject: Messages.HIGH_POLLUTION, data: {x: this._map.pollutionMaxX, y: this._map.pollutionMaxY}});
      break;

    case 42:
      sendIfHolds(Messages.HIGH_CRIME);
      break;

    case 45:
      sendIfHolds(Messages.NEED_FIRE_STATION);
      break;

    case 48:
      sendIfHolds(Messages.NEED_POLICE_STATION);
      break;

    case 51:
      sendIfHolds(Messages.TAX_TOO_HIGH);
      break;

    case 54:
      sendIfHolds(Messages.ROAD_NEEDS_FUNDING);
      break;

    case 57:
      sendIfHolds(Messages.FIRE_STATION_NEEDS_FUNDING);
      break;

    case 60:
      sendIfHolds(Messages.POLICE_NEEDS_FUNDING);
      break;

  case 63:
    sendIfHolds(Messages.TRAFFIC_JAMS);
    break;
  }
};


// The status record describes the city at the end of each cycle. It is derived, never saved.
Simulation.prototype._publishCityStatus = function() {
  this._emitEvent(Messages.CITY_STATUS_UPDATED,
                  buildCityStatus(this._census, this.budget, this._powerManager, this._valves));
};


Simulation.prototype._checkGrowth = function() {
  if ((this._cityTime & 3) !== 0)
    return;

  var message = '';
  var cityPop = this.evaluation.getPopulation(this._census);

  if (cityPop !== this._cityPopLast) {
    var lastClass = this.evaluation.getCityClass(this._cityPopLast);
    var newClass = this.evaluation.getCityClass(cityPop);

    if (lastClass !== newClass) {
      switch (newClass) {
        case Evaluation.CC_VILLAGE:
          // Don't mention it.
          break;

        case Evaluation.CC_TOWN:
          message = Messages.REACHED_TOWN;
          break;

        case Evaluation.CC_CITY:
          message = Messages.REACHED_CITY;
          break;

        case Evaluation.CC_CAPITAL:
          message = Messages.REACHED_CAPITAL;
            break;

        case Evaluation.CC_METROPOLIS:
          message = Messages.REACHED_METROPOLIS;
          break;

        case Evaluation.CC_MEGALOPOLIS:
          message = Messages.REACHED_MEGALOPOLIS;
          break;

        default:
          break;
      }
    }
  }

  if (message !== '' && message !== this._messageLast) {
    this._emitEvent(Messages.FRONT_END_MESSAGE, {subject: message});
    this._messageLast = message;
  }

  this._cityPopLast = cityPop;
};


Simulation.prototype._onValveChange  = function() {
  this._emitEvent(Messages.VALVES_UPDATED, {residential: this._valves.resValve,
                                            commercial: this._valves.comValve,
                                            industrial: this._valves.indValve});
};


Simulation.prototype.getDate = function() {
  var year = Math.floor(this._cityTime / 48) + this._startingYear;
  var month = Math.floor(this._cityTime % 48) >> 2;
  return {month: month, year: year};
};


Simulation.prototype._setYear = function(year) {
  if (year < this._startingYear)
    year = this._startingYear;

  year = (year - this._startingYear) - (this._cityTime / 48);
  this._cityTime += year * 48;
  this._updateTime();
};


Simulation.prototype._updateTime = function() {
  var megalinium = 1000000;
  var cityYear = Math.floor(this._cityTime / 48) + this._startingYear;
  var cityMonth = Math.floor(this._cityTime % 48) >> 2;

  if (cityYear >= megalinium) {
    this.setYear(this._startingYear);
    return;
  }

  if (this._cityYearLast !== cityYear || this._cityMonthLast !== cityMonth) {
    this._cityYearLast = cityYear;
    this._cityMonthLast = cityMonth;
    this._emitEvent(Messages.DATE_UPDATED, {month: cityMonth, year: cityYear});
  }
};


Object.defineProperties(Simulation,
  {LEVEL_EASY: MiscUtils.makeConstantDescriptor(0),
  LEVEL_MED:  MiscUtils.makeConstantDescriptor(1),
  LEVEL_HARD: MiscUtils.makeConstantDescriptor(2),
  SPEED_PAUSED: MiscUtils.makeConstantDescriptor(0),
  SPEED_SLOW:  MiscUtils.makeConstantDescriptor(1),
  SPEED_MED: MiscUtils.makeConstantDescriptor(2),
  SPEED_FAST: MiscUtils.makeConstantDescriptor(3),
});


export { Simulation };
