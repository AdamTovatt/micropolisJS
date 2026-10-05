/* micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
 * Copyright (C) 2026 Adam Tovatt
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

// The C# rules' numbers the end-to-end specs count with, which test/vocabulary.ts holds to conformance/ruleConstants.json. The
// suite can't take them from that file as the client's tests do: Playwright loads its modules as ES modules, which
// have no __dirname to find it by, and refuses a JSON import without the attribute the type-check refuses.

// The steps in a unit of city time at medium speed, the speed of the playthrough's city
export const STEPS_PER_CITY_TIME = 48;
// The units of city time in a year
export const CITY_TIMES_PER_YEAR = 48;
// What the game charges for an airport
export const AIRPORT_COST = 10000;
// The tornado's sprite type, as the state messages number it
export const TORNADO_SPRITE = 6;
