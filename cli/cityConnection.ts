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

import { CityClient, SessionStore } from "../src/cityClient";
import { CityState } from "../src/cityState";
import type { StartedCity } from "../src/citySource";
import { CITY_ID, Command, CommandResult, PlayerInfo, Query, QueryAnswer } from "../src/protocol";
import { cityOption } from "../src/urlOptions";
import { WebSocketCitySource } from "../src/webSocketCitySource";
import { NodeCityEnvironment, nodeCityEnvironment } from "./nodeCityEnvironment";

// The command line's connection to a city on the server: the browser's own city client and WebSocket source, run in
// Node, so the command line is a player as a page is, and sends the commands a page sends

// The server a run talks to when nothing names one: the development server's
export const DEFAULT_SERVER = "http://localhost:5180";

// How long a run waits on the server to answer or to apply its commands
const WAIT_MS = 15000;

// The server and the city a run is for
export interface Target {
  origin: string;
  city: string | null;
}

// The city is its id or its link, the page's address with ?city, which names the server too. Otherwise the server is
// the one named, then MICROPOLIS_SERVER's, then the development server.
export function resolveTarget(city: string | undefined, server: string | undefined): Target {
  if (city !== undefined && /^https?:\/\//.test(city)) {
    const link = new URL(city);
    const id = cityOption(link.search);
    if (id === null) {
      throw new Error(`The link ${city} names no city: a city's link ends in ?city=<id>`);
    }

    if (server !== undefined && new URL(server).origin !== link.origin) {
      throw new Error(`The city's link is on ${link.origin}, not the server named, ${server}`);
    }

    return {origin: link.origin, city: id};
  }

  if (city !== undefined && !CITY_ID.test(city)) {
    throw new Error(`"${city}" isn't a city: give its id, 32 hexadecimal digits, or its link`);
  }

  const named = server ?? process.env.MICROPOLIS_SERVER ?? DEFAULT_SERVER;
  return {origin: new URL(named).origin, city: city ?? null};
}

export class CityConnection {
  readonly state: CityState;
  private readonly source: WebSocketCitySource;
  // Fails with why the city was lost, once it has been: it failed on the server, or joining it again failed
  private readonly lost: Promise<never>;

  private constructor(private readonly client: CityClient, private readonly environment: NodeCityEnvironment) {
    let loseCity: (error: Error) => void = () => {};
    this.lost = new Promise<never>((_, reject) => { loseCity = reject; });
    // Each wait on the city races the loss; a run that waits on none when the city is lost has nothing to tell
    this.lost.catch(() => {});
    this.source = new WebSocketCitySource(client, loseCity);
    this.state = new CityState(this.source);
  }

  // Signs in as a new player under the name, unless the store holds a session the server accepts, and keeps the
  // session in the store. The name the server knows the player by.
  static async signIn(origin: string, store: SessionStore, name: string): Promise<string> {
    const environment = nodeCityEnvironment(origin, store);

    try {
      const client = new CityClient(environment);
      if (await client.start() === "offline") {
        throw new Error(`No server answers at ${origin}`);
      }

      const result = await client.signIn(name);
      if (result.outcome === "rejected" || result.outcome === "too-many") {
        throw new Error(result.error);
      }

      if (result.outcome === "offline") {
        throw new Error(`No server answers at ${origin}`);
      }

      return store.load()?.name ?? name;
    } finally {
      environment.close();
    }
  }

  // Connected to the server as the player the store's session signs in as
  static async open(origin: string, store: SessionStore): Promise<CityConnection> {
    const environment = nodeCityEnvironment(origin, store);

    try {
      const client = new CityClient(environment);

      switch (await client.start()) {
        case "offline":
          throw new Error(`No server answers at ${origin}`);
        case "needs-name":
          throw new Error(`Not signed in to ${origin}: sign in first, with sign-in <name>`);
      }

      if (!await within(client.welcomed(), "The server didn't welcome the player")) {
        throw new Error(`The server at ${origin} didn't welcome the player`);
      }

      return new CityConnection(client, environment);
    } catch (e) {
      environment.close();
      throw e;
    }
  }

  // The player the server knows this connection as
  get me(): PlayerInfo {
    const status = this.client.getStatus();
    const player = status.online ? status.players.find(({id}) => id === status.you) : undefined;
    if (player === undefined) {
      throw new Error("The connection to the server dropped");
    }

    return player;
  }

  // Everyone online, this player included
  players(): PlayerInfo[] {
    const status = this.client.getStatus();
    return status.online ? status.players : [];
  }

  // Once the city's whole state has arrived
  join(city: string): Promise<StartedCity> {
    return this.within(this.source.join(city), "The server didn't answer the join");
  }

  // Sends the commands in order, and what came of each once the city has applied them all
  async apply(commands: readonly Command[]): Promise<CommandResult[]> {
    const me = this.me.id;
    const results: CommandResult[] = [];
    let applied: () => void = () => {};
    const done = new Promise<void>((resolve) => { applied = resolve; });

    this.state.on("commandResult", ({result}) => {
      if (result.player === me) {
        results.push(result);
        if (results.length === commands.length) {
          applied();
        }
      }
    });

    commands.forEach((command) => this.source.send(command));
    await this.within(done, `The city didn't apply all ${commands.length} commands`);
    return results;
  }

  ask(query: Query): Promise<QueryAnswer> {
    return this.within(new Promise((resolve) => this.source.ask(query, resolve)), "The server didn't answer the query");
  }

  save(): Promise<void> {
    return this.within(this.source.save(), "The server didn't answer the save");
  }

  download(): Promise<string> {
    return this.within(this.source.download(), "The server didn't answer the download");
  }

  // Leaves the city and the server
  close(): void {
    this.environment.close();
  }

  // The promise's value, or why the city was lost, once it has been
  private within<T>(promise: Promise<T>, timedOut: string): Promise<T> {
    return within(Promise.race([promise, this.lost]), timedOut);
  }
}

// The promise's value, or a failure naming what didn't happen once the wait runs out
async function within<T>(promise: Promise<T>, timedOut: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${timedOut} within ${WAIT_MS / 1000} seconds`)), WAIT_MS);
  });

  try {
    return await Promise.race([promise, expired]);
  } finally {
    clearTimeout(timer);
  }
}
