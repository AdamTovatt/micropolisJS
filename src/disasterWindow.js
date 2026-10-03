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

import { DISASTER_KINDS } from './commands.ts';
import { DISASTER_WINDOW_CLOSED } from './messages.ts';
import { MiscUtils } from './miscUtils.js';
import { ModalWindow } from './modalWindow.js';

var disasterSelectID = '#disasterSelect';
var disasterCancelID = '#disasterCancel';
var disasterFormID = '#disasterForm';


var DisasterWindow = ModalWindow(function() {
  $(disasterFormID).on('submit', submit.bind(this));
  $(disasterCancelID).on('click', cancel.bind(this));
}, disasterSelectID);


DisasterWindow.prototype.close = function(disaster) {
  disaster = disaster || DisasterWindow.DISASTER_NONE;
  this._toggleDisplay();
  this._emitEvent(DISASTER_WINDOW_CLOSED, disaster);
};


var cancel = function(e) {
  e.preventDefault();
  this.close();
};


var submit = function(e) {
  e.preventDefault();

  // Get element values
  var requestedDisaster = $(disasterSelectID)[0].value;
  this.close(requestedDisaster);
};


// Each disaster's option, #disasterMonster and so on, takes its kind in a triggerDisaster command as its value
DisasterWindow.prototype.open = function() {
  $('#disasterNone').attr('value', DisasterWindow.DISASTER_NONE);
  DISASTER_KINDS.forEach(function(kind) {
    $('#disaster' + kind.charAt(0).toUpperCase() + kind.slice(1)).attr('value', kind);
  });

  this._toggleDisplay();
};


// The value of the option that triggers no disaster
Object.defineProperty(DisasterWindow, 'DISASTER_NONE', MiscUtils.makeConstantDescriptor('none'));


export { DisasterWindow };
