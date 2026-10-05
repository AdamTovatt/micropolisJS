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

import { PageStore, StoredText } from "./storage";

export const CAR_SHARE_KEY = "micropolisJSCarShare";

// A step of the Cars slider, the share of the trips the city sends that become cars: what the slider says of it, and
// every how many trips one becomes a car, or null for none
export interface CarShareStep {
  readonly name: string;
  readonly every: number | null;
}

// The Cars slider's steps, from none of the trips to all of them
export const CAR_SHARE_STEPS: readonly CarShareStep[] = [
  {name: "Off", every: null},
  {name: "10%", every: 10},
  {name: "25%", every: 4},
  {name: "50%", every: 2},
  {name: "All", every: 1},
];

// The step a browser that never moved the slider is at: every trip, since even then a town shows only a few cars
export const DEFAULT_CAR_SHARE: CarShareStep = CAR_SHARE_STEPS[CAR_SHARE_STEPS.length - 1];

// The browser's share of the trips that become cars. It belongs to the browser, not the city: it is kept under its own
// key, by the step's name, never in a city save, and never sent to the server, so it changes nothing for the other
// players. A name kept that is no step's, or a store that can't be read, gives the default; one that can't be written
// leaves the step held for this game only (StoredText).
export class CarSharePreference {
  private readonly text: StoredText;
  private current: CarShareStep;

  constructor(store: PageStore | null) {
    this.text = new StoredText(store, CAR_SHARE_KEY);
    const kept = this.text.read();
    this.current = CAR_SHARE_STEPS.find(({name}) => name === kept) ?? DEFAULT_CAR_SHARE;
  }

  step(): CarShareStep {
    return this.current;
  }

  set(step: CarShareStep): void {
    this.current = step;
    this.text.write(step.name);
  }
}
