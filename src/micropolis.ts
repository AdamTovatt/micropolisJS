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
import type { CitySource } from "./citySource";
import { CityState } from "./cityState";
import { Config } from "./config.js";
import { requiredElement } from "./domElements";
import { showOnlineList } from "./onlineList";
import { signInIfServerAnswers } from "./signInForm";
import { showSplashScreen } from "./splashScreen";
import { attachDriverToTestHook, installTestHook } from "./testHook";
import { TileSet } from "./tileSet";
import { debugOption, seedOption } from "./urlOptions";
import { WorkerCitySource } from "./workerCitySource";

// The page's entry point: it loads the tile set, waits for the sprites, signs in where a server answers, and shows the
// splash screen

// The game seed the page was opened with (?seed=<n>), or null to pick one at random. A seed the player can't have meant
// is refused out loud, and the map is picked at random as usual.
function pageSeed(): number | null {
  try {
    return seedOption(window.location.search);
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e));
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

async function start(seed: number | null): Promise<void> {
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

  showSplashScreen({source, state, tileSet, spriteSheet: sprites}, seed);
}

Config.debug = debugOption(window.location.search);
const seed = pageSeed();

// The end-to-end runner drives the game through this
if (Config.debug) {
  installTestHook();
}

// The city runs in a Web Worker, off the page's thread. What goes wrong there outside a call, such as in the loop that
// steps the city, goes wrong in the page too, so it is never silent. The page reports it only as this throw, which
// names the worker; the worker reports it in its own scope too. A worker's script that fails to load fires a plain
// event, with no message of its own.
const worker = new Worker(new URL("./cityWorker.ts", import.meta.url));
worker.addEventListener("error", (event) => {
  event.preventDefault();
  const reason = event instanceof ErrorEvent ? event.message : "its script didn't load";
  throw new Error(`The city's worker failed: ${reason}`);
});

// The only way the client reaches the city, and the client's copy of it, which follows the source from the start
const source: CitySource = new WorkerCitySource(worker, Config.debug);
const state = new CityState(source);
attachDriverToTestHook(source.driver);

void start(seed);
