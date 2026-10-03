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

import { ReceivedCommand } from "./commands";
import { CommandResult, PlayerId } from "./protocol";

// The parts of the simulation that commands and steps reach
export interface CommandTarget {
  applyCommands(received: ReceivedCommand[]): CommandResult[];
  step(): void;
}

// A command as applied: stamped with the index of the step it precedes, which counts the steps taken since the queue
// began. Commands stamped with the same step apply in the order they are listed.
export interface StampedCommand extends ReceivedCommand {
  step: number;
}

// What a session's log is recorded from: each command as it applies, stamped, and each step just before it is taken
export interface QueueRecorder {
  applied(stamped: StampedCommand): void;
  beforeStep(step: number): void;
}

// Drives a simulation with commands and steps, as the browser does and the server will: commands queue as they
// arrive, and apply in arrival order between steps, whenever applyCommands is called, whether or not the city is
// stepping. Each is stamped with the index of the step it precedes, and handed to the recorder in the order applied.
export class CommandQueue {
  private received: ReceivedCommand[] = [];
  private steps = 0;

  constructor(private readonly simulation: CommandTarget, private readonly recorder: QueueRecorder) {}

  // The steps taken since the queue began, which is the index the next step has
  get stepIndex(): number {
    return this.steps;
  }

  send(player: PlayerId, command: unknown): void {
    this.received.push({player, command});
  }

  // One command at a time, each stamped as it applies, so a command that throws leaves those after it queued
  applyCommands(): CommandResult[] {
    const results: CommandResult[] = [];

    while (this.received.length > 0) {
      const next = this.received.shift()!;
      this.recorder.applied({step: this.steps, ...next});
      results.push(...this.simulation.applyCommands([next]));
    }

    return results;
  }

  step(): void {
    this.recorder.beforeStep(this.steps);
    this.simulation.step();
    this.steps++;
  }
}
