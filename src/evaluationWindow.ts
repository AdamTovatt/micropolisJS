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

import { requiredElement } from "./domElements";
import { formatCount, formatMoney } from "./money";
import { CITY_PROBLEMS, type EvaluationRecord, GAME_LEVELS, MAX_RANKED_PROBLEMS } from "./protocol";
import { scoreBreakdownRows, signedPoints, type ScoreRow } from "./scoreBreakdownView";
import { Text } from "./text";
import { ClosableWindow } from "./windowBase";

// What the window shows for one evaluation record: its text, field by field
export interface EvaluationView {
  yes: string;
  no: string;
  problems: string[];
  population: string;
  migration: string;
  assessedValue: string;
  level: string;
  cityClass: string;
  score: string;
  scoreDelta: string;
  scoreBreakdown: ScoreRow[];
}

// Every decision about what the window shows is made here, so it is tested under node. The window only writes the
// view into the DOM. A code without text is a defect the tests catch, so there is no fallback.
export function evaluationView(record: EvaluationRecord): EvaluationView {
  return {
    yes: `${record.approval}`,
    no: `${100 - record.approval}`,
    problems: record.problems.map((problem) => Text.problems[CITY_PROBLEMS[problem]]),
    population: formatCount(record.population),
    migration: formatCount(record.migration),
    assessedValue: formatMoney(record.assessedValue),
    level: Text.gameLevel[GAME_LEVELS[record.level]],
    cityClass: Text.cityClass[record.cityClass],
    score: `${record.score}`,
    scoreDelta: signedPoints(record.scoreDelta),
    scoreBreakdown: scoreBreakdownRows(record.scoreBreakdown, record.score),
  };
}

// The city's evaluation: public opinion, the statistics, and why the score changed
export class EvaluationWindow extends ClosableWindow<[EvaluationRecord], void> {
  constructor(opacityLayerID: string, windowID: string) {
    super(opacityLayerID, windowID, undefined);
    this.closeOnSubmit("evalButtons");
  }

  protected fill(record: EvaluationRecord): void {
    render(evaluationView(record));
  }
}

// The window has a place for each problem a record can list, #evalProb1 to #evalProb4
function render(view: EvaluationView): void {
  setText("evalYes", view.yes);
  setText("evalNo", view.no);

  for (let place = 0; place < MAX_RANKED_PROBLEMS; place++) {
    const item = requiredElement(`evalProb${place + 1}`);
    if (place < view.problems.length) {
      item.textContent = view.problems[place];
      item.style.display = "";
    } else {
      item.style.display = "none";
    }
  }

  setText("evalPopulation", view.population);
  setText("evalMigration", view.migration);
  setText("evalValue", view.assessedValue);
  setText("evalLevel", view.level);
  setText("evalClass", view.cityClass);
  setText("evalScore", view.score);
  setText("evalScoreDelta", view.scoreDelta);

  const rows = view.scoreBreakdown;
  const list = requiredElement("evalScoreBreakdown");
  const listed = rows.length > 0 ? "" : "none";
  requiredElement("evalScoreBreakdownHeader").style.display = listed;
  list.style.display = listed;
  list.replaceChildren(...rows.flatMap((row) => [
    breakdownElement("dt", "evalItem statisticsItem", `${row.label}:`),
    breakdownElement("dd", "elided statisticsRight evalItem evalRight", row.value),
  ]));
}

function setText(id: string, text: string): void {
  requiredElement(id).textContent = text;
}

function breakdownElement(tag: "dt" | "dd", className: string, text: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}
