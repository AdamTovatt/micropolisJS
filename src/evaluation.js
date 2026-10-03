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

import { EventEmitter } from './eventEmitter.js';
import { CLASSIFICATION_UPDATED, POPULATION_UPDATED, SCORE_UPDATED } from './messages.ts';
import { MiscUtils } from './miscUtils.js';

var PROBLEMS = ['CVP_CRIME', 'CVP_POLLUTION', 'CVP_HOUSING', 'CVP_TAXES',
                'CVP_TRAFFIC', 'CVP_UNEMPLOYMENT', 'CVP_FIRE'];
var NUMPROBLEMS = PROBLEMS.length;
var NUM_COMPLAINTS = 4;
var problemData = [];


var Evaluation = EventEmitter(function(random) {
  this._random = random;
  this.problemVotes = [];
  this.problemOrder = [];
  this.evalInit();
});


Evaluation.prototype.cityEvaluation = function(simData) {
  var census = simData.census;

  if (census.totalPop > 0) {
    for (var i = 0; i < NUMPROBLEMS; i++)
      problemData.push(0);

    this.getAssessedValue(census);
    this.getPopulation(census);
    this.doProblems(simData.census, simData.budget, simData.blockMaps);
    this.getScore(simData);
    this.doVotes();
  } else {
    this.evalInit();
    this.cityYes = 50;
  }
};


Evaluation.prototype.evalInit = function() {
  this.cityYes = 0;
  this.cityPop = 0;
  this.cityPopDelta = 0;
  this.cityAssessedValue = 0;
  this.cityClass = Evaluation.CC_VILLAGE;
  this.cityClassLast = Evaluation.CC_VILLAGE;
  this.cityScore = 500;
  this.cityScoreDelta = 0;
  this.cityScoreBreakdown = [];
  for (var i = 0; i < NUMPROBLEMS; i++)
    this.problemVotes[i] = {index: i, voteCount: 0};

  for (i = 0; i < NUM_COMPLAINTS; i++)
    this.problemOrder[i] = NUMPROBLEMS;
};


var saveProps = ['cityClass', 'cityScore', 'cityYes', 'cityPop', 'cityPopDelta', 'cityAssessedValue', 'cityClassLast',
                 'cityScoreDelta'];

var copyVotes = function(votes) {
  return votes.map(function(vote) {
    return {index: vote.index, voteCount: vote.voteCount};
  });
};

var copyBreakdown = function(breakdown) {
  return breakdown.map(function(entry) {
    return {reason: entry.reason, points: entry.points, score: entry.score};
  });
};


Evaluation.prototype.save = function(saveData) {
  var evaluation = {problemVotes: copyVotes(this.problemVotes), problemOrder: this.problemOrder.slice(),
                    cityScoreBreakdown: copyBreakdown(this.cityScoreBreakdown)};
  for (var i = 0, l = saveProps.length; i < l; i++)
    evaluation[saveProps[i]] = this[saveProps[i]];

  saveData.evaluation = evaluation;
};


Evaluation.prototype.load = function(saveData) {
  var evaluation = saveData.evaluation;
  for (var i = 0, l = saveProps.length; i < l; i++)
    this[saveProps[i]] = evaluation[saveProps[i]];

  this.problemVotes = copyVotes(evaluation.problemVotes);
  this.problemOrder = evaluation.problemOrder.slice();
  this.cityScoreBreakdown = copyBreakdown(evaluation.cityScoreBreakdown);
};


Evaluation.prototype.getAssessedValue = function(census) {
  var value;

  value = census.roadTotal * 5;
  value += census.railTotal * 10;
  value += census.policeStationPop * 1000;
  value += census.fireStationPop * 1000;
  value += census.hospitalPop * 400;
  value += census.stadiumPop * 3000;
  value += census.seaportPop * 5000;
  value += census.airportPop * 10000;
  value += census.coalPowerPop * 3000;
  value += census.nuclearPowerPop * 6000;

  this.cityAssessedValue = value * 1000;
};


Evaluation.prototype.getPopulation = function(census) {
  var oldPopulation = this.cityPop;
  this.cityPop = (census.resPop + (census.comPop + census.indPop) * 8) * 20;
  this.cityPopDelta = this.cityPop - oldPopulation;

  if (this.cityPopDelta !== 0)
    this._emitEvent(POPULATION_UPDATED, this.cityPop);

  return this.cityPop;
};


