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
import { CLASSIFICATION_UPDATED, DATE_UPDATED, FUNDS_CHANGED, POPULATION_UPDATED, SCORE_UPDATED } from "./messages";
import { Text } from "./text";

// TODO L20N

// The city's date, as the simulation reports it: the month from 0, and the year
export interface CityDate {
  month: number;
  year: number;
}

// What the info bar shows when the game starts
export interface InfoBarValues {
  classification: string;
  population: number;
  score: number;
  funds: number;
  date: CityDate;
  name: string;
}

// The events the info bar follows
export interface InfoSource {
  addEventListener(event: typeof CLASSIFICATION_UPDATED, listener: (classification: string) => void): void;
  addEventListener(event: typeof POPULATION_UPDATED, listener: (population: number) => void): void;
  addEventListener(event: typeof SCORE_UPDATED, listener: (score: number) => void): void;
  addEventListener(event: typeof FUNDS_CHANGED, listener: (funds: number) => void): void;
  addEventListener(event: typeof DATE_UPDATED, listener: (date: CityDate) => void): void;
}

// The element the info bar writes each figure into
export type InfoBarElements = Record<keyof InfoBarValues, {textContent: string | null}>;

const ELEMENT_IDS: Record<keyof InfoBarValues, string> = {
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

// Shows the starting values, then follows the source
export class InfoBar {
  constructor(private readonly elements: InfoBarElements, dataSource: InfoSource, initialValues: InfoBarValues) {
    elements.classification.textContent = initialValues.classification;
    elements.population.textContent = String(initialValues.population);
    elements.score.textContent = String(initialValues.score);
    elements.funds.textContent = String(initialValues.funds);
    elements.date.textContent = dateText(initialValues.date);
    elements.name.textContent = initialValues.name;

    dataSource.addEventListener(CLASSIFICATION_UPDATED, (value) => {
      this.elements.classification.textContent = value;
    });

    dataSource.addEventListener(POPULATION_UPDATED, (value) => {
      this.elements.population.textContent = String(value);
    });

    dataSource.addEventListener(SCORE_UPDATED, (value) => {
      this.elements.score.textContent = String(value);
    });

    dataSource.addEventListener(FUNDS_CHANGED, (value) => {
      this.elements.funds.textContent = String(value);
    });

    dataSource.addEventListener(DATE_UPDATED, (value) => {
      this.elements.date.textContent = dateText(value);
    });
  }
}

// The info bar in the page's elements
export function placeInfoBar(dataSource: InfoSource, initialValues: InfoBarValues): InfoBar {
  const elements = {
    classification: requiredElement(ELEMENT_IDS.classification),
    population: requiredElement(ELEMENT_IDS.population),
    score: requiredElement(ELEMENT_IDS.score),
    funds: requiredElement(ELEMENT_IDS.funds),
    date: requiredElement(ELEMENT_IDS.date),
    name: requiredElement(ELEMENT_IDS.name),
  };

  return new InfoBar(elements, dataSource, initialValues);
}
