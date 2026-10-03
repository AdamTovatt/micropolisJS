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

import { CityHost, Ticker } from "./cityHost";
import type { CityDriver, CitySource, StartedCity, CityStart, SessionLog } from "./citySource";
import { Command, LOCAL_PLAYER, Query, QueryAnswer, StateMessage } from "./protocol";

// The in-page source: the simulation runs in the same thread as the client, and answers at once. It is the simplest
// source to test against.

export class PageCitySource implements CitySource {
  readonly player = LOCAL_PLAYER;
  readonly driver: CityDriver;

  private readonly listeners: ((message: StateMessage) => void)[] = [];
  private readonly host: CityHost;

  constructor(ticker: Ticker) {
    const host = new CityHost((messages) => {
      messages.forEach((message) => this.listeners.forEach((listener) => listener(message)));
    }, ticker);
    this.host = host;

    let held = false;
    this.driver = {
      isHeld: () => held,
      hold: async () => {
        held = true;
        host.hold();
      },
      release: async () => {
        held = false;
        host.release();
      },
      flush: async () => host.flush(),
      advance: async (steps) => host.advance(steps),
      cityTime: async () => host.cityTime(),
    };
  }

  subscribe(listener: (message: StateMessage) => void): void {
    this.listeners.push(listener);
  }

  async start(start: CityStart): Promise<StartedCity> {
    return this.host.start(start);
  }

  send(command: Command): void {
    this.host.send(this.player, command);
  }

  ask(query: Query, reply: (answer: QueryAnswer) => void): void {
    reply(this.host.ask(query));
  }

  setViewerVisible(visible: boolean): void {
    this.host.setViewerVisible(visible);
  }

  async save(): Promise<string> {
    return this.host.save();
  }

  commandLog(): Promise<SessionLog> {
    return this.host.commandLog();
  }
}
