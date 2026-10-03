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
import { VALVES_UPDATED } from './messages.ts';
import { MiscUtils } from './miscUtils.js';

var Valves = EventEmitter(function () {
  this.resValve = 0;
  this.comValve = 0;
  this.indValve = 0;
  this.resCap = false;
  this.comCap = false;
  this.indCap = false;
});


var RES_VALVE_RANGE = 2000;
var COM_VALVE_RANGE = 1500;
var IND_VALVE_RANGE = 1500;


// setValves in the original's simulate.cpp keeps its parameters and every figure it works out in floats. Math.fround
// rounds to the nearest float, as a C# (float) cast does, so wrapping each float operand and result in it reproduces
// that arithmetic exactly. Whole numbers are exact in float, so they aren't wrapped.
var f = Math.fround;

var taxTable = [
  200, 150, 120, 100, 80, 50, 30, 0, -10, -40, -100,
  -150, -200, -250, -300, -350, -400, -450, -500, -550, -600];
var extMarketParamTable = [f(1.2), f(1.1), f(0.98)];

var saveProps = ['resValve', 'comValve', 'indValve', 'resCap', 'comCap', 'indCap'];

Valves.prototype.save = function(saveData) {
  var valves = {};
  for (var i = 0, l = saveProps.length; i < l; i++)
    valves[saveProps[i]] = this[saveProps[i]];

  saveData.valves = valves;
};


Valves.prototype.load = function(saveData) {
  for (var i = 0, l = saveProps.length; i < l; i++)
    this[saveProps[i]] = saveData.valves[saveProps[i]];

  this._emitEvent(VALVES_UPDATED);
};


Valves.prototype.setValves = function(gameLevel, census, budget) {
  var resPopDenom = 8;
  var birthRate = f(0.02);
  var labourBaseMax = f(1.3);
  var internalMarketDenom = f(3.7);
  var projectedIndPopMin = 5.0;
  var resRatioDefault = f(1.3);
  var resRatioMax = 2;
  var comRatioMax = 2;
  var indRatioMax = 2;
  var taxMax = 20;
  var taxTableScale = 600;
  var employment, labourBase;

  // Residential zones scale their population index when reporting it to the census. The original stores the total in a
  // short, and its (short) drops the fraction. Past a short's range C leaves that conversion undefined, and the port
  // keeps the whole value.
  var normalizedResPop = f(census.resPop / resPopDenom);
  census.totalPop = Math.trunc(f(f(normalizedResPop + census.comPop) + census.indPop));

  // A lack of developed commercial and industrial zones means there are no employment opportunities, which constrain
  // growth. (This might hurt initially if, for example, the player lays out an initial grid, as the residential zones
  // will likely develop first, so the residential valve will immediately crater).
  if (census.resPop > 0)
    employment = f((census.comHist10[1] + census.indHist10[1]) / normalizedResPop);
  else
    employment = 1;

  // Given the employment rate, calculate expected migration, add in births, and project the new population.
  var migration = f(normalizedResPop * f(employment - 1));
  var births = f(normalizedResPop * birthRate);
  var projectedResPop = f(f(normalizedResPop + migration) + births);

  // Examine how many zones require workers
  labourBase = census.comHist10[1] + census.indHist10[1];
  if (labourBase > 0.0)
    labourBase = f(census.resHist10[1] / labourBase);
  else
    labourBase = 1;
  labourBase = MiscUtils.clamp(labourBase, 0.0, labourBaseMax);

  // Project future industry and commercial needs, taking into account available labour, and competition from
  // other global cities
  var internalMarket = f(f(f(normalizedResPop + census.comPop) + census.indPop) / internalMarketDenom);
  var projectedComPop = f(internalMarket * labourBase);
  var projectedIndPop = f(f(census.indPop * labourBase) * extMarketParamTable[gameLevel]);
  projectedIndPop = Math.max(projectedIndPop, projectedIndPopMin);

  // Calculate the expected percentage changes in each population type
  var resRatio;
  if (normalizedResPop > 0)
    resRatio = f(projectedResPop / normalizedResPop);
  else
    resRatio = resRatioDefault;

  var comRatio;
  if (census.comPop > 0)
    comRatio = f(projectedComPop / census.comPop);
  else
    comRatio = projectedComPop;

  var indRatio;
  if (census.indPop > 0)
    indRatio = f(projectedIndPop / census.indPop);
  else
    indRatio = projectedIndPop;

  // simulate.cpp writes resRatio = min(indRatio, indRatioMax), which replaces the residential ratio with the industrial
  // one and leaves the industrial one unclamped: a slip the 1989 C (SetValves in micropolis-activity's s_sim.c) doesn't
  // make. Each ratio is clamped on its own, as there.
  resRatio = Math.min(resRatio, resRatioMax);
  comRatio = Math.min(comRatio, comRatioMax);
  indRatio = Math.min(indRatio, indRatioMax);

  // Constrain growth according to the tax level.
  var z = Math.min((budget.cityTax + gameLevel), taxMax);
  resRatio = f(f(f(resRatio - 1) * taxTableScale) + taxTable[z]);
  comRatio = f(f(f(comRatio - 1) * taxTableScale) + taxTable[z]);
  indRatio = f(f(f(indRatio - 1) * taxTableScale) + taxTable[z]);

  // Each ratio is a change to its valve, which the original's (short) takes whole by dropping the fraction, toward zero
  this.resValve = MiscUtils.clamp(this.resValve + Math.trunc(resRatio), -RES_VALVE_RANGE, RES_VALVE_RANGE);
  this.comValve = MiscUtils.clamp(this.comValve + Math.trunc(comRatio), -COM_VALVE_RANGE, COM_VALVE_RANGE);
  this.indValve = MiscUtils.clamp(this.indValve + Math.trunc(indRatio), -IND_VALVE_RANGE, IND_VALVE_RANGE);

  if (this.resCap && this.resValve > 0)
    this.resValve = 0;

  if (this.comCap && this.comValve > 0)
      this.comValve = 0;

  if (this.indCap && this.indValve > 0)
      this.indValve = 0;

  this._emitEvent(VALVES_UPDATED);
};


export { Valves };
