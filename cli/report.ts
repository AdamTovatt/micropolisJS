/* micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
 * Copyright (C) 2026 Adam Tovatt
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

import type { MessageOf } from "../src/cityState";
import {
  BudgetForecastAnswer, CITY_PROBLEMS, CommandResult, PlayerInfo, SERVICES, SPEEDS, TileReportAnswer,
} from "../src/protocol";
import { Text } from "../src/text";

// What the command line prints of the city, from the state messages and query answers the server sends, in the words
// the game's windows use

// What a city that has started has sent of itself
export interface CityFigures {
  date: MessageOf<"date">;
  population: MessageOf<"population">;
  budget: MessageOf<"budget">;
  evaluation: MessageOf<"evaluation">;
  settings: MessageOf<"settings">;
  status: MessageOf<"status"> | null;
  demand: MessageOf<"demand"> | null;
}

const SPEED_NAMES = Object.fromEntries(Object.entries(SPEEDS).map(([name, speed]) => [speed, name]));

export function statusText(name: string, figures: CityFigures, players: readonly PlayerInfo[]): string {
  const {date, population, budget, evaluation, settings, status, demand} = figures;
  const lines = [
    `${name}, ${Text.months[date.month]} ${date.year}`,
    `Population ${population.population}, ${Text.cityClass[evaluation.cityClass]}`,
    `Funds $${budget.funds}, tax ${budget.taxRate}%`,
    `Speed ${SPEED_NAMES[settings.speed] ?? settings.speed}, auto-budget ${onOff(settings.autoBudget)}, ` +
      `disasters ${onOff(settings.disasters)}`,
  ];

  if (demand !== null) {
    lines.push(`Demand: residential ${demand.residential}, commercial ${demand.commercial}, ` +
      `industrial ${demand.industrial}`);
  }

  if (status !== null) {
    lines.push(`Power ${status.powerLoad} of ${status.powerCapacity}`);
    const caps = [
      status.residentialCapped ? Text.statusPanel.residentialCapTitle : null,
      status.commercialCapped ? Text.statusPanel.commercialCapTitle : null,
      status.industrialCapped ? Text.statusPanel.industrialCapTitle : null,
    ].filter((cap) => cap !== null);
    caps.forEach((cap) => lines.push(cap));
    status.conditions.forEach((condition) => lines.push(`- ${Text.messages[condition]?.text ?? condition}`));
  }

  const problems = evaluation.problems.map((index) => Text.problems[CITY_PROBLEMS[index]]);
  lines.push(`Score ${evaluation.score} (${signed(evaluation.scoreDelta)}), approval ${evaluation.approval}%, ` +
    `migration ${signed(evaluation.migration)}`);
  lines.push(`Worst problems: ${problems.length === 0 ? "none" : problems.join(", ")}`);
  lines.push(`Online: ${players.map(({name}) => name).join(", ")}`);
  return lines.join("\n");
}

export function budgetText(forecast: BudgetForecastAnswer): string {
  const {budget} = forecast;
  const lines = [`Funds $${budget.funds}, tax ${budget.taxRate}%, last collected $${budget.taxesCollected}`];

  SERVICES.forEach((service) => {
    const funding = Math.round(budget.funding[service] * 1000) / 10;
    lines.push(`${service}: ${funding}% of $${budget.maintenance[service]} = $${forecast.costs[service]}`);
  });

  lines.push(`If the year ended now: taxes $${forecast.taxes}, change ${signed(forecast.fundsChange)}, ` +
    `funds $${forecast.fundsAfterYear}`);
  return lines.join("\n");
}

export function tileReportText(report: TileReportAnswer): string {
  return [
    `(${report.x}, ${report.y}): ${Text.zoneCategories[report.category]}, tile ${report.tile}` +
      `${report.zoneCentre ? ", a zone's centre" : ""}, ${report.powered ? "powered" : "unpowered"}`,
    `Population density ${report.populationDensity}, land value ${report.landValue}, crime ${report.crime}, ` +
      `pollution ${report.pollution}, rate of growth ${report.rateOfGrowth}`,
    `Traffic ${report.trafficDensity}, police cover ${report.policeCoverage}, fire cover ${report.fireCoverage}, ` +
      `terrain ${report.terrainDensity}, city centre score ${report.cityCentreScore}`,
  ].join("\n");
}

// What came of a command, as the game tells the player who sent it
export function resultText(result: CommandResult): string {
  if (result.outcome === "ok") {
    return "ok";
  }

  // The game leaves a failed tile unsaid, since a drag often starts on a tile already built (toolToast.ts)
  const words = result.outcome === "failed"
    ? "failed at a tile, such as one already built"
    : Text.toolFailures[result.outcome];
  return result.reason === null ? words : `${words}: ${result.reason}`;
}

function onOff(on: boolean): string {
  return on ? "on" : "off";
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}
