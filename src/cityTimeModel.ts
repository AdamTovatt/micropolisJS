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
// simulate advance them: the speed cycle lets a phase through, and city time advances on phase 0. A run that ends
// anywhere else has stalled. It restates the simulation's speed gate on purpose: an independent model, so a city that
// stops letting phases through can't vouch for itself.

// The counters city time follows from
export interface CityClock {
  speed: number;
  speedCycle: number;
  phase: number;
  cityTime: number;
}

// What a clock is read from: the simulation's speed and its raw counters
export interface ClockedSimulation {
  getSpeed(): number;
  _speedCycle: number;
  _phaseCycle: number;
  _cityTime: number;
}

export function clockOf(simulation: ClockedSimulation): CityClock {
  return {speed: simulation.getSpeed(), speedCycle: simulation._speedCycle, phase: simulation._phaseCycle,
          cityTime: simulation._cityTime};
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

// Units of city time in a year, as the simulation's date counts them
export const CITY_TIME_PER_YEAR = 48;

// The steps a year takes at a speed, away from the speed cycle's wrap
export function stepsPerYear(speed: number): number {
  return CITY_TIME_PER_YEAR * stepsPerCityTime(speed);
}

// Fails on a number of steps that isn't whole
export function checkStepCount(steps: number): void {
  if (!Number.isInteger(steps) || steps < 0) {
    throw new Error(`Steps are taken in whole numbers, got ${steps}`);
  }
}

// Takes this many steps, each a call of step, and fails when city time didn't advance as far as they imply: the city
// stalled. Whoever calls it first checks that the city steps at all.
export function takeSteps(simulation: ClockedSimulation, steps: number, step: () => void): void {
  checkStepCount(steps);
  const before = clockOf(simulation);

  for (let i = 0; i < steps; i++) {
    step();
  }

  const expected = impliedCityTime(before, steps);
  if (simulation._cityTime !== expected) {
    throw new Error(`The city stalled: ${steps} steps should advance city time from ${before.cityTime} to ` +
                    `${expected}, but it reached ${simulation._cityTime}`);
  }
}
