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

// The underfunded police and fire cuts divide the funding share by 10.0001 rather than 10, kept to
// match evaluate.cpp. A product that 10 would make whole comes out just below it, and truncating
// drops a point: half funding takes a score of 1000 to 949, not 950.
var SERVICE_CUT_DIVISOR = 10.0001;

// The 15% cut for each zone type whose demand is capped or has collapsed. evaluate.cpp writes .85
// at each of the six.
var DEMAND_CUT = 0.85;

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
    return {reason: entry.reason, points: entry.points};
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

    // A deliberate divergence: evaluate.cpp's loop cycles through PROBNUM + 1 slots, past the end
    // of its problem table, which is undefined behaviour no port can reproduce. This cycles through
    // the seven problems, so the votes draw from the stream differently from the original's.
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

  var trafficAverage = census.trafficAverage = Math.trunc(Math.trunc(trafficTotal / count) * 2.4);

  return trafficAverage;
};


var getUnemployment = function(census) {
  // evaluate.cpp keeps the jobs in a short, which wraps past 32767: more than 4095 commercial and
  // industrial people count as a negative number of jobs. A map that is almost all top-density
  // commercial holds about 6700.
  var b = (((census.comPop + census.indPop) * 8) << 16) >> 16;

  if (b === 0)
      return 0;

  // Ratio of residents to jobs, below 1 where jobs outnumber residents.
  //
  // evaluate.cpp works out this ratio, and the score's migration and power scales, in float.
  // Math.fround rounds to the nearest float, as a C# (float) cast does, so wrapping each float
  // operand and result in it reproduces that arithmetic exactly. Whole numbers are exact in
  // float, so they aren't wrapped.
  var r = Math.fround(Math.fround(census.resPop) / Math.fround(b));

  // A deliberate divergence: evaluate.cpp converts this float to a short, and past about 130
  // residents per job it is out of a short's range, where C leaves the conversion undefined. gcc
  // wraps it: 1040 residents for one commercial person's 8 jobs give 129 * 255 = 32895, which
  // wraps to -32641, a negative problem that lets a residential-only town score perfectly. The
  // port keeps the value and caps it at 255.
  b = Math.trunc(Math.fround(Math.fround(r - 1) * 255));
  return Math.min(b, 255);
};


var getFireSeverity = function(census) {
  return Math.min(census.firePop * 5, 255);
};


