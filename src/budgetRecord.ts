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

import type { BudgetRecord, ServiceAmounts } from "./protocol";

// The budget as budget.js keeps it. It is JavaScript, so its reader declares the shape, as evaluationRecord.ts does for
// the evaluation.
export interface BudgetSource {
  cityTax: number;
  taxFund: number;
  totalFunds: number;
  maintenance(): ServiceAmounts;
  percents(): ServiceAmounts;
}

// Builds the record field by field in the protocol's order, sharing nothing with the budget
export function budgetRecord(budget: BudgetSource): BudgetRecord {
  return {
    type: "budget",
    taxRate: budget.cityTax,
    taxesCollected: budget.taxFund,
    funds: budget.totalFunds,
    maintenance: serviceAmounts(budget.maintenance()),
    funding: serviceAmounts(budget.percents()),
  };
}

function serviceAmounts({road, fire, police}: ServiceAmounts): ServiceAmounts {
  return {road, fire, police};
}
