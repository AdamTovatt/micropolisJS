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

import type { CityClient, CityStatus } from "./cityClient";
import { PendingCalls, queryReply, Subscribers, trackingHold } from "./citySource";
import type { CityDriver, CitySource, CityStart, Pending, StartedCity } from "./citySource";
import { errorMessage } from "./errorMessage";
import type {
  CityJoined, CityMessage, ClientRequest, Command, PlayerId, Query, QueryAnswer, RequestAnswer, RequestAnswers, SessionLog,
  StateMessage,
} from "./protocol";

// The requests the server answers with null, once they are done
type DoneType = {[Type in keyof RequestAnswers]: RequestAnswers[Type] extends null ? Type : never}[keyof RequestAnswers];
type DoneRequest = Extract<ClientRequest, {type: DoneType}>;

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
  private current: string | null = null;
  private online = false;

  // lost is told why the source is no longer in its city: it failed on the server, or joining it again failed
  constructor(private readonly client: CityClient, private readonly lost: (error: Error) => void) {
    client.onCityMessage((message) => this.receive(message));
    client.onCityFailed(() => this.cityFailed());
    client.onStatus((status) => this.statusChanged(status));

    this.driver = trackingHold({
      hold: () => this.done((id) => ({type: "hold", id})),
      release: () => this.done((id) => ({type: "release", id})),
      flush: () => this.done((id) => ({type: "flush", id})),
      advance: (steps) => this.request((id) => ({type: "advance", id, steps})),
      cityTime: () => this.request((id) => ({type: "cityTime", id})),
      savedGame: () => this.request((id) => ({type: "savedGame", id})),
    });
  }

  // The id of the city on the server the source is in, or null before it has started or joined one, or once it lost it
  get city(): string | null {
    return this.current;
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
    return this.joined(await ("seed" in start
      ? this.request((id) => ({type: "start", id, name: start.name, seed: start.seed, level: start.level}))
      : this.request((id) => ({type: "upload", id, save: start.save}))));
  }

  // Joins the city with the id, as another player started it, once its whole state has been delivered
  async join(city: string): Promise<StartedCity> {
    return this.joined(await this.request((id) => ({type: "join", id, city})));
  }

  // A command sent while the connection is down never reaches the city, which is said out loud
  send(command: Command): void {
    if (!this.client.send({type: "command", command})) {
      console.warn("A command was lost: the connection to the server is down", command);
    }
  }

  // A query asked while the connection is down is never answered, as one waiting when it drops isn't
  ask(query: Query, reply: (answer: QueryAnswer) => void): void {
    const pending = queryReply(query, reply);

    if (!this.requestWith((id) => ({type: "query", id, query}), pending)) {
      pending.abandon(new Error("The connection to the server is down"));
    }
  }

  // The city is kept in the server's store, the one place it is kept, and the save resolves once it is
  save(): Promise<void> {
    return this.done((id) => ({type: "save", id}));
  }

  download(): Promise<string> {
    return this.request((id) => ({type: "download", id}));
  }

  commandLog(): Promise<SessionLog> {
    return this.request((id) => ({type: "commandLog", id}));
  }

  // On a server whose cities run on a clock only the debug channel moves, as a test server's do: moves the city's clock
  // on by the milliseconds given, then has the city take a turn of its loop if one is due
  turn(milliseconds: number): Promise<void> {
    return this.done((id) => ({type: "turn", id, milliseconds}));
  }

  private joined({city, name, seed}: CityJoined): StartedCity {
    this.current = city;
    return {name, seed, city};
  }

  // The request's answer, of the type the protocol gives requests of its type
  private request<Request extends ClientRequest>(build: (id: number) => Request): Promise<RequestAnswer<Request>> {
    return new Promise((resolve, reject) => {
      if (!this.requestWith(build, {resolve: resolve as (value: unknown) => void, reject})) {
        reject(new Error("The connection to the server is down"));
      }
    });
  }

  // Once a request whose answer is null is answered
  private async done(build: (id: number) => DoneRequest): Promise<void> {
    await this.request(build);
  }

  // Sends the request and waits on its answer, or says it couldn't: the connection is down
  private requestWith(build: (id: number) => ClientRequest, pending: Pending): boolean {
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
    if (this.current !== null) {
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

    if (!wasOnline && status.online && this.current !== null) {
      const city = this.current;
      if (this.driver.isHeld()) {
        this.driver.hold().catch((error: unknown) => console.error(`Holding city ${city} again failed`, error));
      }

      this.join(city).catch((error: unknown) => {
        // A connection that drops again before the answer joins again once it is back
        if (this.online) {
          this.loseCity(new Error(`Joining the city again failed: ${errorMessage(error)}`));
        }
      });
    }
  }

  private loseCity(error: Error): void {
    this.current = null;
    this.lost(error);
  }
}