Evaluation.prototype.getCityClass = function(cityPopulation) {
  this.cityClass = Evaluation.CC_VILLAGE;

  if (cityPopulation > 2000)
      this.cityClass = Evaluation.CC_TOWN;

  if (cityPopulation > 10000)
      this.cityClass = Evaluation.CC_CITY;

  if (cityPopulation > 50000)
      this.cityClass = Evaluation.CC_CAPITAL;

  if (cityPopulation > 100000)
      this.cityClass = Evaluation.CC_METROPOLIS;

  if (cityPopulation > 500000)
      this.cityClass = Evaluation.CC_MEGALOPOLIS;

  if (this.cityClass !== this.cityClassLast) {
    this.cityClassLast = this.cityClass;
    this._emitEvent(CLASSIFICATION_UPDATED, this.cityClass);
  }

  return this.cityClass;
};


Evaluation.prototype.voteProblems = function() {
  for (var i = 0; i < NUMPROBLEMS; i++) {
    this.problemVotes[i].index = i;
    this.problemVotes[i].voteCount = 0;
  }

  var problem = 0;
  var voteCount = 0;
  var loopCount = 0;

  // Try to acquire up to 100 votes on problems, but bail if it takes too long
  while (voteCount < 100 && loopCount < 600) {
    var voterProblemTolerance = this._random.getRandom(300);
    if (problemData[problem] > voterProblemTolerance) {
      // The voter is upset about this problem
      this.problemVotes[problem].voteCount += 1;
      voteCount++;
    }

    problem = (problem + 1) % NUMPROBLEMS;
    loopCount++;
  }
};


var getTrafficAverage = function(blockMaps, census) {
  var trafficDensityMap = blockMaps.trafficDensityMap;
  var landValueMap = blockMaps.landValueMap;

  var trafficTotal = 0;
  var count = 1;

  for (var x = 0; x < landValueMap.gameMapWidth; x += landValueMap.blockSize) {
    for (var y = 0; y < landValueMap.gameMapHeight; y += landValueMap.blockSize) {
      if (landValueMap.worldGet(x, y) > 0) {
        trafficTotal += trafficDensityMap.worldGet(x, y);
        count++;
      }
    }
  }

  var trafficAverage = census.trafficAverage = Math.floor(trafficTotal / count) * 2.4;

  return trafficAverage;
};


var getUnemployment = function(census) {
  var b = (census.comPop + census.indPop) * 8;

  if (b === 0)
      return 0;

  // Ratio total people / working. At least 1.
  var r = census.resPop / b;

  b = Math.round((r - 1) * 255);
  return Math.min(b, 255);
};


var getFireSeverity = function(census) {
  return Math.min(census.firePop * 5, 255);
};


Evaluation.prototype.doProblems = function(census, budget, blockMaps) {
  problemData[Evaluation.CRIME]        = census.crimeAverage;
  problemData[Evaluation.POLLUTION]    = census.pollutionAverage;
  problemData[Evaluation.HOUSING]      = census.landValueAverage * 7 / 10;
  problemData[Evaluation.TAXES]        = budget.cityTax * 10;
  problemData[Evaluation.TRAFFIC]      = getTrafficAverage(blockMaps, census);
  problemData[Evaluation.UNEMPLOYMENT] = getUnemployment(census);
  problemData[Evaluation.FIRE]         = getFireSeverity(census);

  this.voteProblems();

  // Rank the problems
  this.problemVotes.sort(function(a, b) {
    return b.voteCount - a.voteCount;
  });

  this.problemOrder = this.problemVotes.map(function(pv, i) {
    if (i >= NUM_COMPLAINTS || pv.voteCount === 0)
      return null;

    return pv.index;
  });
};


