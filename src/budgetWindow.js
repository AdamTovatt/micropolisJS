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

import $ from "jquery";

import { BUDGET_WINDOW_CLOSED } from './messages.ts';
import { MiscUtils } from './miscUtils.js';
import { ModalWindow } from './modalWindow.js';
import { formatMoney } from './money.ts';
import { wholePercent } from './wholePercent.ts';

var BudgetWindow = ModalWindow(function() {
  $(budgetCancelID).on('click', cancel.bind(this));
  $(budgetResetID).on('click', resetItems.bind(this));
  $(budgetFormID).on('submit', submit.bind(this));

  for (var i = 0; i < services.length; i++)
    $(MiscUtils.normaliseDOMid(services[i].sliderID)).on('input', onSliderMoved.bind(this, services[i]));
  $('#taxRate').on('input', onTaxUpdate);
});


// The funded services: each one's slider, and the budget data's keys for its funding percentage (0 to 1) and its full
// maintenance cost
var services = [
  {name: 'road', sliderID: 'roadRate', percentKey: 'roadPercent', maintenanceKey: 'roadMaintenanceBudget'},
  {name: 'fire', sliderID: 'fireRate', percentKey: 'firePercent', maintenanceKey: 'fireMaintenanceBudget'},
  {name: 'police', sliderID: 'policeRate', percentKey: 'policePercent', maintenanceKey: 'policeMaintenanceBudget'}
];

var budgetResetID = '#budgetReset';
var budgetCancelID = '#budgetCancel';
var budgetFormID = '#budgetForm';


var sliderPercentage = function(elementID) {
  return $(MiscUtils.normaliseDOMid(elementID))[0].value - 0;
};


// Shows each service's cost at its funding level, and the cash flow and year-end balance the budget forecasts for
// those levels.
var updateFunding = function() {
  var forecast = this.forecast(this.funding);

  for (var i = 0; i < services.length; i++) {
    var service = services[i];
    var text = [sliderPercentage(service.sliderID), '% of ', formatMoney(this.maintenance[service.name]),
                ' = ', formatMoney(forecast.wanted[service.name])].join('');
    $(MiscUtils.normaliseDOMid(service.sliderID + 'Label')).text(text);
  }

  $('#cashFlow').text(formatMoney(forecast.fundsChange));
  $('#fundsAfterYear').text(formatMoney(forecast.fundsAfterYear));
};


// Draws each slider at the whole percent of the percentage the budget has, and starts the window's funding with no
// changes. The funding holds the whole percent of each slider the player moves, and OK sends only those, which the
// budget funds as the original's slider handlers do. A service whose slider hasn't moved keeps its percentage.
//
// This keeps the fraction of a percentage the budget scaled back to the cash it had, where the original loses it: its
// window, on drawing a slider at a whole percent other than the slider's last position, sets the slider, and setting a
// slider stores its whole percent back. Opening a window never changes the city here, so that is not ported.
var startFunding = function() {
  this.funding = {};
  for (var i = 0; i < services.length; i++) {
    var service = services[i];
    $(MiscUtils.normaliseDOMid(service.sliderID))[0].value = wholePercent(this.originalPercents[service.name]);
  }
  updateFunding.call(this);
};


var onSliderMoved = function(service) {
  this.funding[service.name] = sliderPercentage(service.sliderID);
  updateFunding.call(this);
};


var onTaxUpdate = function() {
  $('#taxRateLabel').text(['Tax rate: ', sliderPercentage('taxRate'), '%'].join(''));
};


var resetItems = function(e) {
  startFunding.call(this);
  $('#taxRate')[0].value = this.originalTaxRate;
  onTaxUpdate();

  e.preventDefault();
};


BudgetWindow.prototype.close = function(data) {
  data = data || {cancelled: true};
  this._emitEvent(BUDGET_WINDOW_CLOSED, data);
  this._toggleDisplay();
};


var cancel = function(e) {
  e.preventDefault();
  this.close({cancelled: true});
};


var submit = function(e) {
  e.preventDefault();

  this.close({cancelled: false, funding: this.funding, taxPercent: sliderPercentage('taxRate'), e: e,
              original: e.type});
};


var requireBudgetData = function(budgetData, key) {
  if (budgetData[key] === undefined)
    throw new Error('Missing budget data (' + key + ')');
  return budgetData[key];
};


BudgetWindow.prototype.open = function(budgetData) {
  this.forecast = requireBudgetData(budgetData, 'forecast');
  this.maintenance = {};
  this.originalPercents = {};

  for (var i = 0; i < services.length; i++) {
    var service = services[i];
    this.maintenance[service.name] = requireBudgetData(budgetData, service.maintenanceKey);
    this.originalPercents[service.name] = requireBudgetData(budgetData, service.percentKey);
  }

  this.originalTaxRate = requireBudgetData(budgetData, 'taxRate');
  $('#taxRate')[0].value = this.originalTaxRate;
  onTaxUpdate();

  $('#taxesCollected').text(formatMoney(requireBudgetData(budgetData, 'taxesCollected')));
  $('#fundsNow').text(formatMoney(requireBudgetData(budgetData, 'totalFunds')));
  startFunding.call(this);

  this._toggleDisplay();
};


export { BudgetWindow };
