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

var BudgetWindow = ModalWindow(function() {
  $(budgetCancelID).on('click', cancel.bind(this));
  $(budgetResetID).on('click', resetItems.bind(this));
  $(budgetFormID).on('submit', submit.bind(this));

  for (var i = 0; i < services.length; i++)
    $(MiscUtils.normaliseDOMid(services[i].rateKey)).on('input', updateFunding.bind(this));
  $('#taxRate').on('input', onTaxUpdate);
});


// The funded services. rateKey names both the service's slider and its funding percentage in the
// budget data, and maintenanceKey its full maintenance cost.
var services = [
  {name: 'road', rateKey: 'roadRate', maintenanceKey: 'roadMaintenanceBudget'},
  {name: 'fire', rateKey: 'fireRate', maintenanceKey: 'fireMaintenanceBudget'},
  {name: 'police', rateKey: 'policeRate', maintenanceKey: 'policeMaintenanceBudget'}
];

var budgetResetID = '#budgetReset';
var budgetCancelID = '#budgetCancel';
var budgetFormID = '#budgetForm';


var sliderPercentage = function(elementID) {
  return $(MiscUtils.normaliseDOMid(elementID))[0].value - 0;
};


// Shows each service's cost at its slider's funding level, and the cash flow and year-end
// balance the budget forecasts for those levels.
var updateFunding = function() {
  var fractions = {};
  for (var i = 0; i < services.length; i++)
    fractions[services[i].name] = sliderPercentage(services[i].rateKey) / 100;

  var forecast = this.forecast(fractions);

  for (i = 0; i < services.length; i++) {
    var service = services[i];
    var text = [sliderPercentage(service.rateKey), '% of ', formatMoney(this.maintenance[service.name]),
                ' = ', formatMoney(forecast.wanted[service.name])].join('');
    $(MiscUtils.normaliseDOMid(service.rateKey + 'Label')).text(text);
  }

  $('#cashFlow').text(formatMoney(forecast.fundsChange));
  $('#fundsAfterYear').text(formatMoney(forecast.fundsAfterYear));
};


var onTaxUpdate = function() {
  $('#taxRateLabel').text(['Tax rate: ', sliderPercentage('taxRate'), '%'].join(''));
};


var resetItems = function(e) {
  for (var i = 0; i < services.length; i++)
    $(MiscUtils.normaliseDOMid(services[i].rateKey))[0].value = this.originalRates[services[i].name];
  updateFunding.call(this);
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

  var data = {cancelled: false, taxPercent: sliderPercentage('taxRate'), e: e, original: e.type};
  for (var i = 0; i < services.length; i++)
    data[services[i].name + 'Percent'] = sliderPercentage(services[i].rateKey);

  this.close(data);
};


var requireBudgetData = function(budgetData, key) {
  if (budgetData[key] === undefined)
    throw new Error('Missing budget data (' + key + ')');
  return budgetData[key];
};


BudgetWindow.prototype.open = function(budgetData) {
  this.forecast = requireBudgetData(budgetData, 'forecast');
  this.maintenance = {};
  this.originalRates = {};

  for (var i = 0; i < services.length; i++) {
    var service = services[i];
    this.maintenance[service.name] = requireBudgetData(budgetData, service.maintenanceKey);
    this.originalRates[service.name] = requireBudgetData(budgetData, service.rateKey);
    $(MiscUtils.normaliseDOMid(service.rateKey))[0].value = this.originalRates[service.name];
  }

  this.originalTaxRate = requireBudgetData(budgetData, 'taxRate');
  $('#taxRate')[0].value = this.originalTaxRate;
  onTaxUpdate();

  $('#taxesCollected').text(formatMoney(requireBudgetData(budgetData, 'taxesCollected')));
  $('#fundsNow').text(formatMoney(requireBudgetData(budgetData, 'totalFunds')));
  updateFunding.call(this);

  this._toggleDisplay();
};


export { BudgetWindow };
