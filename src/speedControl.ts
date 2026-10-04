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

import { SPEEDS } from "./protocol";

// The game speed as the player sets it with Pause and Play, which send setSpeed commands with send; Settings sets it by
// the commands of windowCommands.ts. The city's speed, as each settings record gives it, is the only record of whether
// the game is paused, and the pause button is shown from it whenever it changes, whoever changed it. Play resumes at
// the running speed: the speed a game was saved at, medium for a new game or one saved paused, or the speed the city
// last ran at.
export class SpeedControl {
  private runningSpeed: number;

  // speed is the city's speed as the game starts
  constructor(private speed: number, private readonly send: (speed: number) => void,
              private readonly showPaused: (paused: boolean) => void) {
    this.runningSpeed = this.isPaused() ? SPEEDS.medium : speed;
    showPaused(this.isPaused());
  }

  isPaused(): boolean {
    return this.speed === SPEEDS.paused;
  }

  togglePause(): void {
    this.send(this.isPaused() ? this.runningSpeed : SPEEDS.paused);
  }

  // The city's speed, from each settings record
  showSpeed(speed: number): void {
    if (speed === this.speed) {
      return;
    }

    this.speed = speed;
    if (speed !== SPEEDS.paused) {
      this.runningSpeed = speed;
    }

    this.showPaused(speed === SPEEDS.paused);
  }
}