Evaluation.prototype.doProblems = function(census, budget, blockMaps) {
  problemData[Evaluation.CRIME]        = census.crimeAverage;
  problemData[Evaluation.POLLUTION]    = census.pollutionAverage;
  problemData[Evaluation.HOUSING]      = Math.trunc(census.landValueAverage * 7 / 10);
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

  // Records why the score moved. Each entry holds the points one step moved the score; each
  // helper is given the score after its step. The problems entry is measured from last year's
  // score, and the problems and averaging entries are always listed; an adjustment is listed
  // only when it moved the score. So the entries sum to cityScoreDelta.
  var breakdown = [];
  var scoreBefore = cityScoreLast;
  var addEntry = function(reason, scoreAfter) {
    breakdown.push({reason: reason, points: scoreAfter - scoreBefore});
    scoreBefore = scoreAfter;
  };
  var recordAdjustment = function(reason, scoreAfter) {
    if (scoreAfter !== scoreBefore)
      addEntry(reason, scoreAfter);
  };

  for (var i = 0; i < NUMPROBLEMS; i++)
    score += problemData[i];

  // The score is an int in evaluate.cpp, and Math.trunc does what each (int) cast and integer
  // division there does: drop the fraction, toward zero.

  // A third of the problems' sum, capped at 256, gives a base of up to 1024, clamped to 1000: so
  // problems summing to 20 or less leave it at 1000
  score = Math.trunc(score / 3);
  score = Math.min(score, 256);
  score = MiscUtils.clamp((256 - score) * 4, 0, 1000);
  addEntry(Evaluation.SCORE_PROBLEMS, score);

  // The adjustments below follow evaluate.cpp's in order, so the repeated blocks are kept rather
  // than extracted into a loop

  // Penalise the player by 15% if demand for any type of zone is capped due
  // to lack of suitable buildings
  if (valves.resCap) {
    score = Math.trunc(score * DEMAND_CUT);
    recordAdjustment(Evaluation.SCORE_RES_CAP, score);
  }

  if (valves.comCap) {
    score = Math.trunc(score * DEMAND_CUT);
    recordAdjustment(Evaluation.SCORE_COM_CAP, score);
  }

  if (valves.indCap) {
    score = Math.trunc(score * DEMAND_CUT);
    recordAdjustment(Evaluation.SCORE_IND_CAP, score);
  }

  // Penalize if roads/rail underfunded
  if (budget.roadEffect < budget.MAX_ROAD_EFFECT) {
    score -= budget.MAX_ROAD_EFFECT - budget.roadEffect;
    recordAdjustment(Evaluation.SCORE_ROAD_FUNDING, score);
  }

  // Penalize player by up to 10% for underfunded police and fire services
  if (budget.policeEffect < budget.MAX_POLICESTATION_EFFECT) {
    score = Math.trunc(score * (0.9 + (budget.policeEffect / (SERVICE_CUT_DIVISOR * budget.MAX_POLICESTATION_EFFECT))));
    recordAdjustment(Evaluation.SCORE_POLICE_FUNDING, score);
  }

  if (budget.fireEffect < budget.MAX_FIRESTATION_EFFECT) {
    score = Math.trunc(score * (0.9 + (budget.fireEffect / (SERVICE_CUT_DIVISOR * budget.MAX_FIRESTATION_EFFECT))));
    recordAdjustment(Evaluation.SCORE_FIRE_FUNDING, score);
  }

  // Penalise the player by 15% if demand for any type of zone has collapsed due
  // to overprovision
  if (valves.resValve < -1000) {
    score = Math.trunc(score * DEMAND_CUT);
    recordAdjustment(Evaluation.SCORE_RES_OVERSUPPLY, score);
  }

  if (valves.comValve < -1000) {
    score = Math.trunc(score * DEMAND_CUT);
    recordAdjustment(Evaluation.SCORE_COM_OVERSUPPLY, score);
  }

  if (valves.indValve < -1000) {
    score = Math.trunc(score * DEMAND_CUT);
    recordAdjustment(Evaluation.SCORE_IND_OVERSUPPLY, score);
  }

  // evaluate.cpp's SM, a float
  var migrationScale = 1.0;
  if (this.cityPop === 0 || this.cityPopDelta === 0 || this.cityPopDelta === this.cityPop) {
    // Leave score unchanged if city is empty, if there hasn't been any migration, if the
    // initial settlers have just arrived, or if the city has doubled in size
    migrationScale = 1.0;
  } else if (this.cityPopDelta > 0) {
    // If the city is growing, scale score by percentage growth in population
    migrationScale = Math.fround(Math.fround(Math.fround(this.cityPopDelta) / Math.fround(this.cityPop)) + 1.0);
  } else if (this.cityPopDelta < 0) {
    // If the city is shrinking, scale by 0.95 less the share of last year's population that left
    migrationScale = Math.fround(Math.fround(0.95) +
        Math.fround(Math.fround(this.cityPopDelta) / Math.fround(this.cityPop - this.cityPopDelta)));
  }

  score = Math.trunc(Math.fround(Math.fround(score) * migrationScale));
  recordAdjustment(Evaluation.SCORE_MIGRATION, score);

  // Penalize player for having fires and a burdensome tax rate. The two subtractions are
  // recorded separately; a - b - c is (a - b) - c, so this is the same arithmetic.
  score = score - getFireSeverity(census);
  recordAdjustment(Evaluation.SCORE_FIRES, score);

  score = score - budget.cityTax;
  recordAdjustment(Evaluation.SCORE_TAXES, score);

  // Scale by the share of zones that are powered, in float. evaluate.cpp's TM, the zone total, is
  // a float.
  var zoneTotal = Math.fround(census.unpoweredZoneCount + census.poweredZoneCount);
  if (zoneTotal > 0)
    score = Math.trunc(Math.fround(Math.fround(score) * Math.fround(Math.fround(census.poweredZoneCount) / zoneTotal)));
  recordAdjustment(Evaluation.SCORE_UNPOWERED_ZONES, score);

  // Force in to range 0-1000. New score is average of last score and new computed value
  score = MiscUtils.clamp(score, 0, 1000);
  recordAdjustment(Evaluation.SCORE_RANGE, score);

  this.cityScore = Math.trunc((this.cityScore + score) / 2);
  addEntry(Evaluation.SCORE_AVERAGING, this.cityScore);
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
