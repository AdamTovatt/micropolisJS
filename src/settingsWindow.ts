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

import { isChecked, requiredElement } from "./domElements";
import { SETTINGS_WINDOW_CLOSED } from "./messages";
import { type SettingsRecord, SPEEDS } from "./protocol";
import { ClosableWindow } from "./windowBase";

// The settings the client keeps, which the window shows beside the city's: the auto-bulldoze preference, the seed, and
// the speed Play resumes the city at while it is paused
export interface ClientSettings {
  autoBulldoze: boolean;
  seed: number;
  resumeSpeed: number;
}

// What the player chose with OK: every setting the window offers. The game sends the city's settings the player
// changed as commands, and keeps the others.
export interface SettingsChoice {
  autoBudget: boolean;
  autoBulldoze: boolean;
  speed: number;
  disasters: boolean;
}

// The radio button of each speed the city runs at
export const SPEED_RADIOS: {speed: number, id: string}[] = [
  {speed: SPEEDS.slow, id: "speedSlow"},
  {speed: SPEEDS.medium, id: "speedMed"},
  {speed: SPEEDS.fast, id: "speedFast"},
];

// The speed the window shows: the speed the city runs at, or while it is paused, the speed Play resumes it at. Tested
// under node; the window only writes it into the DOM.
export function shownSpeed(city: SettingsRecord, client: ClientSettings): number {
  return city.speed === SPEEDS.paused ? client.resumeSpeed : city.speed;
}

// The radio button of the speed
export function speedRadioID(speed: number): string {
  const radio = SPEED_RADIOS.find((each) => each.speed === speed);
  if (radio === undefined) {
    throw new Error(`The settings window has no radio button for the speed ${speed}`);
  }

  return radio.id;
}

// The city's settings and the client's. Closing emits the player's choice, or null when cancelled.
export class SettingsWindow extends ClosableWindow {
  constructor(opacityLayerID: string, windowID: string) {
    super(opacityLayerID, windowID, SETTINGS_WINDOW_CLOSED);

    this.closeOnClick("settingsCancel");

    requiredElement("settingsForm", HTMLFormElement).addEventListener("submit", (event) => {
      event.preventDefault();
      this.close({
        autoBudget: isChecked("autoBudgetYes"),
        autoBulldoze: isChecked("autoBulldozeYes"),
        speed: checkedSpeed(),
        disasters: isChecked("disastersYes"),
      });
    });
  }

  open(city: SettingsRecord, client: ClientSettings): void {
    checkYesOrNo("autoBudget", city.autoBudget);
    checkYesOrNo("autoBulldoze", client.autoBulldoze);
    check(speedRadioID(shownSpeed(city, client)));
    checkYesOrNo("disasters", city.disasters);
    requiredElement("settingsSeed").textContent = `${client.seed}`;

    this._toggleDisplay();
  }

  close(choice: SettingsChoice | null = null): void {
    super.close(choice);
  }
}

// Checks #<name>Yes or #<name>No
function checkYesOrNo(name: string, yes: boolean): void {
  check(`${name}${yes ? "Yes" : "No"}`);
}

function check(id: string): void {
  requiredElement(id, HTMLInputElement).checked = true;
}

function checkedSpeed(): number {
  const radio = SPEED_RADIOS.find(({id}) => isChecked(id));
  if (radio === undefined) {
    throw new Error("The settings window has no speed checked");
  }

  return radio.speed;
}
