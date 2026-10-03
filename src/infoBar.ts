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

import { requiredElement } from "./domElements";
import type { BudgetRecord, DateMessage, EvaluationRecord } from "./protocol";
import { Text } from "./text";

// TODO L20N

// The city's date, the month from 0 and the year
export type CityDate = Omit<DateMessage, "type">;

// The figures the info bar shows, each written into an element of its own
type InfoBarField = "classification" | "population" | "score" | "funds" | "date" | "name";

// The element the info bar writes each figure into
export type InfoBarElements = Record<InfoBarField, {textContent: string | null}>;

const ELEMENT_IDS: Record<InfoBarField, string> = {
  classification: "cclass",
  population: "population",
  score: "score",
  funds: "funds",
  date: "date",
  name: "name",
};

export function dateText(date: CityDate): string {
  return [Text.months[date.month], date.year].join(" ");
}

// Shows the city's name, and the date, evaluation and funds the city source sends
export class InfoBar {
  constructor(private readonly elements: InfoBarElements, name: string) {
    elements.name.textContent = name;
  }

  showDate(date: CityDate): void {
    this.elements.date.textContent = dateText(date);
  }

  showEvaluation(evaluation: Pick<EvaluationRecord, "cityClass" | "population" | "score">): void {
    this.elements.classification.textContent = evaluation.cityClass;
    this.elements.population.textContent = String(evaluation.population);
    this.elements.score.textContent = String(evaluation.score);
  }

  showBudget(budget: Pick<BudgetRecord, "funds">): void {
    this.elements.funds.textContent = String(budget.funds);
  }
}

// The info bar in the page's elements
export function placeInfoBar(name: string): InfoBar {
  const elements = {
    classification: requiredElement(ELEMENT_IDS.classification),
    population: requiredElement(ELEMENT_IDS.population),
    score: requiredElement(ELEMENT_IDS.score),
    funds: requiredElement(ELEMENT_IDS.funds),
    date: requiredElement(ELEMENT_IDS.date),
    name: requiredElement(ELEMENT_IDS.name),
  };

  return new InfoBar(elements, name);
}
