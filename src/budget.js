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
import * as Messages from './messages.ts';
import { MiscUtils } from './miscUtils.js';
import { SERVICES } from './protocol.ts';
import { forecastYear, fundEffect, fundServices, fundingPercent, fundingSpend } from './serviceFunding.ts';

// Cost of maintaining 1 police station
var policeMaintenanceCost = 100;

// Cost of maintaining 1 fire station
var fireMaintenanceCost = 100;

// Cost of maintaining 1 road tile
var roadMaintenanceCost = 1;

// Cost of maintaining 1 rail tile
var railMaintenanceCost = 2;


var Budget = EventEmitter(function() {
  Object.defineProperties(this,
   {MAX_ROAD_EFFECT: MiscUtils.makeConstantDescriptor(32),
    MAX_POLICESTATION_EFFECT: MiscUtils.makeConstantDescriptor(1000),
    MAX_FIRESTATION_EFFECT:  MiscUtils.makeConstantDescriptor(1000)});

  this.roadEffect = this.MAX_ROAD_EFFECT;
  this.policeEffect = this.MAX_POLICESTATION_EFFECT;
  this.fireEffect = this.MAX_FIRESTATION_EFFECT;
  this.totalFunds = 0;
  this.cityTax = 7;
  this.cashFlow = 0;
  this.taxFund = 0;

  // These values denote how much money is required to fully maintain the relevant services
  this.roadMaintenanceBudget = 0;
  this.fireMaintenanceBudget = 0;
  this.policeMaintenanceBudget = 0;

  // Percentage of budget used
  this.roadPercent = 1;
  this.firePercent = 1;
  this.policePercent = 1;

  // The spend booked on each service, from which updateFundEffects sets its effect: what the player's funding costs,
  // what the year-end budget paid, or the full maintenance cost when autobudget funded every service
  this.roadSpend = 0;
  this.fireSpend = 0;
  this.policeSpend = 0;

  this.autoBudget = true;
});


var saveProps = ['autoBudget', 'totalFunds', 'policePercent', 'roadPercent', 'firePercent', 'roadSpend',
                 'policeSpend', 'fireSpend', 'roadMaintenanceBudget', 'policeMaintenanceBudget',
                 'fireMaintenanceBudget', 'cityTax', 'roadEffect', 'policeEffect', 'fireEffect', 'cashFlow', 'taxFund'];

Budget.prototype.save = function(saveData) {
  var budget = {};
  for (var i = 0, l = saveProps.length; i < l; i++)
    budget[saveProps[i]] = this[saveProps[i]];

  saveData.budget = budget;
};


Budget.prototype.load = function(saveData) {
  for (var i = 0, l = saveProps.length; i < l; i++)
    this[saveProps[i]] = saveData.budget[saveProps[i]];

  this._emitEvent(Messages.AUTOBUDGET_CHANGED, this.autoBudget);
  this._emitEvent(Messages.FUNDS_CHANGED, this.totalFunds);
};


Budget.prototype.setAutoBudget = function(value) {
  this.autoBudget = value;
  this._emitEvent(Messages.AUTOBUDGET_CHANGED, this.autoBudget);
};


var RLevels = [0.7, 0.9, 1.2];
var FLevels = [1.4, 1.2, 0.8];

// Funds the services from the funds and the last tax collection, scaling back the percentages the cash can't cover, and
// returns what each service is paid
Budget.prototype._calculateBestPercentages = function() {
  var funding = fundServices(this.totalFunds + this.taxFund, this.maintenance(), this.percents());
  this._setPercents(funding.percents);

  return funding.paid;
};


// Each service's full maintenance cost, by service
Budget.prototype.maintenance = function() {
  return {road: this.roadMaintenanceBudget, fire: this.fireMaintenanceBudget, police: this.policeMaintenanceBudget};
};


// Each service's funding percentage (0 to 1), by service
Budget.prototype.percents = function() {
  return {road: this.roadPercent, fire: this.firePercent, police: this.policePercent};
};


Budget.prototype._setPercents = function(percents) {
  this.roadPercent = percents.road;
  this.firePercent = percents.fire;
  this.policePercent = percents.police;
};


Budget.prototype._spends = function() {
  return {road: this.roadSpend, fire: this.fireSpend, police: this.policeSpend};
};


// The services given a whole percent in a map of them, in the order the budget funds them
var servicesIn = function(wholePercents) {
  return SERVICES.filter(function(service) { return wholePercents[service] !== undefined; });
};


// The percentages with the services given funded at the given whole percents, and the others at the percentages they
// have
Budget.prototype._percentsWith = function(wholePercents) {
  var percents = this.percents();
  servicesIn(wholePercents).forEach(function(service) {
    percents[service] = fundingPercent(wholePercents[service]);
  });

  return percents;
};


// What the year-end budget would leave if it ran now, from the current funds and the most recent tax collection and
// maintenance costs, with the services given funded at the given whole percents, as setFunding would set them, and
// the others at the percentages they have
Budget.prototype.forecast = function(wholePercents) {
  return forecastYear(this.totalFunds, this.taxFund, this.maintenance(), this._percentsWith(wholePercents));
};


// Funds the services given at the given whole percents, as the original's budget slider handlers (SimCmdRoadFund,
// SimCmdFireFund and SimCmdPoliceFund in micropolis-activity's w_sim.c) do, and leaves the others as they are: each one's spend is booked from its whole percent, and the effects are set from the spends.
// With no service given, nothing changes.
Budget.prototype.setFunding = function(wholePercents) {
  var services = servicesIn(wholePercents);
  if (services.length === 0)
    return;

  var maintenance = this.maintenance();
  var spends = this._spends();
  services.forEach(function(service) {
    spends[service] = fundingSpend(maintenance[service], wholePercents[service]);
  });

  this._setPercents(this._percentsWith(wholePercents));
  this._bookSpend(spends);
  this.updateFundEffects();
};


