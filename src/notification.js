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

import { MiscUtils } from './miscUtils.js';
import { Text } from './text.ts';

var TIMEOUT_SECS = 30;


function Notification(element, map) {
  element = MiscUtils.normaliseDOMid(element);

  this._map = map;
  this._element = $(element);
  this._timeout = null;

  this._handleClick = handleClick.bind(this);

  // The position to centre on when the link is clicked
  this._x = -1;
  this._y = -1;

  this._element.click(this._handleClick);
  this.close = close.bind(this);
  if (this._element.is(':visible'))
    this._element.toggle();
}


var close = function(e) {
  if (e)
    e.preventDefault();

  if (this._element.is(':visible'))
    this._element.toggle();
};


Notification.prototype._displayLink = function(text, x, y) {
  if (this._timeout !== null) {
    window.clearTimeout(this._timeout);
    this._timeout = null;
  }

  this._element.text(text);

  this._x = x;
  this._y = y;

  this._element.addClass('pointer');

  if (!this._element.is(':visible'))
    this._element.toggle();

  this._timeout = window.setTimeout(function() {this._timeout = null; this.close();}.bind(this), TIMEOUT_SECS * 1000);
};


Notification.prototype._displayText = function(text) {
  if (this._timeout !== null) {
    window.clearTimeout(this._timeout);
    this._timeout = null;
  }

  this._element.removeClass('pointer');
  this._element.text(text);
  this._x = -1;
  this._y = -1;

  if (!this._element.is(':visible'))
    this._element.toggle();

  this._timeout = window.setTimeout(function() {this._timeout = null; this.close();}.bind(this), TIMEOUT_SECS * 1000);
};


var handleClick = function(e) {
  e.preventDefault();

  if (this._x === -1 || this._y === -1)
    return;

  this._map.centreOn(this._x, this._y);
};


Notification.prototype.createMessage = function(message) {

  if (Object.hasOwn(message, 'data') && message.data !== undefined && Object.hasOwn(message.data, 'x') && Object.hasOwn(message.data, 'y')) {
    this._displayLink(Text.messages[message.subject].text, message.data.x, message.data.y);
    return;
  }

  this._displayText(Text.messages[message.subject].text);
};


Notification.prototype.badNews = function(message) {
  this._element.removeClass('neutral');
  this._element.removeClass('good');
  this._element.addClass('bad');
  this.createMessage(message);
};


Notification.prototype.goodNews = function(message) {
  this._element.removeClass('neutral');
  this._element.removeClass('bad');
  this._element.addClass('good');
  this.createMessage(message);
};


Notification.prototype.news = function(message) {
  this._element.removeClass('good');
  this._element.removeClass('bad');
  this._element.addClass('neutral');
  this.createMessage(message);
};


export { Notification };
