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

// The funding the budget window holds while it is open. A service's percentage stays the one the budget has until the
// player moves its slider, and OK sends only the percentages of the sliders moved.
//
// This keeps the fraction of a percentage the budget scaled back to the cash it had, where the original loses it: its
// window, on drawing a slider at a whole percent other than the slider's last position, sets the slider, and setting a
// slider stores its whole percent back. Opening a window never changes the city here, so that is not ported.
export class FundingChoice {
  private readonly chosen: Partial<ServiceAmounts> = {};

  constructor(private readonly held: ServiceAmounts) {}

  // The player moved a service's slider to a whole percent. The original stores percent / 100.0 in a float.
  choose(service: keyof ServiceAmounts, wholePercent: number): void {
    this.chosen[service] = Math.fround(wholePercent / 100);
  }

  // Each service's percentage (0 to 1): the one chosen, or else the one the budget has
  percents(): ServiceAmounts {
    return { ...this.held, ...this.chosen };
  }

  // The percentages (0 to 1) of the services whose sliders the player moved
  changes(): Partial<ServiceAmounts> {
    return { ...this.chosen };
  }
}
