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

import type { CityClient, CityStatus } from "./cityClient";
import { PendingCalls, Subscribers, trackingHold } from "./citySource";
import type { CityDriver, CitySource, CityStart, Pending, StartedCity } from "./citySource";
import type {
  AdvanceResult, CityJoined, CityMessage, ClientMessage, Command, PlayerId, Query, QueryAnswer, SessionLog, StateMessage,
} from "./protocol";

// The WebSocket source: the city runs on the server, which owns it, and the page reaches it over the city's socket,
// which the city client holds (protocol/README.md). Any signed-in player may join a city by its id, and every player in
// it is sent the same state messages. Every request is answered after the state it changed has been delivered. After
// the connection drops and the client reconnects, the source joins its city again, which sends it the whole city. A city
// the source can't join again, or one that failed on the server, is lost to the page, which the source says.

export class WebSocketCitySource implements CitySource {
  readonly driver: CityDriver;

  private readonly subscribers = new Subscribers();
  private readonly calls = new PendingCalls("The server answered request");
  // The city the source is in, which it joins again once it reconnects, or null before it has started one or once it
  // lost it
  private city: string | null = null;
  private online = false;

  // lost is told why the source is no longer in its city: it failed on the server, or joining it again failed
  constructor(private readonly client: CityClient, private readonly lost: (error: Error) => void) {
    client.onCityMessage((message) => this.receive(message));
    client.onCityFailed(() => this.cityFailed());
    client.onStatus((status) => this.statusChanged(status));

    this.driver = trackingHold({
      hold: () => this.request((id) => ({type: "hold", id})),
      release: () => this.request((id) => ({type: "release", id})),
      flush: () => this.request((id) => ({type: "flush", id})),
      advance: (steps) => this.request<AdvanceResult>((id) => ({type: "advance", id, steps})),
      cityTime: () => this.request<number>((id) => ({type: "cityTime", id})),
    });
  }

  // The player the server knows this browser as, once it has said
  get player(): PlayerId {
    const status = this.client.getStatus();
    return status.online ? status.you : "";
  }

  subscribe(listener: (message: StateMessage) => void): void {
    this.subscribers.subscribe(listener);
  }

  // A new city starts on the server, and a saved game is uploaded to start there, under a new id
  async start(start: CityStart): Promise<StartedCity> {
    return this.joined(await this.request<CityJoined>((id) => ("seed" in start
      ? {type: "start", id, name: start.name, seed: start.seed, level: start.level}
      : {type: "upload", id, save: start.save})));
  }

  // Joins the city with the id, as another player started it, once its whole state has been delivered
  async join(city: string): Promise<StartedCity> {
    return this.joined(await this.request<CityJoined>((id) => ({type: "join", id, city})));
  }

  // A command sent while the connection is down never reaches the city, which is said out loud
  send(command: Command): void {
    if (!this.client.send({type: "command", command})) {
      console.warn("A command was lost: the connection to the server is down", command);
    }
  }

  // The reply is called as the answer arrives, so what goes wrong in it, or in the query, is thrown there, as the
  // in-page source throws it at the call, rather than lost in a promise. A query asked while the connection is down is
  // never answered, which is said out loud, as a command sent then is: what asked it carries on without the answer.
  ask(query: Query, reply: (answer: QueryAnswer) => void): void {
    const asked = this.requestWith((id) => ({type: "query", id, query}), {
      resolve: (answer) => reply(answer as QueryAnswer),
      reject: (error) => {
        throw error;
      },
    });

    if (!asked) {
      console.warn("A query went unanswered: the connection to the server is down", query);
    }
  }

  // A shared city steps whether or not this player can see it, so the server is never told
  setViewerVisible(): void {}

  save(): Promise<string> {
    return this.request<string>((id) => ({type: "save", id}));
  }

  commandLog(): Promise<SessionLog> {
    return this.request<SessionLog>((id) => ({type: "commandLog", id}));
  }

  // On a server whose cities run on a clock only the debug channel moves, as a test server's do: moves the city's clock
  // on by the milliseconds given, then has the city take a turn of its loop if one is due
  turn(milliseconds: number): Promise<void> {
    return this.request((id) => ({type: "turn", id, milliseconds}));
  }

  private joined({city, name, seed}: CityJoined): StartedCity {
    this.city = city;
    return {name, seed, city};
  }

  private request<T = void>(build: (id: number) => ClientMessage): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.requestWith(build, {resolve: resolve as (value: unknown) => void, reject})) {
        reject(new Error("The connection to the server is down"));
      }
    });
  }

  // Sends the request and waits on its answer, or says it couldn't: the connection is down
  private requestWith(build: (id: number) => ClientMessage, pending: Pending): boolean {
    const id = this.calls.add(pending);
    if (!this.client.send(build(id))) {
      this.calls.settle(id);
      return false;
    }

    return true;
  }

  private receive(message: CityMessage): void {
    switch (message.type) {
      case "state":
        this.subscribers.deliver(message.messages);
        break;

      case "answer":
        this.calls.settle(message.id).resolve(message.value);
        break;

      case "failed":
        this.calls.settle(message.id).reject(new Error(message.error));
        break;
    }
  }

  // The server unloaded the city without saving it: joining it again would load it as it was last saved, which the
  // page decides on, so the source doesn't
  private cityFailed(): void {
    if (this.city !== null) {
      this.loseCity(new Error("The city failed on the server, which keeps it as it was last saved"));
    }
  }

  // A request waiting when the connection drops is never answered: it fails. Once the client is welcomed back, the
  // source joins its city again, held as its driver was, and the server sends it the whole city.
  private statusChanged(status: CityStatus): void {
    const wasOnline = this.online;
    this.online = status.online;

    if (wasOnline && !status.online) {
      this.calls.failAll(new Error("The connection to the server dropped"));
    }

    if (!wasOnline && status.online && this.city !== null) {
      const city = this.city;
      if (this.driver.isHeld()) {
        this.driver.hold().catch((error: unknown) => console.error(`Holding city ${city} again failed`, error));
      }

      this.join(city).catch((error: unknown) => {
        // A connection that drops again before the answer joins again once it is back
        if (this.online) {
          this.loseCity(new Error(`Joining the city again failed: ${error instanceof Error ? error.message : String(error)}`));
        }
      });
    }
  }

  private loseCity(error: Error): void {
    this.city = null;
    this.lost(error);
  }
}
