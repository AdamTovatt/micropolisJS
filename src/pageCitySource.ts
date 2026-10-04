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
import { Subscribers, trackingHold } from "./citySource";
import type { CityDriver, CitySource, StartedCity, CityStart } from "./citySource";
import { Config } from "./config.js";
import { Command, LOCAL_PLAYER, Query, QueryAnswer, SessionLog, StateMessage } from "./protocol";

// The in-page source: the simulation runs in the same thread as the client, and answers at once. The page plays
// through the Worker source; the client's tests run against this one, on the test's own thread, and it passes the same
// contract tests as the Worker source.

export class PageCitySource implements CitySource {
  readonly player = LOCAL_PLAYER;
  readonly driver: CityDriver;

  private readonly subscribers = new Subscribers();
  private readonly host: CityHost;

  // debug is whether the client is in debug mode, which the simulation takes on
  constructor(ticker: Ticker, debug: boolean) {
    Config.debug = debug;
    const host = new CityHost((messages) => this.subscribers.deliver(messages), ticker);
    this.host = host;

    this.driver = trackingHold({
      hold: async () => host.hold(),
      release: async () => host.release(),
      flush: async () => host.flush(),
      advance: async (steps) => host.advance(steps),
      cityTime: async () => host.cityTime(),
    });
  }

  subscribe(listener: (message: StateMessage) => void): void {
    this.subscribers.subscribe(listener);
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
