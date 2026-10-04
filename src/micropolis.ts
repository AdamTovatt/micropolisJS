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

import { browserCityEnvironment } from "./browserCityEnvironment";
import { CityClient } from "./cityClient";
import { joinLinkedCity, leaveLostCity, linkedCity, ServerCity } from "./cityLink";
import { CityState } from "./cityState";
import { ClientConfig } from "./clientConfig";
import { requiredElement, setShown } from "./domElements";
import { errorMessage } from "./errorMessage";
import { Game } from "./game";
import { showOnlineList } from "./onlineList";
import { loadMapArt, MapArt } from "./renderAssets";
import { signInIfServerAnswers } from "./signInForm";
import { showSplashScreen } from "./splashScreen";
import { CityList, pageStore } from "./storage";
import { attachDriverToTestHook, installTestHook } from "./testHook";
import { isAcceptableTileImage } from "./tileSet";
import { debugOption, seedOption } from "./urlOptions";
import { webGL2TextureLimit } from "./webglRenderer";
import { WebSocketCitySource } from "./webSocketCitySource";

// The page's entry point: it waits for the tile set and the sprites, loads the map's art, signs in to the server, and
// joins the city the page was opened with, or shows the splash screen. With no server answering, it says so, and
// offers no game.

// The game seed the page was opened with, or null for none. One that isn't a seed is refused out loud, and the map is
// picked at random.
function pageSeed(): number | null {
  try {
    return seedOption(window.location.search);
  } catch (e) {
    alert(errorMessage(e));
    return null;
  }
}

// Resolves once the image has loaded, or failed to
function settled(image: HTMLImageElement): Promise<void> {
  if (image.complete) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    image.addEventListener("load", () => resolve(), {once: true});
    image.addEventListener("error", () => resolve(), {once: true});
  });
}

// The page's tile image once it has loaded, or null when it is not a whole tile set, such as one that failed to load
async function loadTiles(): Promise<HTMLImageElement | null> {
  const tiles = requiredElement("tiles", HTMLImageElement);
  await settled(tiles);

  return isAcceptableTileImage(tiles.naturalWidth, tiles.naturalHeight) ? tiles : null;
}

// Starts the page: the game seed to offer first (?seed=<n>), or null to pick one at random, and the city on the server
// to join (?city=<id>), or null to choose one on the splash screen
async function start(seed: number | null, city: string | null): Promise<void> {
  // The map is drawn with WebGL2: without it, the page says so instead of starting
  const textureLimit = webGL2TextureLimit();
  if (textureLimit === null) {
    setShown(requiredElement("loadingBanner"), false);
    setShown(requiredElement("noWebGL"), true);
    return;
  }

  const tiles = await loadTiles();
  if (tiles === null) {
    // XXX Replace with an error dialog
    alert("Failed to load tileset!");
    return;
  }

  const sprites = requiredElement("sprites", HTMLImageElement);
  await settled(sprites);

  let mapArt: MapArt;
  try {
    mapArt = await loadMapArt(tiles, sprites, textureLimit);
  } catch (error) {
    console.error(error);
    alert(`Failed to load the map's art: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  setShown(requiredElement("loadingBanner"), false);

  // Every city runs on the server, so the player signs in first. With no server answering, there is no game to play.
  const cityClient = new CityClient(browserCityEnvironment());
  showOnlineList(requiredElement("onlineList"), cityClient);
  try {
    await signInIfServerAnswers(cityClient);
  } catch (error) {
    console.error("Signing in failed", error);
  }

  // A server that answered welcomes the player in the end, however many tries signing in or connecting takes
  if (!await cityClient.welcomed()) {
    showNoServer();
    return;
  }

  // The only way the client reaches the city, and the client's copy of it, which follows the source from the start
  const source = new WebSocketCitySource(cityClient, (error) => leaveLostCity(error, window));
  const state = new CityState(source);

  // The end-to-end runner drives the game through this, once there is a source to drive
  if (ClientConfig.debug) {
    installTestHook();
    attachDriverToTestHook(source.driver);
  }

  // A city played goes on the list of cities this browser started or joined, which the splash screen offers to join
  // again
  const cities = new CityList(pageStore());
  const parts = {source, state, presence: cityClient, mapArt};
  const play = (started: ServerCity) => {
    cities.remember({city: started.city, name: started.name});
    new Game(parts, started);
  };

  if (city !== null && await joinLinkedCity(city, source, play, window)) {
    return;
  }

  showSplashScreen(parts, seed, {cities, play});
}

// Says the server isn't answering, in place of the game, and loads the page again when the player tries again. The
// page's address keeps any city's link, so trying again joins it.
function showNoServer(): void {
  requiredElement("noServerRetry").addEventListener("click", () => window.location.reload());
  setShown(requiredElement("noServer"), true);
}

ClientConfig.debug = debugOption(window.location.search);

void start(pageSeed(), linkedCity(window));
