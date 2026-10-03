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

import { MAX_SEED } from "./protocol";

// The options a page's URL can carry, read from its query string

// ?debug=1 turns on debug mode
function debugOption(query: string): boolean {
  return query.replace(/^\?/, "").split("&").some((param) => param.trim().toLowerCase() === "debug=1");
}

// ?seed=<n> starts on that seed's map instead of a random one, so a city can be played again from the same start

// The game seed a URL's query string asks for, or null for none. A seed that isn't a uint32 in decimal is refused.
function seedOption(query: string): number | null {
  const value = new URLSearchParams(query).get("seed");

  if (value === null) {
    return null;
  }

  if (!/^[0-9]+$/.test(value) || Number(value) > MAX_SEED) {
    throw new Error(`?seed must be a whole number from 0 to ${MAX_SEED}, got "${value}"`);
  }

  return Number(value);
}

export { debugOption, seedOption };