Evaluation.prototype.getScore = function(simData) {
  var census = simData.census;
  var budget = simData.budget;
  var valves = simData.valves;

  var cityScoreLast = this.cityScore;
  var score = 0;

  // Records why the score moved. Each entry holds the points one step moved the score and the
  // score it left. The problems entry is measured from last year's score, and the problems and
  // averaging entries are always listed; an adjustment is listed only when it moved the score.
  // So the entries sum to cityScoreDelta.
  var breakdown = [];
  var scoreBefore = cityScoreLast;
  var addEntry = function(reason) {
    breakdown.push({reason: reason, points: score - scoreBefore, score: score});
    scoreBefore = score;
  };
  var recordAdjustment = function(reason) {
    if (score !== scoreBefore)
      addEntry(reason);
  };

  for (var i = 0; i < NUMPROBLEMS; i++)
    score += problemData[i];

  score = Math.floor(score / 3);
  score = (250 - Math.min(score, 250)) * 4;
  addEntry(Evaluation.SCORE_PROBLEMS);

  // The adjustments below mirror evaluate.cpp step by step, so the repeated blocks are kept
  // rather than extracted into a loop.

  // Penalise the player by 15% if demand for any type of zone is capped due
  // to lack of suitable buildings
  var demandPenalty = 0.85;

  if (valves.resCap) {
    score = Math.round(score * demandPenalty);
    recordAdjustment(Evaluation.SCORE_RES_CAP);
  }

  if (valves.comCap) {
    score = Math.round(score * demandPenalty);
    recordAdjustment(Evaluation.SCORE_COM_CAP);
  }

  if (valves.indCap) {
    score = Math.round(score * demandPenalty);
    recordAdjustment(Evaluation.SCORE_IND_CAP);
  }

  // Penalize if roads/rail underfunded
  if (budget.roadEffect < budget.MAX_ROAD_EFFECT) {
    score -= budget.MAX_ROAD_EFFECT - budget.roadEffect;
    recordAdjustment(Evaluation.SCORE_ROAD_FUNDING);
  }

  // Penalize player by up to 10% for underfunded police and fire services.
  // Known port defect, left for a separate rule change: Budget names these constants
  // MAX_POLICESTATION_EFFECT and MAX_FIRESTATION_EFFECT, so both comparisons are against
  // undefined and these cuts never apply.
  if (budget.policeEffect < budget.MAX_POLICE_STATION_EFFECT) {
    score = Math.round(score * (0.9 + (budget.policeEffect / (10 * budget.MAX_POLICE_STATION_EFFECT))));
    recordAdjustment(Evaluation.SCORE_POLICE_FUNDING);
  }

  if (budget.fireEffect < budget.MAX_FIRE_STATION_EFFECT) {
    score = Math.round(score * (0.9 + (budget.fireEffect / (10 * budget.MAX_FIRE_STATION_EFFECT))));
    recordAdjustment(Evaluation.SCORE_FIRE_FUNDING);
  }

  // Penalise the player by 15% if demand for any type of zone has collapsed due
  // to overprovision
  if (valves.resValve < -1000) {
    score = Math.round(score * 0.85);
    recordAdjustment(Evaluation.SCORE_RES_OVERSUPPLY);
  }

  if (valves.comValve < -1000) {
    score = Math.round(score * 0.85);
    recordAdjustment(Evaluation.SCORE_COM_OVERSUPPLY);
  }

  if (valves.indValve < -1000) {
    score = Math.round(score * 0.85);
    recordAdjustment(Evaluation.SCORE_IND_OVERSUPPLY);
  }

  var scale = 1.0;
  if (this.cityPop === 0 || this.cityPopDelta === 0 || this.cityPopDelta === this.cityPop) {
    // Leave score unchanged if city is empty, if there hasn't been any migration, if the
    // initial settlers have just arrived, or if the city has doubled in size
    scale = 1.0;
  } else if (this.cityPopDelta > 0) {
    // If the city is growing, scale score by percentage growth in population
    scale = (this.cityPopDelta / this.cityPop) + 1.0;
  } else if (this.cityPopDelta < 0) {
    // If the city is shrinking, scale down by up to 5% based on level of outward migration.
    // Known port defect, left for a separate rule change: evaluate.cpp has no Math.floor here.
    // The floor turns any decline into -1, so the scale becomes -0.05.
    scale = 0.95 + Math.floor(this.cityPopDelta / (this.cityPop - this.cityPopDelta));
  }

  score = Math.round(score * scale);
  recordAdjustment(Evaluation.SCORE_MIGRATION);

  // Penalize player for having fires and a burdensome tax rate. The two subtractions are
  // recorded separately; on integers they are the same arithmetic as one expression.
  score = score - getFireSeverity(census);
  recordAdjustment(Evaluation.SCORE_FIRES);

  score = score - budget.cityTax;
  recordAdjustment(Evaluation.SCORE_TAXES);

  // Penalize player based on ratio of unpowered zones to total zones
  scale = census.unpoweredZoneCount + census.poweredZoneCount;
  if (scale > 0)
    score = Math.round(score * (census.poweredZoneCount / scale));
  recordAdjustment(Evaluation.SCORE_UNPOWERED_ZONES);

  // Force in to range 0-1000. New score is average of last score and new computed value
  score = MiscUtils.clamp(score, 0, 1000);
  recordAdjustment(Evaluation.SCORE_RANGE);

  this.cityScore = Math.round((this.cityScore + score) / 2);
  score = this.cityScore;
  addEntry(Evaluation.SCORE_AVERAGING);
  this.cityScoreBreakdown = breakdown;

  this.cityScoreDelta = this.cityScore - cityScoreLast;

  if (this.cityScoreDelta !== 0)
    this._emitEvent(SCORE_UPDATED, this.cityScore);
};


