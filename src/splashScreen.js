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

import { Config } from './config.js';
import { Game } from './game.js';
import { MapGenerator } from './mapGenerator.js';
import { Random } from './random.ts';
import { SplashCanvas } from './splashCanvas.ts';
import { Storage } from './storage.js';
import { UiRandom } from './uiRandom.ts';

/*
 *
 * The SplashScreen is the first screen the player will see on launch. It is responsible for map generation,
 * placing UI on screen to allow the player to select a map or load a game, and finally launching the game.
 * This should not be called until the tiles and sprites have been loaded.
 *
 */

var onresize = null;


// If the window is initially too small, try and relaunch if it gets bigger
var makeResizeListener = function(tileSet, snowTileSet, spriteSheet) {
  return function() {
    $(window).off('resize');
    new SplashScreen(tileSet, snowTileSet, spriteSheet);
  };
};


function SplashScreen(tileSet, snowTileSet, spriteSheet) {
  // We don't launch the game if the screen is too small, however, we should retain the right to do so
  // should the situation change...
  if ($('#tooSmall').is(':visible')) {
    onresize = makeResizeListener(tileSet, snowTileSet, spriteSheet);
    $(window).on('resize', onresize);
    return;
  }

  this.tileSet = tileSet;
  this.snowTileSet = snowTileSet;
  this.spriteSheet = spriteSheet;
  // Whether the player has moved on, to a new game or a saved one
  this.departed = false;
  generateMap.call(this, Config.seed);

  // Set up listeners on buttons. When play is clicked, we will move on to get the player's desired
  // difficulty level and city name before launching the game properly
  $('#splashGenerate').click(regenerateMap.bind(this));
  $('#splashPlay').click(acquireNameAndDifficulty.bind(this));
  $('#splashLoad').click(handleLoad.bind(this));

  // Debug mode can open a save file, such as an end-to-end checkpoint's, to reproduce what it shows
  if (Config.debug) {
    $('#splashLoadFileContainer').removeClass('hidden');
    $('#splashLoadFile').click(chooseSaveFile);
    $('#splashLoadFileInput').on('change', handleLoadFile.bind(this));
  }

  // Conditionally enable load/save buttons
  $('#saveRequest').prop('disabled', !Storage.canStore);
  $('#splashLoad').prop('disabled', !(Storage.canStore && Storage.getSavedGame() !== null));

  // Paint the minimap
  this.splashCanvas = new SplashCanvas('splashContainer', tileSet);
  this.splashCanvas.paint(this.map);

  // Let's get some bits on screen!
  $('.awaitGeneration').toggle();
  $('#splashPlay').focus();
}


// Generate the map of this game seed, or of a new one when none is given
var generateMap = function(seed) {
  this.seed = seed === undefined || seed === null ? UiRandom.newSeed() : seed;
  this.map = MapGenerator(Random.mapStream(this.seed));
  $('#splashSeed').text(this.seed);
};


// Generate a new map at the user's request, and paint it
var regenerateMap = function(e) {
  e.preventDefault();

  generateMap.call(this);
  this.splashCanvas.paint(this.map);
};


// Fetches game data from the storage manager, and launches the game. We won't return from here
var handleLoad = function(e) {
  e.preventDefault();

  var savedGame = Storage.getSavedGame();

  if (savedGame === null)
    return;

  launchSavedGame.call(this, savedGame);
};


var chooseSaveFile = function(e) {
  e.preventDefault();
  $('#splashLoadFileInput').trigger('click');
};


// Launches the game saved in the chosen file. The file holds the text the game saves to storage.
var handleLoadFile = function(e) {
  var file = e.target.files[0];
  // Choosing the same file again, after it failed, is a change too
  e.target.value = '';
  if (file === undefined)
    return;

  file.text().then(function(text) {
    // The player moved on while the file was read
    if (this.departed)
      return;

    // A file that reads as a save can still fail to load
    try {
      launchSavedGame.call(this, Storage.parse(text));
    } catch (err) {
      alert('Could not read ' + file.name + ': ' + err.message);
    }
  }.bind(this));
};


// Removes the splash screen's listeners and hides it
var leaveSplash = function() {
  $('#splashLoad').off('click');
  $('#splashLoadFile').off('click');
  $('#splashLoadFileInput').off('change');
  $('#splashGenerate').off('click');
  $('#splashPlay').off('click');

  $('#splash').toggle();
  this.departed = true;
};


// The game is built before the splash screen goes, so a save that won't load leaves it showing
var launchSavedGame = function(savedGame) {
  Game.fromSave(savedGame, this.tileSet, this.snowTileSet, this.spriteSheet);

  leaveSplash.call(this);
};


// After a map has been selected, call this function to display a form asking the user for
// a city name and difficulty level.
var acquireNameAndDifficulty = function(e) {
  e.preventDefault();

  leaveSplash.call(this);

  // As a convenience, the city name is not mandatory in debug mode
  if (Config.debug)
    $('#nameForm').removeAttr('required');

  // When the form is submitted, we'll be ready to launch the game
  $('#playForm').submit(play.bind(this));

  // Display the name and difficulty form
  $('#start').toggle();
  $('#nameForm').focus();
};


// This function should be called after the name/difficulty form has been submitted. The game will now be launched
// with the map selected earlier.
var play = function(e) {
  e.preventDefault();

  // As usual, uninstall event listeners, and hide the UI
  $('#playForm').off('submit');
  $('#start').toggle();

  // What values did the player specify?
  var difficulty = $('.difficulty:checked').val() - 0;
  var name = $('#nameForm').val();

  // Launch a new game
  Game.newGame(this.map, this.seed, this.tileSet, this.snowTileSet, this.spriteSheet, difficulty, name);
};


export { SplashScreen };
