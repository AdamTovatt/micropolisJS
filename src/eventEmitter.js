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

import { Config } from './config.js';

// Every emitter's listeners, keyed by the emitter itself, so each instance of a decorated constructor keeps its own
var registries = new WeakMap();


var listenersFor = function(emitter, event) {
  var events = registries.get(emitter);
  if (events === undefined) {
    events = {};
    registries.set(emitter, events);
  }

  if (!(event in events))
    events[event] = [];

  return events[event];
};


// Decorate the given object, by adding {add|remove}EventListener methods, and an internal '_emitEvent' method
var EventEmitter = function(obj) {
  var addListener = function(event, listener) {
    var listeners = listenersFor(this, event);
    if (listeners.indexOf(listener) === -1)
      listeners.push(listener);
  };


  var removeListener = function(event, listener) {
    var listeners = listenersFor(this, event);
    var index = listeners.indexOf(listener);
    if (index !== -1)
      listeners.splice(index, 1);
  };


  var emitEvent = function(event, value) {
    if (event === undefined) {
      if (!Config.debug)
        console.warn('Sending undefined event!');
      else
        throw new Error('Sending undefined event!');
    }

    var listeners = listenersFor(this, event);
    for (var i = 0, l = listeners.length; i < l; i++)
      listeners[i](value);
  };


  var addProps = function(obj, message) {
    var hasExistingProp = ['addEventListener', 'removeEventListener', '_emitEvent'].some(function(prop) {
      return obj[prop] !== undefined;
    });

    if (hasExistingProp)
      throw new Error('Cannot decorate ' + message + ': existing properties would be overwritten!');

    obj.addEventListener = addListener;
    obj.removeEventListener = removeListener;
    obj._emitEvent = emitEvent;
  };

  if (typeof(obj) === 'object')
    addProps(obj, 'object');
  else
    addProps(obj.prototype, 'constructor');

  return obj;
};


export { EventEmitter };
