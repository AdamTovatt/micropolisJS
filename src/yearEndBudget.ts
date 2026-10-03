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

// How the year-end budget pays for road, fire and police services. Budget charges through these
// functions, and forecasts with forecastYear.

export interface ServiceAmounts {
  road: number;
  fire: number;
  police: number;
}

export interface YearForecast {
  // What each service costs at its funding fraction, before the cash runs out
  requested: ServiceAmounts;
  fundsChange: number;
  fundsAfterYear: number;
}

// The cost of one service when funded at a fraction (0 to 1) of its full maintenance cost.
export function serviceSpend(maintenance: number, fraction: number): number {
  return Math.round(maintenance * fraction);
}

export function nothingWanted(wanted: ServiceAmounts): boolean {
  return wanted.road + wanted.fire + wanted.police === 0;
}

// Pays the services out of the cash available, roads first, then fire, then police. A service
// the cash can't cover gets whatever is left.
//
// When nothing is wanted, each service costs $1, whatever the cash. That is a divergence of this
// port from the original: budget.cpp charges nothing in that case.
export function payServices(cash: number, wanted: ServiceAmounts): ServiceAmounts {
  if (nothingWanted(wanted))
    return { road: 1, fire: 1, police: 1 };

  const road = Math.min(cash, wanted.road);
  cash -= road;
  const fire = Math.min(cash, wanted.fire);
  cash -= fire;
  const police = Math.min(cash, wanted.police);

  return { road, fire, police };
}

// The year-end budget applied to the given funds, taxes and maintenance costs, with each service
// funded at the given fraction: the taxes come in, the services are paid, and funds never fall
// below zero.
export function forecastYear(funds: number, taxes: number, maintenance: ServiceAmounts,
                             fractions: ServiceAmounts): YearForecast {
  const requested = {
    road: serviceSpend(maintenance.road, fractions.road),
    fire: serviceSpend(maintenance.fire, fractions.fire),
    police: serviceSpend(maintenance.police, fractions.police)
  };
  const paid = payServices(funds + taxes, requested);
  const fundsAfterYear = Math.max(0, funds + taxes - (paid.road + paid.fire + paid.police));

  return { requested, fundsChange: fundsAfterYear - funds, fundsAfterYear };
}
