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

// ?city=<id> names a city on the server, which cityLink.ts follows

// The id a city on the server has, as the server writes one: 32 lower-case hexadecimal digits
const CITY_ID = /^[0-9a-f]{32}$/;

// The city a URL's query string asks to join, or null for none. A value that isn't a city's id is refused.
function cityOption(query: string): string | null {
  const value = new URLSearchParams(query).get("city");

  if (value === null) {
    return null;
  }

  if (!CITY_ID.test(value)) {
    throw new Error(`?city must be a city's id, 32 hexadecimal digits, got "${value}"`);
  }

  return value;
}

// The URL with the city's id as its ?city, in place of any it had, and its other options as they were
function withCityOption(url: string, city: string): string {
  const withCity = new URL(url);
  withCity.searchParams.set("city", city);
  return withCity.toString();
}

// The URL without its ?city, and its other options as they were
function withoutCityOption(url: string): string {
  const withoutCity = new URL(url);
  withoutCity.searchParams.delete("city");
  return withoutCity.toString();
}

export { CITY_ID, cityOption, debugOption, seedOption, withCityOption, withoutCityOption };
