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

import type { ServiceAmounts } from "./yearEndBudget";

// A funding percentage (0 to 1) as the original's budget window shows it on a slider: (int)(percent * 100),
// multiplied in float
export function wholePercent(percent: number): number {
  return Math.floor(Math.fround(Math.fround(percent) * 100));
}

// The funding the budget window holds while it is open: the whole percent of each slider the player moved. A service
// whose slider hasn't moved keeps the percentage the budget has, and OK sends only the sliders moved, which the budget
// funds as the original's slider handler does.
//
// This keeps the fraction of a percentage the budget scaled back to the cash it had, where the original loses it: its
// window, on drawing a slider at a whole percent other than the slider's last position, sets the slider, and setting a
// slider stores its whole percent back. Opening a window never changes the city here, so that is not ported.
export class FundingChoice {
  private readonly chosen: Partial<ServiceAmounts> = {};

  // The player moved a service's slider to a whole percent
  choose(service: keyof ServiceAmounts, wholePercent: number): void {
    this.chosen[service] = wholePercent;
  }

  // The whole percents of the sliders the player moved
  changes(): Partial<ServiceAmounts> {
    return { ...this.chosen };
  }
}
