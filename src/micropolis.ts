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
import { Config } from "./config.js";
import { requiredElement } from "./domElements";
import { showOnlineList } from "./onlineList";
import { signInIfServerAnswers } from "./signInForm";
import { showSplashScreen } from "./splashScreen";
import { installTestHook } from "./testHook";
import { TileSet } from "./tileSet";
import { TileSetURI } from "./tileSetURI";
import { debugOption, seedOption } from "./urlOptions";

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

// The tile set the image splits into, or null when the image is not a whole tile set, such as one still loading
function tileSetFrom(image: HTMLImageElement): Promise<TileSet | null> {
  return new Promise((resolve) => {
    const tileSet = new TileSet(image, () => resolve(tileSet), () => resolve(null));
  });
}

// The image at the URI, or null when it fails to load
function imageFrom(uri: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = uri;
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

// The tile set from the page's tile image, or null when there is none. We might be running locally in Chrome, which
// handles the security context of file URIs differently, which makes things go awry when we try to create an image from
// a "tainted" canvas (one we've painted on), so where the image makes no tile set we try the copy of it in TileSetURI.
async function loadTileSet(): Promise<TileSet | null> {
  const tileSet = await tileSetFrom(requiredElement("tiles", HTMLImageElement));
  if (tileSet !== null) {
    return tileSet;
  }

  const fallbackImage = await imageFrom(TileSetURI);
  return fallbackImage === null ? null : tileSetFrom(fallbackImage);
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

  showSplashScreen(tileSet, sprites, seed);
}

Config.debug = debugOption(window.location.search);
const seed = pageSeed();

// The end-to-end runner drives the game through this
if (Config.debug) {
  installTestHook();
}

void start(seed);
