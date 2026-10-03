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

import { type CityClass, MAX_RANKED_PROBLEMS, type EvaluationRecord, type ScoreEntry } from "./protocol";

// The evaluation as evaluation.js keeps it. It is JavaScript, so its reader declares the shape, as cityStatus.ts does
// for the census and budget.
export interface EvaluationSource {
  cityYes: number;
  cityPop: number;
  cityPopDelta: number;
  cityAssessedValue: number;
  cityClass: CityClass;
  cityScore: number;
  cityScoreDelta: number;
  cityScoreBreakdown: ScoreEntry[];
  // The problem in each place the public ranks, or null where too few problems got a vote, as before the first
  // evaluation
  getProblemNumber(place: number): number | null;
}

// Builds the record field by field in the protocol's order, sharing nothing with the evaluation
export function evaluationRecord(evaluation: EvaluationSource, level: number): EvaluationRecord {
  const problems: number[] = [];
  for (let place = 0; place < MAX_RANKED_PROBLEMS; place++) {
    const problem = evaluation.getProblemNumber(place);
    if (problem !== null) {
      problems.push(problem);
    }
  }

  return {
    type: "evaluation",
    approval: evaluation.cityYes,
    problems,
    population: evaluation.cityPop,
    migration: evaluation.cityPopDelta,
    assessedValue: evaluation.cityAssessedValue,
    cityClass: evaluation.cityClass,
    level,
    score: evaluation.cityScore,
    scoreDelta: evaluation.cityScoreDelta,
    scoreBreakdown: evaluation.cityScoreBreakdown.map(({reason, points}) => ({reason, points})),
  };
}
