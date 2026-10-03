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

import { Simulation } from "./simulation.js";

// How far city time gets in a number of steps, from the step and phase counters alone, as the original's simFrame and
// simulate advance them: the speed cycle lets a phase through, and city time advances on phase 0. It restates the
// simulation's speed gate on purpose: an independent model, so a city that stops letting phases through can't vouch
// for itself.
// TODO(#3) Merge with the headless runner's model once #3 lands, so there is one.

// The counters city time follows from
export interface CityClock {
  speed: number;
  speedCycle: number;
  phase: number;
  cityTime: number;
}

const PHASES_PER_CYCLE = 16;
const SPEED_CYCLE_MAX = 1023;

// Steps a phase is let through on, by speed: every 5th at slow, every 3rd at medium, every one at fast
const STEPS_PER_PHASE: Record<number, number> = {
  [Simulation.SPEED_SLOW]: 5,
  [Simulation.SPEED_MED]: 3,
  [Simulation.SPEED_FAST]: 1,
};

function stepsPerPhase(speed: number): number {
  const steps = STEPS_PER_PHASE[speed];
  if (steps === undefined) {
    throw new Error(`City time doesn't advance at speed ${speed}`);
  }

  return steps;
}

// The steps a unit of city time takes at a speed, away from the speed cycle's wrap
export function stepsPerCityTime(speed: number): number {
  return stepsPerPhase(speed) * PHASES_PER_CYCLE;
}

export function impliedCityTime(clock: CityClock, steps: number): number {
  const perPhase = stepsPerPhase(clock.speed);
  let speedCycle = clock.speedCycle;
  let phase = clock.phase;
  let cityTime = clock.cityTime;

  for (let i = 0; i < steps; i++) {
    speedCycle = speedCycle === SPEED_CYCLE_MAX ? 0 : speedCycle + 1;

    if (speedCycle % perPhase === 0) {
      if (phase === 0) {
        cityTime++;
      }

      phase = (phase + 1) % PHASES_PER_CYCLE;
    }
  }

  return cityTime;
}
