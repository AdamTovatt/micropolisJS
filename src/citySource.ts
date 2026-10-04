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

import type { AdvanceResult, Command, PlayerId, SessionLog, StateMessage } from "./protocol";
import type { QuerySource } from "./querySource";

// The only way the client reaches the city. A source sends the city commands and queries, and delivers the state
// messages the city sends back to its subscribers, in the order it sent them. The simulation behind it steps itself,
// at the speed the city was set to: the client sends speed and pause as commands, and paints whatever state came
// last. Where the simulation runs is the source's business: in the page, in a Web Worker, or on a server.

// Where a city starts: a new city, under the name the player gave it, on the map a game seed generates, at a level, by
// its number in GAME_LEVELS; or a saved game, as the text save gave
export type CityStart = {name: string, seed: number, level: number} | {save: string};

// A city that has started: its name, its game seed, and its id, by which any player joins it, or null for a city in the
// browser, which no one else can join
export interface StartedCity {
  name: string;
  seed: number;
  city: string | null;
}

// The end-to-end runner's channel, in debug mode: it holds the source's step driver, so that the city steps only when
// the runner advances it, and only the runner applies the commands sent. Holding is not pausing: the city's speed is
// untouched. A hold taken before a city starts applies from its first step.
export interface CityDriver {
  // Whether the runner holds the driver, as of its last call of hold or release: the game's tick then leaves the
  // player's input to the runner
  isHeld(): boolean;
  hold(): Promise<void>;
  release(): Promise<void>;
  // Applies the commands sent so far
  flush(): Promise<void>;
  // Applies the commands sent so far, then takes this many steps at the city's own speed. It fails when the city
  // doesn't step at all, or when city time doesn't advance as far as the steps imply.
  advance(steps: number): Promise<AdvanceResult>;
  // The city's time, in the units its date counts: 48 a year
  cityTime(): Promise<number>;
}

export interface CitySource extends QuerySource {
  // The player this source sends commands as
  readonly player: PlayerId;
  // The end-to-end runner's channel
  readonly driver: CityDriver;

  // Delivers every state message from now on to the listener
  subscribe(listener: (message: StateMessage) => void): void;
  // Starts the city, which replaces any city before it, once the state messages of its start have been delivered: the
  // full map among them. It fails, leaving the city before it, on a save that won't load.
  start(start: CityStart): Promise<StartedCity>;
  send(command: Command): void;
  // Whether the player can see the city: not while the tab is hidden or the screen is too small to play. A source in
  // the browser stops stepping while the player can't, as single-player always has; a shared city on a server steps on.
  // It is not a command: it is never logged, and the simulation's rules never see it.
  setViewerVisible(visible: boolean): void;
  // The saved game's text, the city's name with it
  save(): Promise<string>;
  // The session's command log: every command applied since the city started, and checkpoints of its state hash
  commandLog(): Promise<SessionLog>;
}

// A source's subscribers, to whom it delivers each state message in turn, in the order they subscribed
export class Subscribers {
  private readonly listeners: ((message: StateMessage) => void)[] = [];

  subscribe(listener: (message: StateMessage) => void): void {
    this.listeners.push(listener);
  }

  deliver(messages: StateMessage[]): void {
    messages.forEach((message) => this.listeners.forEach((listener) => listener(message)));
  }
}

// What becomes of a call's answer, or of its failure, once it comes
export interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

// The calls a source has made of what runs the city and waits on, each by the id its answer comes back with
export class PendingCalls {
  private readonly pending = new Map<number, Pending>();
  private nextId = 0;

  // answered names what answers a call, such as "The server answered request", for an answer to one never made
  constructor(private readonly answered: string) {}

  // Waits on a call, and gives the id its answer comes back with
  add(pending: Pending): number {
    const id = this.nextId++;
    this.pending.set(id, pending);
    return id;
  }

  // The call the answer is for, no longer waited on
  settle(id: number): Pending {
    const pending = this.pending.get(id);
    if (pending === undefined) {
      throw new Error(`${this.answered} ${id}, which was never made or already answered`);
    }

    this.pending.delete(id);
    return pending;
  }

  // Fails every call waited on, which none of them will be answered now
  failAll(error: Error): void {
    const pending = Array.from(this.pending.values());
    this.pending.clear();
    pending.forEach(({reject}) => {
      try {
        reject(error);
      } catch {
        // A query's reply throws what the query failed with, which the source reports once, as it fails them all
      }
    });
  }
}

// A driver over the calls that reach the city's own, which answers whether it is held at once, from its last hold or
// release, since the game's tick asks every tick
export function trackingHold(calls: Omit<CityDriver, "isHeld">): CityDriver {
  let held = false;
  return {
    ...calls,
    isHeld: () => held,
    hold: async () => {
      held = true;
      await calls.hold();
    },
    release: async () => {
      held = false;
      await calls.release();
    },
  };
}
