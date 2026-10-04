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

import { stepsPerCityTime, stepsPerYear } from "../../src/cityTimeModel";
import { SPEEDS } from "../../src/protocol";

// The steps the tests' cities take, at the speeds they run at

// A city time at medium speed, the speed a new city starts at
export const STEPS_PER_CITY_TIME = stepsPerCityTime(SPEEDS.medium);

// A city time at fast speed, one cycle of the simulation's sixteen phases, every one of which runs at fast speed; and
// a year of them, at the speed the tests' grown cities run at
export const FAST_CYCLE = stepsPerCityTime(SPEEDS.fast);
export const CYCLES_IN_A_YEAR = 48;
export const YEAR = stepsPerYear(SPEEDS.fast);
