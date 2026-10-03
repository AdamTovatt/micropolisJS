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

// How the budget funds road, fire and police services: at year end, as doBudgetNow in the original's budget.cpp does;
// during the year, at the whole percent the player sets, as the original's budget slider handlers in
// micropolis-activity's w_sim.c do; and the effect
// that funding has, as its updateFundEffects does. Budget charges through fundServices, and forecasts with
// forecastYear.
//
// The original keeps each funding percentage in a float and does this arithmetic in float. Math.fround rounds to the
// nearest float, as a C# (float) cast does, so wrapping each float operand and result in it reproduces the original's
// float arithmetic exactly: a product or quotient of two floats, computed in double and then rounded to float, is the
// float result.

export interface ServiceAmounts {
  road: number;
  fire: number;
  police: number;
}

export interface Funding {
  // What each service costs at its funding percentage
  wanted: ServiceAmounts;
  // What each service gets
  paid: ServiceAmounts;
  // The funding percentages afterwards: those of the services the cash can't fully fund are scaled back to it
  percents: ServiceAmounts;
}

export interface YearForecast {
  wanted: ServiceAmounts;
  fundsChange: number;
  fundsAfterYear: number;
}

// The services in the order the budget funds them
export const SERVICES: (keyof ServiceAmounts)[] = ["road", "fire", "police"];

// What a service wants at year end at its funding percentage (0 to 1), as doBudgetNow computes it: (int)(fund *
// percent), multiplied in float
export function costAt(maintenance: number, percent: number): number {
  return Math.floor(Math.fround(Math.fround(maintenance) * Math.fround(percent)));
}

// The funding percentage (0 to 1) of a service funded at a whole percent, as the original's budget slider handlers
// (SimCmdRoadFund, SimCmdFireFund and SimCmdPoliceFund in micropolis-activity's w_sim.c) store it: percent / 100.0,
// kept in a float
export function fundingPercent(wholePercent: number): number {
  return Math.fround(wholePercent / 100);
}

// The spend booked on a service funded at a whole percent, as those slider handlers book it: (max * percent) / 100, in
// integers
export function fundingSpend(maintenance: number, wholePercent: number): number {
  return Math.floor(maintenance * wholePercent / 100);
}

// The effect a service has at a spend on it, out of its effect at full funding: (short)((float)maxEffect *
// (float)spend / (float)fund), as updateFundEffects in the original's simulate.cpp computes it, in float. The
// maintenance cost must not be 0.
export function fundEffect(maxEffect: number, spend: number, maintenance: number): number {
  return Math.floor(Math.fround(Math.fround(Math.fround(maxEffect) * Math.fround(spend)) / Math.fround(maintenance)));
}

// Funds the services from the cash there is, as doBudgetNow does. With more cash than the services want, each gets
// what it wants and the percentages stay. Otherwise roads are funded first, then fire, then police: a service is
// funded in full only while more cash is left than it wants, and the first one that isn't gets the rest of the cash,
// with its percentage scaled back to that, and every service after it gets nothing, at 0%. With no cash and nothing
// wanted, nothing is paid and every percentage goes back to 100%.
export function fundServices(cash: number, maintenance: ServiceAmounts, percents: ServiceAmounts): Funding {
  const wanted = { road: 0, fire: 0, police: 0 };
  for (const service of SERVICES)
    wanted[service] = costAt(maintenance[service], percents[service]);
  const total = wanted.road + wanted.fire + wanted.police;

  if (cash > total)
    return { wanted, paid: { ...wanted }, percents: { ...percents } };

  if (total === 0)
    return { wanted, paid: { road: 0, fire: 0, police: 0 }, percents: { road: 1, fire: 1, police: 1 } };

  const paid = { road: 0, fire: 0, police: 0 };
  const after = { ...percents };
  let left = cash;
  for (const service of SERVICES) {
    if (left > wanted[service]) {
      paid[service] = wanted[service];
      left -= wanted[service];
    } else {
      paid[service] = left;
      after[service] = left > 0 ? Math.fround(Math.fround(left) / Math.fround(maintenance[service])) : 0;
      left = 0;
    }
  }

  return { wanted, paid, percents: after };
}

// The year-end budget applied to the given funds, taxes and maintenance costs, with each service funded at the given
// percentage: the taxes come in and the services are paid from funds plus taxes.
export function forecastYear(funds: number, taxes: number, maintenance: ServiceAmounts,
                             percents: ServiceAmounts): YearForecast {
  const funding = fundServices(funds + taxes, maintenance, percents);
  const fundsChange = taxes - (funding.paid.road + funding.paid.fire + funding.paid.police);

  return { wanted: funding.wanted, fundsChange, fundsAfterYear: funds + fundsChange };
}
