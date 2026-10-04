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

import { Command, CommandResult, Outcome, PlayerId, ServiceAmounts } from "./protocol";

// The commands the player's choices in the game's windows send, and what the game shows of their results

// The city settings the settings window shows, which are city state and change only by command: the speed one of
// SPEEDS, paused included
export interface CitySettings {
  autoBudget: boolean;
  disasters: boolean;
  speed: number;
}

// The commands for the city settings the player changed in the settings window. A setting is compared with what the
// window showed when it opened, not with the city now: the city keeps running behind the window, and a year end that
// turned auto-budget off meanwhile must not be turned back on by a window the player closed unchanged.
export function settingsCommands(shown: CitySettings, chosen: CitySettings): Command[] {
  const commands: Command[] = [];

  if (chosen.autoBudget !== shown.autoBudget) {
    commands.push({type: "setAutoBudget", on: chosen.autoBudget});
  }

  if (chosen.disasters !== shown.disasters) {
    commands.push({type: "setDisasters", on: chosen.disasters});
  }

  if (chosen.speed !== shown.speed) {
    commands.push({type: "setSpeed", speed: chosen.speed});
  }

  return commands;
}

// What the budget window's OK sends: the tax rate, and the funding of each service whose slider the player moved
export function budgetCommand(funding: Partial<ServiceAmounts>, tax: number): Command {
  return {type: "setBudget", tax, ...funding};
}

// The outcome of the player's own tool command a result tells of, and null for any other result. A result's command is whatever arrived, so it is checked before it is read: here rather than with
// validation.ts's isRecord, since the client imports nothing of the simulation's but the vocabulary it shares.
export function toolOutcome(result: CommandResult, player: PlayerId): Outcome | null {
  const command = result.command;
  if (result.player !== player || typeof command !== "object" || command === null || !("type" in command) ||
      command.type !== "tool") {
    return null;
  }

  return result.outcome;
}
