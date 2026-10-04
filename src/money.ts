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

// How the game writes a sum of money and a count: in whole numbers with a comma between each group of three digits, a
// sum of money after a dollar sign, and below zero after a single minus sign. The same in every browser, whatever the
// player's locale.

export function formatMoney(amount: number): string {
  return (amount < 0 ? "-$" : "$") + groupThousands(Math.abs(amount));
}

export function formatCount(count: number): string {
  return (count < 0 ? "-" : "") + groupThousands(Math.abs(count));
}

function groupThousands(whole: number): string {
  return String(whole).replace(/\B(?=(\d{3})+$)/g, ",");
}
