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

import type { PlayerRoster } from "./playerRoster";
import { Command, CommandResult, PlayerId, SERVICES, SPEEDS } from "./protocol";
import { Text } from "./text";

// What the activity list says of the other players in a shared city: a line for each command of theirs that went
// through, such as "Ana built a road". The naming is the client's alone: a command result carries the sender's id,
// which the client names from the players the server lists. A failed tool command is shown only to its sender, in the
// tool toast (toolToast.ts), and the player's own commands are not listed, nor is anything in a city no server shares.

// How long a line shows after the command it last told of, in milliseconds
export const LINE_LIFETIME_MS = 10000;

// The most lines the list shows, newest first
export const MOST_LINES = 4;

// What the activity list tells of a command: who sent it, the text, and the key of what it did, which one line per
// player shows at a time
export interface ActivityEntry {
  player: PlayerId;
  key: string;
  text: string;
}

// A line the list shows, and when, in milliseconds, it last told of a command
export interface ActivityLine extends ActivityEntry {
  at: number;
}

// What the player did, after their name. A command that went through is one the simulation validated, so it is read
// as the command it is.
function action(command: Command): {key: string, text: string} {
  const actions = Text.playerActions;

  switch (command.type) {
    case "tool":
      return {key: `tool:${command.tool}`, text: actions.tools[command.tool]};

    case "walkway":
      return {key: `walkway:${command.kind}`, text: actions.walkways[command.kind]};

    case "erase":
      return {key: `erase:${command.tool}`, text: actions.erased[command.tool]};

    case "eraseWalkway":
      return {key: command.type, text: actions.erasedWalkway};

    case "setBudget": {
      const parts = [actions.taxes(command.tax)];
      SERVICES.forEach((service) => {
        const percent = command[service];
        if (percent !== undefined) {
          parts.push(actions.fundingTo(actions.funding[service], percent));
        }
      });
      return {key: command.type, text: parts.join(", ")};
    }

    case "setSpeed": {
      const speed = (Object.keys(SPEEDS) as (keyof typeof SPEEDS)[]).find((name) => SPEEDS[name] === command.speed)!;
      return {key: command.type, text: actions.speeds[speed]};
    }

    case "setAutoBudget":
      return {key: command.type, text: actions.autoBudget(command.on)};

    case "setDisasters":
      return {key: command.type, text: actions.disastersSetting(command.on)};

    case "triggerDisaster":
      return {key: `triggerDisaster:${command.kind}`, text: actions.disasters[command.kind]};

    case "addFunds":
      return {key: command.type, text: actions.addFunds};
  }
}

// What the list tells of a command result, or null when it tells nothing: the command failed, or isn't another named
// player's
export function activityEntry(result: CommandResult, roster: PlayerRoster): ActivityEntry | null {
  const name = roster.otherName(result.player);
  const command = result.command;

  if (result.outcome !== "ok" || name === null || typeof command !== "object" || command === null ||
      !("type" in command)) {
    return null;
  }

  const {key, text} = action(command as Command);
  return {player: result.player, key, text: Text.playerActions.line(name, text)};
}

// The lines the list shows. A player's commands that do the same, such as the tool commands a drag sends as it goes,
// make one line, which each of them brings back to the top.
export class ActivityFeed {
  // Newest first
  private lines: ActivityLine[] = [];

  add(entry: ActivityEntry, now: number): void {
    this.lines = [{...entry, at: now},
                  ...this.lines.filter((line) => line.player !== entry.player || line.key !== entry.key)]
      .slice(0, MOST_LINES);
  }

  // The lines showing at the time, newest first
  showing(now: number): readonly ActivityLine[] {
    this.lines = this.lines.filter((line) => now - line.at < LINE_LIFETIME_MS);
    return this.lines;
  }
}