// The year-end budget, as doBudgetNow in the original, which never waits for the player: the city pays for its
// services at the funding it can afford of what was asked for, and takes in the year's tax. With auto-budget on and
// the funds to cover the services, that is all. With auto-budget off, or when auto-budget couldn't cover the services,
// the player is offered the budget to review; auto-budget that couldn't cover them turns off, as the original forces it
// off. Since the city never waits, a replay never depends on when a window closed.
Budget.prototype.doBudgetNow = function() {
  var costs = this._calculateBestPercentages();
  var totalCost = costs.road + costs.fire + costs.police;
  var funded = this.autoBudget && this.totalFunds + this.taxFund - totalCost > 0;

  this._collectTaxAndPayServices(totalCost);

  // Autobudget with cash for every service. As in the original, each service's spend is booked as its full
  // maintenance cost whatever its percentage, and the effects stay as they are.
  if (funded) {
    this._bookSpend(this.maintenance());
    return;
  }

  // The player's values, or what auto-budget could pay. As in the original, what each service gets is booked as its
  // spend, and the effects are set from those spends, standing in for the original's budget window. That window
  // (drawCurrPercents in micropolis-activity's w_budget.c, and the Tcl it calls), on drawing a percentage at a slider
  // position other than the slider's last one, sets the slider, which runs its handler (SimCmdRoadFund,
  // SimCmdFireFund or SimCmdPoliceFund in w_sim.c). The handler stores the whole percent back as the percentage, losing
  // any fraction, re-books the service's spend from it, and updates the effects. So there a fire department paid $94
  // of $300, drawn at 31%, is set to 31% and gets the effect of $93, and when no slider is drawn at a new position, no
  // effect changes. Here the review never changes the city: the percentages keep their fractions, and the effects
  // always follow what was paid.
  this._bookSpend(costs);
  this.updateFundEffects();

  if (this.autoBudget) {
    this.setAutoBudget(false);
    this._emitEvent(Messages.NO_MONEY);
  }

  this._emitEvent(Messages.BUDGET_REVIEW_DUE);
};


// Collects this year's taxes and pays the year's services out of them
Budget.prototype._collectTaxAndPayServices = function(total) {
  this.spend(-(this.taxFund - total));
};


// Books the spend on each service, which updateFundEffects reads
Budget.prototype._bookSpend = function(spends) {
  this.roadSpend = spends.road;
  this.fireSpend = spends.fire;
  this.policeSpend = spends.police;
};


// Sets each service's effect from the spend booked on it
Budget.prototype.updateFundEffects = function() {
  // Update the effect this level of spending will have on infrastructure deterioration
  this.roadEffect = this.MAX_ROAD_EFFECT;
  this.policeEffect = this.MAX_POLICESTATION_EFFECT;
  this.fireEffect = this.MAX_FIRESTATION_EFFECT;

  if (this.roadMaintenanceBudget > 0)
    this.roadEffect = fundEffect(this.roadEffect, this.roadSpend, this.roadMaintenanceBudget);

  if (this.fireMaintenanceBudget > 0)
    this.fireEffect = fundEffect(this.fireEffect, this.fireSpend, this.fireMaintenanceBudget);

  if (this.policeMaintenanceBudget > 0)
    this.policeEffect = fundEffect(this.policeEffect, this.policeSpend, this.policeMaintenanceBudget);
};


Budget.prototype.collectTax = function(gameLevel, census) {
  this.cashFlow = 0;

  // How much would it cost to fully fund every service?
  this.policeMaintenanceBudget = census.policeStationPop * policeMaintenanceCost;
  this.fireMaintenanceBudget = census.fireStationPop * fireMaintenanceCost;

  var roadCost = census.roadTotal * roadMaintenanceCost;
  var railCost = census.railTotal * railMaintenanceCost;
  this.roadMaintenanceBudget = Math.floor((roadCost + railCost) * RLevels[gameLevel]);

  this.taxFund = Math.floor(Math.floor(census.totalPop * census.landValueAverage / 120) * this.cityTax * FLevels[gameLevel]);

  if (census.totalPop > 0) {
    this.cashFlow = this.taxFund - (this.policeMaintenanceBudget + this.fireMaintenanceBudget + this.roadMaintenanceBudget);
    this.doBudgetNow();
  } else {
    // We don't want roads etc deteriorating when population hasn't yet been established
    // (particularly early game)
    this.roadEffect   = this.MAX_ROAD_EFFECT;
    this.policeEffect = this.MAX_POLICESTATION_EFFECT;
    this.fireEffect   = this.MAX_FIRESTATION_EFFECT;
  }
};


Budget.prototype.setTax = function(amount) {
  if (amount === this.cityTax)
    return;

  this.cityTax = amount;
};


Budget.prototype.setFunds = function(amount) {
  if (amount === this.totalFunds)
    return;

  this.totalFunds = Math.max(0, amount);

  this._emitEvent(Messages.FUNDS_CHANGED, this.totalFunds);
  if (this.totalFunds === 0)
    this._emitEvent(Messages.NO_MONEY);
};


Budget.prototype.spend = function(amount) {
  this.setFunds(this.totalFunds - amount);
};


Budget.prototype.shouldDegradeRoad = function() {
  return this.roadEffect < Math.floor(15 * this.MAX_ROAD_EFFECT / 16);
};


export { Budget };
