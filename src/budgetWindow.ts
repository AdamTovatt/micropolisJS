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
import { percentLabel, wholePercent } from "./fundingDisplay";
import { BUDGET_WINDOW_CLOSED } from "./uiMessages";
import { formatMoney } from "./money";
import { type BudgetForecastAnswer, type BudgetRecord, type Query, SERVICES, type ServiceAmounts } from "./protocol";
import type { QuerySource } from "./querySource";
import { ClosableWindow } from "./windowBase";

// The whole percent of each service whose slider the player moved
export type MovedFunding = Partial<ServiceAmounts>;

// What the player chose with OK: the funding of each slider moved, and the tax rate in percent
export interface BudgetChoice {
  funding: MovedFunding;
  tax: number;
}

// What the window shows for a forecast: the figures above the sliders, and each service's label
export interface BudgetView {
  taxes: string;
  funds: string;
  cashFlow: string;
  fundsAfterYear: string;
  labels: Record<keyof ServiceAmounts, string>;
}

// Every decision about what the window shows is made here and in BudgetForecasts, so it is tested under node. The
// window only reads the sliders and writes the view into the DOM.

// The forecast of the year end at the funding the player has moved the sliders to, and the tax rate the tax slider is at
export function forecastQuery(funding: MovedFunding, tax: number): Query {
  return {type: "budgetForecast", ...funding, tax};
}

// The whole percent each slider is drawn at, as the original's budget window draws it (see wholePercent)
export function sliderPositions(record: BudgetRecord): ServiceAmounts {
  return {
    road: wholePercent(record.funding.road), fire: wholePercent(record.funding.fire),
    police: wholePercent(record.funding.police),
  };
}

// What the window shows for a forecast at the funding moved, every figure from the one answer: each service's cost at
// its funding, and the taxes, cash flow and year-end balance the budget forecasts for that funding and tax rate. A
// service whose slider hasn't moved shows the funding it has, fraction included.
export function budgetView(funding: MovedFunding, forecast: BudgetForecastAnswer): BudgetView {
  const budget = forecast.budget;
  const label = (service: keyof ServiceAmounts) => {
    const moved = funding[service];
    const percent = moved !== undefined ? `${moved}` : percentLabel(budget.funding[service]);
    return `${percent}% of ${formatMoney(budget.maintenance[service])} = ${formatMoney(forecast.costs[service])}`;
  };

  return {
    taxes: formatMoney(forecast.taxes),
    funds: formatMoney(budget.funds),
    cashFlow: formatMoney(forecast.fundsChange),
    fundsAfterYear: formatMoney(forecast.fundsAfterYear),
    labels: {road: label("road"), fire: label("fire"), police: label("police")},
  };
}

export function taxLabel(tax: number): string {
  return `Tax rate: ${tax}%`;
}

// Asks for the forecast at the funding and tax rate the sliders are moved to, and shows the view of each answer still
// wanted: an answer to a forecast asked before the last, or before the answers were dropped, arrives too late and is
// dropped. The window only asks for funding and tax rates the sliders can set, which the simulation forecasts, so any
// answer but a forecast is a defect.
export class BudgetForecasts {
  private asked = 0;

  constructor(private readonly source: QuerySource, private readonly show: (view: BudgetView) => void) {}

  forecast(funding: MovedFunding, tax: number): void {
    const moved = {...funding};
    const asked = ++this.asked;

    this.source.ask(forecastQuery(moved, tax), (answer) => {
      if (answer.type !== "budgetForecast") {
        throw new Error(`The budget forecast was answered with ${JSON.stringify(answer)}`);
      }

      if (asked === this.asked) {
        this.show(budgetView(moved, answer));
      }
    });
  }

  // Drops the answers still to come, as the window does when it closes
  drop(): void {
    this.asked++;
  }
}

// The budget: the funding of each service and the tax rate, with the year end they forecast. Closing emits the player's
// choice, or null when cancelled.
//
// It draws each slider at the whole percent of the funding the budget has, and starts the window's funding with no
// changes. The funding holds the whole percent of each slider the player moves, and OK sends only those, which the
// budget funds as the original's slider handlers do. A service whose slider hasn't moved keeps its funding, with the
// fraction of a percent the original's window loses on drawing it (see Budget.doBudgetNow).
export class BudgetWindow extends ClosableWindow {
  private record: BudgetRecord | null = null;
  private funding: MovedFunding = {};
  private readonly forecasts: BudgetForecasts;

  constructor(opacityLayerID: string, windowID: string, source: QuerySource) {
    super(opacityLayerID, windowID, BUDGET_WINDOW_CLOSED);
    this.forecasts = new BudgetForecasts(source, render);

    this.closeOnClick("budgetCancel");

    requiredElement("budgetReset").addEventListener("click", (event) => {
      event.preventDefault();
      this.reset();
    });

    requiredElement("budgetForm", HTMLFormElement).addEventListener("submit", (event) => {
      event.preventDefault();
      this.close({funding: this.funding, tax: sliderValue("taxRate")});
    });

    for (const service of SERVICES) {
      requiredElement(`${service}Rate`).addEventListener("input", () => {
        this.funding[service] = sliderValue(`${service}Rate`);
        this.forecast();
      });
    }

    requiredElement("taxRate").addEventListener("input", () => {
      showTax();
      this.forecast();
    });
  }

  // The record places the sliders, and the forecasts give every figure the window shows
  open(record: BudgetRecord): void {
    this.record = record;
    this.reset();
    this._toggleDisplay();
  }

  close(choice: BudgetChoice | null = null): void {
    this.forecasts.drop();
    super.close(choice);
  }

  // Draws the sliders at the record's funding and tax rate, with no changes
  private reset(): void {
    const record = this.shownRecord();
    this.funding = {};

    const positions = sliderPositions(record);
    for (const service of SERVICES) {
      requiredElement(`${service}Rate`, HTMLInputElement).value = `${positions[service]}`;
    }
    requiredElement("taxRate", HTMLInputElement).value = `${record.taxRate}`;

    showTax();
    this.forecast();
  }

  // Asks for the forecast at the sliders' funding and tax rate
  private forecast(): void {
    this.forecasts.forecast(this.funding, sliderValue("taxRate"));
  }

  private shownRecord(): BudgetRecord {
    if (this.record === null) {
      throw new Error("The budget window has no budget before it opens");
    }

    return this.record;
  }
}

function render(view: BudgetView): void {
  setText("taxesCollected", view.taxes);
  setText("fundsNow", view.funds);
  setText("cashFlow", view.cashFlow);
  setText("fundsAfterYear", view.fundsAfterYear);

  for (const service of SERVICES) {
    setText(`${service}RateLabel`, view.labels[service]);
  }
}

function showTax(): void {
  setText("taxRateLabel", taxLabel(sliderValue("taxRate")));
}

function sliderValue(id: string): number {
  return Number(requiredElement(id, HTMLInputElement).value);
}

function setText(id: string, text: string): void {
  requiredElement(id).textContent = text;
}
