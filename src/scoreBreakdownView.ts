/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 * Modified in Adam Tovatt's continuation of micropolisJS. Copyright (C) 2026 Adam Tovatt
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

import type { ScoreEntry } from "./protocol";
import { Text } from "./text";

// One row of the evaluation window's "Why the score changed" list
export interface ScoreRow {
  label: string;
  value: string;
}

const labels: {lastYear: string, reasons: {[reason: string]: string}} = Text.scoreBreakdown;

export function signedPoints(points: number): string {
  return points > 0 ? `+${points}` : `${points}`;
}

// Every decision about what the list shows is made here, so it is tested under node. The evaluation
// window only writes the rows into the DOM.
//
// The rows start from last year's score, then give each step's points and the score it left, ending
// at this year's score. A reason without a label is a defect the tests catch, so there is no fallback.
export function scoreBreakdownRows(breakdown: ScoreEntry[], cityScore: number): ScoreRow[] {
  if (breakdown.length === 0) {
    return [];
  }

  let score = cityScore - breakdown.reduce((total, entry) => total + entry.points, 0);
  const rows: ScoreRow[] = [{label: labels.lastYear, value: `${score}`}];

  for (const entry of breakdown) {
    score += entry.points;
    rows.push({label: labels.reasons[entry.reason], value: `${signedPoints(entry.points)} → ${score}`});
  }

  return rows;
}
