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

// Turns real time into simulation steps at a fixed rate. Time is owed until it adds up to a whole step, so a slow
// frame is followed by several steps rather than losing time. Real time only paces the city: what the city becomes
// depends on the number of steps alone.

const STEPS_PER_SECOND = 60;

// A long gap, such as a hidden tab or a sleeping machine, would owe thousands of steps at once and freeze the page
// while they ran. Past this many steps in one call the rest of the owed time is dropped, which slows the city in real
// time and changes nothing else.
const MAX_STEPS_PER_CALL = STEPS_PER_SECOND;

// Owed time is counted in thousandths of a step, so a frame's milliseconds convert by multiplying by 60 rather than
// dividing by the 16⅔ milliseconds of a step, which would round on every frame and let a second of frames fall a step
// short
const UNITS_PER_STEP = 1000;

class StepDriver {
  private lastTime: number | null = null;
  private owedUnits = 0;

  // The number of steps due by now, a time in milliseconds
  stepsDue(now: number): number {
    if (this.lastTime === null) {
      this.lastTime = now;
      return 0;
    }

    this.owedUnits += (now - this.lastTime) * STEPS_PER_SECOND;
    this.lastTime = now;

    const steps = Math.floor(this.owedUnits / UNITS_PER_STEP);
    if (steps > MAX_STEPS_PER_CALL) {
      this.owedUnits = 0;
      return MAX_STEPS_PER_CALL;
    }

    this.owedUnits -= steps * UNITS_PER_STEP;
    return steps;
  }

  // While the city is not stepping, no time is owed: it resumes without catching up
  idle(): void {
    this.lastTime = null;
    this.owedUnits = 0;
  }

  // Takes the steps due by now while the city is stepping. A step can stop it, as by opening a dialog, which ends the
  // run there.
  run(now: number, isStepping: () => boolean, step: () => void): void {
    if (!isStepping()) {
      this.idle();
      return;
    }

    const steps = this.stepsDue(now);
    for (let i = 0; i < steps && isStepping(); i++) {
      step();
    }
  }
}

export { MAX_STEPS_PER_CALL, STEPS_PER_SECOND, StepDriver };