Evaluation.prototype.doVotes = function() {
  // Survey 100 voters on the mayor's performance
  this.cityYes = 0;

  for (var i = 0; i < 100; i++) {
    var voterExpectation = this._random.getRandom(1000);
    if (this.cityScore > voterExpectation)
      this.cityYes++;
  }
};


Evaluation.prototype.getProblemNumber = function(i) {
  if (i < 0 || i >= NUM_COMPLAINTS)
    return null;

  return this.problemOrder[i];
};


Object.defineProperties(Evaluation,
  {CC_VILLAGE: MiscUtils.makeConstantDescriptor('VILLAGE'),
  CC_TOWN: MiscUtils.makeConstantDescriptor('TOWN'),
  CC_CITY: MiscUtils.makeConstantDescriptor('CITY'),
  CC_CAPITAL: MiscUtils.makeConstantDescriptor('CAPITAL'),
  CC_METROPOLIS: MiscUtils.makeConstantDescriptor('METROPOLIS'),
  CC_MEGALOPOLIS: MiscUtils.makeConstantDescriptor('MEGALOPOLIS'),
  CRIME: MiscUtils.makeConstantDescriptor(0),
  POLLUTION: MiscUtils.makeConstantDescriptor(1),
  HOUSING: MiscUtils.makeConstantDescriptor(2),
  TAXES: MiscUtils.makeConstantDescriptor(3),
  TRAFFIC: MiscUtils.makeConstantDescriptor(4),
  UNEMPLOYMENT: MiscUtils.makeConstantDescriptor(5),
  FIRE: MiscUtils.makeConstantDescriptor(6),
  // Reasons in the score breakdown. The SCORE_ prefix keeps them apart from the problem indices.
  SCORE_PROBLEMS: MiscUtils.makeConstantDescriptor('PROBLEMS'),
  SCORE_RES_CAP: MiscUtils.makeConstantDescriptor('RES_CAP'),
  SCORE_COM_CAP: MiscUtils.makeConstantDescriptor('COM_CAP'),
  SCORE_IND_CAP: MiscUtils.makeConstantDescriptor('IND_CAP'),
  SCORE_ROAD_FUNDING: MiscUtils.makeConstantDescriptor('ROAD_FUNDING'),
  SCORE_POLICE_FUNDING: MiscUtils.makeConstantDescriptor('POLICE_FUNDING'),
  SCORE_FIRE_FUNDING: MiscUtils.makeConstantDescriptor('FIRE_FUNDING'),
  SCORE_RES_OVERSUPPLY: MiscUtils.makeConstantDescriptor('RES_OVERSUPPLY'),
  SCORE_COM_OVERSUPPLY: MiscUtils.makeConstantDescriptor('COM_OVERSUPPLY'),
  SCORE_IND_OVERSUPPLY: MiscUtils.makeConstantDescriptor('IND_OVERSUPPLY'),
  SCORE_MIGRATION: MiscUtils.makeConstantDescriptor('MIGRATION'),
  SCORE_FIRES: MiscUtils.makeConstantDescriptor('FIRES'),
  SCORE_TAXES: MiscUtils.makeConstantDescriptor('TAXES'),
  SCORE_UNPOWERED_ZONES: MiscUtils.makeConstantDescriptor('UNPOWERED_ZONES'),
  SCORE_RANGE: MiscUtils.makeConstantDescriptor('RANGE'),
  SCORE_AVERAGING: MiscUtils.makeConstantDescriptor('AVERAGING')});
export { Evaluation };
