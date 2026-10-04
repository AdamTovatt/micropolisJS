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
import { joinLinkedCity, leaveLostCity, linkedCity } from "./cityLink";
import type { CitySource } from "./citySource";
import { CityState } from "./cityState";
import { ClientConfig } from "./clientConfig";
import { requiredElement } from "./domElements";
import { errorMessage } from "./errorMessage";
import { Game } from "./game";
import { showOnlineList } from "./onlineList";
import { signInIfServerAnswers } from "./signInForm";
import { showSplashScreen } from "./splashScreen";
import { attachDriverToTestHook, installTestHook } from "./testHook";
import { TileSet } from "./tileSet";
import { debugOption, seedOption } from "./urlOptions";
import { WebSocketCitySource } from "./webSocketCitySource";
import { WorkerCitySource } from "./workerCitySource";

// The page's entry point: it loads the tile set, waits for the sprites, signs in where a server answers, and joins the
// city the page was opened with, or shows the splash screen

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

// The tile set the image splits into, or null when the image is not a whole tile set
function tileSetFrom(image: HTMLImageElement): Promise<TileSet | null> {
  return new Promise((resolve) => {
    const tileSet = new TileSet(image, () => resolve(tileSet), () => resolve(null));
  });
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

// The tile set from the page's tile image once it has loaded, or null when the image is not one, such as one that
// failed to load
async function loadTileSet(): Promise<TileSet | null> {
  const tiles = requiredElement("tiles", HTMLImageElement);
  await settled(tiles);

  return tileSetFrom(tiles);
}

// Starts the page: the game seed to offer first (?seed=<n>), or null to pick one at random, and the city on the server
// to join (?city=<id>), or null to choose one on the splash screen
async function start(seed: number | null, city: string | null): Promise<void> {
  const tileSet = await loadTileSet();
  if (tileSet === null) {
    // XXX Replace with an error dialog
    alert("Failed to load tileset!");
    return;
  }

  const sprites = requiredElement("sprites", HTMLImageElement);
  await settled(sprites);
  requiredElement("loadingBanner").style.display = "none";

  // Sign in first when a server answers. The game starts whatever happens, single-player when it must.
  const cityClient = new CityClient(browserCityEnvironment());
  showOnlineList(requiredElement("onlineList"), cityClient);
  try {
    await signInIfServerAnswers(cityClient);
  } catch (error) {
    console.error("Signing in failed", error);
  }

  // The only way the client reaches the city, and the client's copy of it, which follows the source from the start.
  // The city runs on the server when it welcomes the player, and otherwise in a Web Worker, off the page's thread.
  const online = await cityClient.welcomed();
  const webSocketSource = online ? new WebSocketCitySource(cityClient, (error) => leaveLostCity(error, window)) : null;
  const source: CitySource = webSocketSource ??
    new WorkerCitySource(new Worker(new URL("./cityWorker.ts", import.meta.url)), ClientConfig.debug);
  const state = new CityState(source);

  // The end-to-end runner drives the game through this, once there is a source to drive
  if (ClientConfig.debug) {
    installTestHook();
    attachDriverToTestHook(source.driver);
  }

  const parts = {source, state, tileSet, spriteSheet: sprites};
  if (city !== null && await joinLinkedCity(city, webSocketSource, (started) => new Game(parts, started), window)) {
    return;
  }

  showSplashScreen(parts, seed);
}

ClientConfig.debug = debugOption(window.location.search);

void start(pageSeed(), linkedCity(window));
