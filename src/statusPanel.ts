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

import { appendElement, requiredElement } from "./domElements";
import type { StatusRecord } from "./protocol";
import { Text } from "./text";

export interface CapMarker {
  label: string;
  title: string;
}

// What the panel shows for one status record.
export interface StatusView {
  powerText: string;
  overloaded: boolean;
  // How full the power meter is, 0 to 100, and whether it shows at all: a city with no plants and no load has
  // nothing to measure.
  meterPercent: number;
  meterVisible: boolean;
  caps: CapMarker[];
  conditions: string[];
}

const CAPS: ReadonlyArray<{isCapped: (status: StatusRecord) => boolean, label: string, title: string}> = [
  {isCapped: (status) => status.residentialCapped, label: Text.statusPanel.residentialCap,
   title: Text.statusPanel.residentialCapTitle},
  {isCapped: (status) => status.commercialCapped, label: Text.statusPanel.commercialCap,
   title: Text.statusPanel.commercialCapTitle},
  {isCapped: (status) => status.industrialCapped, label: Text.statusPanel.industrialCap,
   title: Text.statusPanel.industrialCapTitle},
];

// Every decision about what the panel shows is made here, so it is tested under node. StatusPanel only writes
// the view into the DOM, and is left untested: testing it would need a DOM environment for Jest.
export function statusView(status: StatusRecord): StatusView {
  const overloaded = status.powerLoad > status.powerCapacity;
  const fraction = status.powerCapacity > 0 ? Math.min(status.powerLoad / status.powerCapacity, 1) : 1;

  return {
    caps: CAPS.filter((cap) => cap.isCapped(status)).map(({label, title}) => ({label, title})),
    conditions: status.conditions.map((condition) => Text.messages[condition].text),
    meterPercent: Math.round(fraction * 100),
    meterVisible: status.powerLoad > 0 || status.powerCapacity > 0,
    overloaded,
    powerText: `${status.powerLoad} / ${status.powerCapacity}`,
  };
}

// Shows the conditions that limit the city's growth while they hold: power load against capacity, the demand
// caps, and the advisor's active warnings. It renders only the status record the simulation publishes.
export class StatusPanel {
  private readonly powerText: HTMLElement;
  private readonly powerMeterFill: HTMLElement;
  private readonly capsRow: HTMLElement;
  private readonly capsList: HTMLElement;
  private readonly conditionsList: HTMLElement;

  constructor(elementId: string) {
    const container = requiredElement(elementId);

    const powerRow = appendElement(container, "div", "statusRow");
    appendElement(powerRow, "span", "statusLabel").textContent = Text.statusPanel.powerLabel;
    this.powerText = appendElement(powerRow, "span");
    this.powerText.textContent = Text.statusPanel.powerUnknown;
    const powerMeter = appendElement(container, "div", "statusMeter");
    this.powerMeterFill = appendElement(powerMeter, "div", "statusMeterFill");

    this.capsRow = appendElement(container, "div", "statusRow");
    appendElement(this.capsRow, "span", "statusLabel").textContent = Text.statusPanel.capsLabel;
    this.capsList = appendElement(this.capsRow, "span");
    this.capsRow.style.display = "none";

    this.conditionsList = appendElement(container, "ul", "statusConditions");
  }

  // Shows each status record as it comes
  show(status: StatusRecord): void {
    this.render(statusView(status));
  }

  private render(view: StatusView): void {
    this.powerText.textContent = view.powerText;
    this.powerText.classList.toggle("statusBad", view.overloaded);
    this.powerMeterFill.style.width = `${view.meterPercent}%`;
    this.powerMeterFill.classList.toggle("statusMeterOver", view.overloaded);
    this.powerMeterFill.style.visibility = view.meterVisible ? "visible" : "hidden";

    this.capsList.replaceChildren(...view.caps.map((cap) => {
      const marker = document.createElement("span");
      marker.className = "statusCap";
      marker.textContent = cap.label;
      marker.title = cap.title;
      return marker;
    }));
    this.capsRow.style.display = view.caps.length > 0 ? "" : "none";

    this.conditionsList.replaceChildren(...view.conditions.map((condition) => {
      const item = document.createElement("li");
      item.textContent = condition;
      return item;
    }));
  }
}
