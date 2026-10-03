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

// The game speed as the player sets it, with Pause and Play or from Settings. The simulation's speed is the only
// record of whether the game is paused, and the pause button is shown from it after every change. Play resumes at
// the running speed: the speed a game was saved at, medium for a new game or one saved paused, or the speed Settings
// last chose.
export class SpeedControl {
  private runningSpeed: number;

  constructor(private readonly simulation: InstanceType<typeof Simulation>,
              private readonly showPaused: (paused: boolean) => void) {
    this.runningSpeed = simulation.isPaused() ? Simulation.SPEED_MED : simulation.getSpeed();
    showPaused(simulation.isPaused());
  }

  getRunningSpeed(): number {
    return this.runningSpeed;
  }

  togglePause(): void {
    this.setSpeed(this.simulation.isPaused() ? this.runningSpeed : Simulation.SPEED_PAUSED);
  }

  // Settings sets the speed the game runs at. A paused game stays paused, and Play resumes it at that speed: the
  // settings window sends its speed whenever it closes, changed or not.
  setRunningSpeed(speed: number): void {
    this.runningSpeed = speed;
    if (!this.simulation.isPaused()) {
      this.setSpeed(speed);
    }
  }

  private setSpeed(speed: number): void {
    this.simulation.setSpeed(speed);
    this.showPaused(this.simulation.isPaused());
  }
}
