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

import { CAR_SHARE_STEPS, type CarShareStep } from "./carShare";
import { isChecked, requiredElement } from "./domElements";
import { type SettingsRecord, SPEEDS } from "./protocol";
import { ClosableWindow } from "./windowBase";

// The settings the client keeps, which the window shows beside the city's: the auto-bulldoze preference, the share of
// the trips that become cars, a step of CAR_SHARE_STEPS, and the seed
export interface ClientSettings {
  autoBulldoze: boolean;
  carShare: CarShareStep;
  seed: number;
}

// What the player chose with OK: every setting the window offers, the speed one of SPEEDS, paused included, and the
// share of the trips that become cars a step of CAR_SHARE_STEPS. The game sends the city's settings the player changed
// as commands, and keeps the others.
export interface SettingsChoice {
  autoBudget: boolean;
  autoBulldoze: boolean;
  carShare: CarShareStep;
  speed: number;
  disasters: boolean;
}

// The radio button of each speed the city can be set to, paused included, as the pause button shows it
export const SPEED_RADIOS: {speed: number, id: string}[] = [
  {speed: SPEEDS.paused, id: "speedPaused"},
  {speed: SPEEDS.slow, id: "speedSlow"},
  {speed: SPEEDS.medium, id: "speedMed"},
  {speed: SPEEDS.fast, id: "speedFast"},
];

// The radio button of the speed
export function speedRadioID(speed: number): string {
  const radio = SPEED_RADIOS.find((each) => each.speed === speed);
  if (radio === undefined) {
    throw new Error(`The settings window has no radio button for the speed ${speed}`);
  }

  return radio.id;
}

// The city's settings and the client's. It closes with the player's choice, or null when cancelled.
export class SettingsWindow extends ClosableWindow<[SettingsRecord, ClientSettings], SettingsChoice | null> {
  // The Cars slider, a step of CAR_SHARE_STEPS a notch, and the name of the step it is at
  private readonly carShare = requiredElement("carShare", HTMLInputElement);
  private readonly carShareName = requiredElement("carShareName");

  constructor(opacityLayerID: string, windowID: string) {
    super(opacityLayerID, windowID, null);

    this.closeOnClick("settingsCancel");

    this.carShare.max = `${CAR_SHARE_STEPS.length - 1}`;
    this.carShare.addEventListener("input", () => this.nameCarShare());

    requiredElement("settingsForm", HTMLFormElement).addEventListener("submit", (event) => {
      event.preventDefault();
      this.closeWith({
        autoBudget: isChecked("autoBudgetYes"),
        autoBulldoze: isChecked("autoBulldozeYes"),
        carShare: this.carShareStep(),
        speed: checkedSpeed(),
        disasters: isChecked("disastersYes"),
      });
    });
  }

  protected fill(city: SettingsRecord, client: ClientSettings): void {
    checkYesOrNo("autoBudget", city.autoBudget);
    checkYesOrNo("autoBulldoze", client.autoBulldoze);
    this.carShare.value = `${CAR_SHARE_STEPS.indexOf(client.carShare)}`;
    this.nameCarShare();
    check(speedRadioID(city.speed));
    checkYesOrNo("disasters", city.disasters);
    requiredElement("settingsSeed").textContent = `${client.seed}`;
  }

  private carShareStep(): CarShareStep {
    return CAR_SHARE_STEPS[Number(this.carShare.value)];
  }

  // The step's name beside the slider, and for a screen reader, which would otherwise read the notch's number
  private nameCarShare(): void {
    const {name} = this.carShareStep();
    this.carShareName.textContent = name;
    this.carShare.setAttribute("aria-valuetext", name);
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
