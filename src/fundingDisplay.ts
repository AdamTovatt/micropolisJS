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

// How the budget window shows a service's funding percentage (0 to 1).

// The whole percent the window draws a slider at, as the original's budget window does (ReallyDrawCurrPercents in
// micropolis-activity's w_budget.c): (int)(percent * 100), multiplied in float
export function wholePercent(percent: number): number {
  return Math.floor(Math.fround(Math.fround(percent) * 100));
}

// The percent a slider's label shows, to a tenth of a percent. A percentage the year end scaled back to the cash it had
// holds a fraction the slider can't, and the cost beside it is at that fraction: $94 of $300 is 31.3%, not the 31%
// the slider is drawn at.
export function percentLabel(percent: number): string {
  return String(Math.round(percent * 1000) / 10);
}
