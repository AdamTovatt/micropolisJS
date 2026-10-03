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

import { browserCityEnvironment } from './browserCityEnvironment.ts';
import { CityClient } from './cityClient.ts';
import { Config } from './config.js';
import { showOnlineList } from './onlineList.ts';
import { signInIfServerAnswers } from './signInForm.ts';
import { SplashScreen } from './splashScreen.js';
import { installTestHook } from './testHook.ts';
import { TileSet } from './tileSet.js';
import { TileSetURI } from './tileSetURI.ts';
import { TileSetSnowURI } from './tileSetSnowURI.ts';
import { debugOption, seedOption } from './urlOptions.ts';

/*
 *
 * Our task in main is to load the tile image, create a TileSet from it, and then tell the SplashScreen to display
 * itself. We will never return here.
 *
 */


var fallbackImage, tileSet, snowTileSet;


var onTilesLoaded = function() {
  var snowTiles = $('#snowtiles')[1];
  snowTileSet = new TileSet(snowTiles, onAllTilesLoaded, onFallbackTilesLoaded);
};


var onAllTilesLoaded = function() {
  // Kick things off properly
  var sprites = $('#sprites')[0];
  if (sprites.complete) {
    $('#loadingBanner').css('display', 'none');

    var startGame = function() {
      new SplashScreen(tileSet, snowTileSet, sprites);
    };

    // Sign in first when a server answers. The game starts whatever happens, single-player when it must.
    var cityClient = new CityClient(browserCityEnvironment());
    showOnlineList(document.getElementById('onlineList'), cityClient);
    signInIfServerAnswers(cityClient).then(startGame, function(error) {
      console.error('Signing in failed', error);
      startGame();
    });
  } else {
     window.setTimeout(onAllTilesLoaded, 0);
  }
};


// XXX Replace with an error dialog
var onFallbackError = function() {
  fallbackImage.onload = fallbackImage.onerror = null;
  alert('Failed to load tileset!');
};


var onFallbackSnowLoad = function() {
  fallbackImage.onload = fallbackImage.onerror = null;
  snowTileSet = new TileSet(fallbackImage, onAllTilesLoaded, onFallbackError);
};


var onFallbackTilesLoaded = function() {
  fallbackImage = new Image();
  fallbackImage.onload = onFallbackSnowLoad;
  fallbackImage.onerror = onFallbackError;
  fallbackImage.src = TileSetSnowURI;
};


var onFallbackLoad = function() {
  fallbackImage.onload = fallbackImage.onerror = null;
  tileSet = new TileSet(fallbackImage, onFallbackTilesLoaded, onFallbackError);
};


var tileSetError = function() {
  // We might be running locally in Chrome, which handles the security context of file URIs differently, which makes
  // things go awry when we try to create an image from a "tainted" canvas (one we've painted on). Let's try creating
  // the tileset by URI instead
  fallbackImage = new Image();
  fallbackImage.onload = onFallbackLoad;
  fallbackImage.onerror = onFallbackError;
  fallbackImage.src = TileSetURI;
};


Config.debug = debugOption(window.location.search);

// A seed the player can't have meant is refused out loud, and the map is picked at random as usual
try {
  Config.seed = seedOption(window.location.search);
} catch (e) {
  alert(e.message);
}

// The end-to-end runner drives the game through this
if (Config.debug)
  installTestHook();


var tiles = $('#tiles')[0];
tileSet = new TileSet(tiles, onTilesLoaded, tileSetError);
