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

// A very thin wrapper around localStorage, in case we wish to move to some other storage mechanism
// (such as indexedDB) in the future. The page keeps the saved game as the text the city source gave it, and hands the
// text back to the source to load, without reading it: what a save holds, and how an old one migrates, is the
// simulation's (savedGame.ts).

const KEY = "micropolisJSGame";
const canStore = window.localStorage !== undefined;

// The saved game's text, or null when none is saved
function getSavedText(): string | null {
  return window.localStorage.getItem(KEY);
}

function saveText(text: string): void {
  window.localStorage.setItem(KEY, text);
}

export const Storage = {
  KEY,
  canStore,
  getSavedText,
  saveText,
} as const;
