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

import { DEBUG_WINDOW_CLOSED } from './messages.ts';
import { ModalWindow } from './windowBase.ts';
import { MiscUtils } from './miscUtils.js';

var DebugWindow = ModalWindow(function() {
  $(debugCancelID).on('click', cancel.bind(this));
  $(debugFormID).on('submit', submit.bind(this));
});


var debugCancelID = '#debugCancel';
var debugFormID = '#debugForm';


DebugWindow.prototype.close = function(actions) {
  actions = actions || [];
  this._emitEvent(DEBUG_WINDOW_CLOSED, actions);
  this._toggleDisplay();
};


var cancel = function(e) {
  e.preventDefault();
  this.close([]);
};


var submit = function(e) {
  e.preventDefault();

  var actions = [];

  // Get element values
  var shouldAdd = $('.debugAdd:checked').val();
  if (shouldAdd === 'true')
    actions.push({action: DebugWindow.ADD_FUNDS, data: {}});

  if ($('.debugLog:checked').val() === 'true')
    actions.push({action: DebugWindow.DOWNLOAD_LOG, data: {}});

  this.close(actions);
};


// The log downloads only when asked for each time, never because it was the last time
DebugWindow.prototype.open = function() {
  $('#logNo').prop('checked', true);
  this._toggleDisplay();
};


var defineAction = (function() {
  var uid = 0;

  return function(name) {
    Object.defineProperty(DebugWindow, name, MiscUtils.makeConstantDescriptor(uid));
    uid += 1;
  };
})();


defineAction('ADD_FUNDS');
defineAction('DOWNLOAD_LOG');


export { DebugWindow };
