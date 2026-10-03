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

var init = function(type, map, spriteManager, random, x, y) {
  this.type = type;
  this.map = map;
  this.spriteManager = spriteManager;
  this.random = random;

  var pixX = x;
  var pixY = y;
  var worldX = x >> 4;
  var worldY = y >> 4;

  Object.defineProperty(this, 'x',
    {configurable: false,
     enumerable: true,
     set: function(val) {
       // XXX These getters have implicit knowledge of tileWidth: need to decide whether to disallow non 16px tiles
       pixX = val;
       worldX = val >> 4;
     },
     get: function() {
      return pixX;
     }
  });

  Object.defineProperty(this, 'y',
    {configurable: false,
     enumerable: true,
     set: function(val) {
       pixY = val;
       worldY = val >> 4;
     },
     get: function() {
      return pixY;
     }
  });

  Object.defineProperty(this, 'worldX',
    {configurable: false,
     enumerable: true,
     set: function(val) {
       worldX = val;
       pixX = val << 4;
     },
     get: function() {
      return worldX;
     }
  });

  Object.defineProperty(this, 'worldY',
    {configurable: false,
     enumerable: true,
     set: function(val) {
       worldY = val;
       pixY = val << 4;
     },
     get: function() {
      return worldY;
     }
  });

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


var spriteNotInBounds = function() {
  var x = this.worldX;
  var y = this.worldY;

  return x < 0 || y < 0 || x >= this.map.width || y >= this.map.height;
};


// A sprite's saved state. Its size and offsets are its type's, on the prototype, so they aren't saved.
var saveProps = ['type', 'frame', 'x', 'y', 'origX', 'origY', 'destX', 'destY', 'count', 'soundCount', 'dir',
                 'newDir', 'step', 'flag'];


var getSaveProps = function() {
  return saveProps.concat(this.extraSaveProps);
};


var save = function() {
  var data = {};
  var props = this.getSaveProps();

  for (var i = 0, l = props.length; i < l; i++)
    data[props[i]] = this[props[i]];

  return data;
};


var load = function(data) {
  var props = this.getSaveProps();

  for (var i = 0, l = props.length; i < l; i++) {
    if (data[props[i]] === undefined)
      throw new Error('A saved sprite has no ' + props[i]);

    this[props[i]] = data[props[i]];
  }
};


var base = {
  init: init,
  getFileName: getFileName,
  spriteNotInBounds: spriteNotInBounds,
  // State a sprite type holds beyond the common fields
  extraSaveProps: [],
  getSaveProps: getSaveProps,
  save: save,
  load: load
};


// geometry is the type's fixed size and drawing offset: {width, height, xOffset, yOffset}
var BaseSprite = function(spriteConstructor, geometry) {
  spriteConstructor.prototype = Object.create(base);
  spriteConstructor.prototype.width = geometry.width;
  spriteConstructor.prototype.height = geometry.height;
  spriteConstructor.prototype.xOffset = geometry.xOffset;
  spriteConstructor.prototype.yOffset = geometry.yOffset;
  EventEmitter(spriteConstructor);
};


export { BaseSprite };
