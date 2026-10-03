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

// A sprite's starting state, as the original's initSprite sets it before its type's own. (x, y) is the sprite's
// position in map pixels, in the original's frame: it is neither where the sprite is drawn nor where it collides. Each
// type is drawn at (x + xOffset, y + yOffset), and collides, crashes and leaves the map at its hot spot,
// (x + xHot, y + yHot), with the values the original gives the type. The tiles a sprite reads or damages lie at the
// offsets its move names, as in the original.
var init = function(type, map, spriteManager, random, x, y) {
  this.type = type;
  this.map = map;
  this.spriteManager = spriteManager;
  this.random = random;

  this.x = x;
  this.y = y;
  this.frame = 0;
  this.origX = 0;
  this.origY = 0;
  this.destX = 0;
  this.destY = 0;
  this.count = 0;
  this.soundCount = 0;
  this.dir = 0;
  this.newDir = 0;
  this.step = 0;
  this.flag = 0;
};


var getFileName = function() {
  return ['obj', this.type, '-', this.frame - 1].join('');
};


// Whether the hot spot is off the map
var spriteNotInBounds = function() {
  var x = this.x + this.xHot;
  var y = this.y + this.yHot;

  return x < 0 || y < 0 || x >= (this.map.width << 4) || y >= (this.map.height << 4);
};


// The sprite dies in an explosion at its hot spot, and a type that can crash reports it, as the original's
// explodeSprite does
var explodeSprite = function() {
  this.frame = 0;

  var x = this.x + this.xHot;
  var y = this.y + this.yHot;
  this.spriteManager.makeExplosionAt(x, y);

  if (this.crashMessage !== undefined)
    this._emitEvent(this.crashMessage, {showable: true, x: x >> 4, y: y >> 4});
};


// A sprite's saved state. Its size, offsets and hot spot are its type's, on the prototype, so they aren't saved.
var saveProps = ['type', 'frame', 'x', 'y', 'origX', 'origY', 'destX', 'destY', 'count', 'soundCount', 'dir',
                 'newDir', 'step', 'flag'];


var save = function() {
  var data = {};

  for (var i = 0, l = saveProps.length; i < l; i++)
    data[saveProps[i]] = this[saveProps[i]];

  return data;
};


var load = function(data) {
  for (var i = 0, l = saveProps.length; i < l; i++) {
    if (data[saveProps[i]] === undefined)
      throw new Error('A saved sprite has no ' + saveProps[i]);

    this[saveProps[i]] = data[saveProps[i]];
  }
};


var base = {
  init: init,
  getFileName: getFileName,
  spriteNotInBounds: spriteNotInBounds,
  explodeSprite: explodeSprite,
  save: save,
  load: load
};


// traits are what the type fixes for every sprite of it, as the original's initSprite and explodeSprite give them: its
// size, drawing offset and hot spot, {width, height, xOffset, yOffset, xHot, yHot}, and crashMessage, the message a
// crash of the type reports, for the types the original reports
var BaseSprite = function(spriteConstructor, traits) {
  spriteConstructor.prototype = Object.create(base);
  spriteConstructor.prototype.width = traits.width;
  spriteConstructor.prototype.height = traits.height;
  spriteConstructor.prototype.xOffset = traits.xOffset;
  spriteConstructor.prototype.yOffset = traits.yOffset;
  spriteConstructor.prototype.xHot = traits.xHot;
  spriteConstructor.prototype.yHot = traits.yHot;
  spriteConstructor.prototype.crashMessage = traits.crashMessage;
  EventEmitter(spriteConstructor);
};


export { BaseSprite };
