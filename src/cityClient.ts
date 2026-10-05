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

import {
  CITY_FAILED_CLOSE, CityMessage, ClientMessage, Cursor, CursorMessage, cursorReport, parseErrorResponse,
  parsePlayerResponse, parseServerMessage, parseSessionResponse, PlayerInfo, signInRequest,
} from "./protocol";

// The browser's side of the server, as protocol/README.md describes it: signing in and the city's WebSocket. When no
// server answers, the client stays offline, and the page has no game to offer. Once online, it reconnects after any drop
// with growing delays, and signs in again under the stored name when the server rejects its token, which gives the
// player a new id.

export const SESSION_PATH = "/api/session";
export const CITY_PATH = "/ws/city";

const FIRST_RECONNECT_DELAY_MS = 1000;
const LONGEST_RECONNECT_DELAY_MS = 30000;

export interface StoredSession {
  token: string;
  name: string;
}

export interface SessionStore {
  load(): StoredSession | null;
  save(session: StoredSession): void;
}

export interface ResponseLike {
  status: number;
  json(): Promise<unknown>;
}

export interface SocketLike {
  onmessage: ((event: {data: unknown}) => void) | null;
  // The code is the status the connection closed with: the server's, or one the browser gives a connection lost
  onclose: ((event: {code: number}) => void) | null;
  send(data: string): void;
}

// What the client needs from the browser, so a test can stand in for it
export interface CityClientEnvironment {
  // Rejects when no answer comes, including when none comes in time
  request(path: string, init: {method: string; headers: Record<string, string>; body?: string}): Promise<ResponseLike>;
  openSocket(pathAndQuery: string): SocketLike;
  // Shared by every tab of the browser
  store: SessionStore;
  // Runs the task while no other tab of the browser runs one
  exclusively<T>(task: () => Promise<T>): Promise<T>;
  schedule(callback: () => void, delayMs: number): void;
}

export type CityStatus = {online: false} | {online: true; you: string; players: PlayerInfo[]};

export type StartResult = "signed-in" | "needs-name" | "offline";

// The server refuses a name that breaks its rule with "rejected", and a sign-in over its rate limit with "too-many"
export type SignInResult =
  {outcome: "signed-in"} | {outcome: "rejected"; error: string} | {outcome: "too-many"; error: string} | {outcome: "offline"};

type SessionCheck = "valid" | "rejected" | "unreachable";

// What a game hears from the server of the other players in its city, and tells it of this one
export interface Presence {
  onStatus(listener: (status: CityStatus) => void): void;
  onCursor(listener: (message: CursorMessage) => void): void;
  reportCursor(cursor: Cursor | null): void;
}

export class CityClient implements Presence {
  private session: StoredSession | null = null;
  // The name a sign-in was given while the server stopped answering, to sign in under once it answers again
  private pendingName: string | null = null;
  private status: CityStatus = {online: false};
  private reconnectDelayMs = FIRST_RECONNECT_DELAY_MS;
  private readonly listeners: ((status: CityStatus) => void)[] = [];
  private readonly cityListeners: ((message: CityMessage) => void)[] = [];
  private readonly cityFailedListeners: (() => void)[] = [];
  // The socket, once the server has welcomed it, until it closes
  private socket: SocketLike | null = null;
  // Whether the client is trying to be welcomed: from when a server of ours first answers, until the client gives up
  // on a name the server refuses. While it is, it connects or signs in again until the server welcomes it.
  private trying = false;
  // What waits for the server to welcome the client, or for the client to stop trying
  private welcomes: ((online: boolean) => void)[] = [];
  private readonly cursorListeners: ((message: CursorMessage) => void)[] = [];

  constructor(private readonly environment: CityClientEnvironment) {}

  getStatus(): CityStatus {
    return this.status;
  }

  // Calls the listener with the status now and after every change
  onStatus(listener: (status: CityStatus) => void): void {
    this.listeners.push(listener);
    listener(this.status);
  }

  // Whether the server welcomes this client: at once when it has, and otherwise once it does, however many tries that
  // takes, as when a sign-in is over the server's limit or a socket closes before the server's hello. False when no
  // server of ours has answered, and once the client stops trying.
  welcomed(): Promise<boolean> {
    if (this.status.online || !this.trying) {
      return Promise.resolve(this.status.online);
    }

    return new Promise((resolve) => this.welcomes.push(resolve));
  }

  // Calls the listener with each message about the city the connection is in, in the order they came
  onCityMessage(listener: (message: CityMessage) => void): void {
    this.cityListeners.push(listener);
  }

  // Calls the listener when the server closes the connection because the city it was in failed, before the client
  // goes offline and reconnects
  onCityFailed(listener: () => void): void {
    this.cityFailedListeners.push(listener);
  }

  // Sends the message on the socket, and whether it could: not while offline, when nothing reaches the server
  send(message: ClientMessage): boolean {
    if (this.socket === null) {
      return false;
    }

    this.socket.send(JSON.stringify(message));
    return true;
  }

  // Calls the listener with each other player's hover box the server passes on, from now on
  onCursor(listener: (message: CursorMessage) => void): void {
    this.cursorListeners.push(listener);
  }

  // Tells the server where this player's hover box is now, or that it left the map. Nothing goes while offline: the
  // next box reported after the client is welcomed again is where it is then.
  reportCursor(cursor: Cursor | null): void {
    this.send(cursorReport(cursor));
  }

  // Finds out whether a server answers, and connects with the stored session when it does. The stored name signs in
  // again when the server rejects the stored token; when the server refuses that name too, the player gives a new one.
  // With no server answering nothing is retried; once one has answered, a sign-in that fails is retried until it
  // succeeds.
  async start(): Promise<StartResult> {
    const stored = this.environment.store.load();
    const check = await this.checkSession(stored?.token ?? null);

    if (check === "unreachable") {
      return "offline";
    }

    if (stored === null) {
      return "needs-name";
    }

    if (check === "valid") {
      this.connect(stored);
      return "signed-in";
    }

    const result = await this.signInOnce(stored.name, stored.token);

    switch (result.outcome) {
      case "signed-in":
        return "signed-in";
      case "rejected":
        return "needs-name";
      default:
        this.scheduleReconnect();
        return "offline";
    }
  }

  // Signs in as a new player under the name, and connects, unless another tab of the browser has signed in since:
  // tabs share the stored session, so this one joins as that player. When the server has stopped answering, the
  // sign-in is retried.
  async signIn(name: string): Promise<SignInResult> {
    const result = await this.signInOnce(name, null);

    if (result.outcome === "offline") {
      this.pendingName = name;
      this.scheduleReconnect();
    }

    return result;
  }

  // Connects with the stored session if it is not the rejected one and the server accepts it, and otherwise signs in
  // under the name. The tabs of a browser run this one at a time, so tabs whose token expired together, or that sign
  // in together, become one player.
  private signInOnce(name: string, rejectedToken: string | null): Promise<SignInResult> {
    return this.environment.exclusively(async () => {
      const stored = this.environment.store.load();

      if (stored !== null && stored.token !== rejectedToken && await this.checkSession(stored.token) === "valid") {
        this.connect(stored);
        return {outcome: "signed-in"};
      }

      return this.postSignIn(name);
    });
  }

  private async postSignIn(name: string): Promise<SignInResult> {
    let response: ResponseLike;
    let body: unknown;

    try {
      response = await this.environment.request(SESSION_PATH, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(signInRequest(name)),
      });
      body = await response.json();
    } catch {
      return {outcome: "offline"};
    }

    try {
      switch (response.status) {
        case 200: {
          const issued = parseSessionResponse(body);
          const session = {token: issued.token, name: issued.name};
          this.environment.store.save(session);
          this.connect(session);
          return {outcome: "signed-in"};
        }

        case 400:
          return {outcome: "rejected", error: parseErrorResponse(body).error};

        case 429:
          return {outcome: "too-many", error: parseErrorResponse(body).error};
      }
    } catch {
      // Not an answer of the protocol's, so not our server's
    }

    return {outcome: "offline"};
  }

  // A 401 is the server's answer, whatever the body; anything else but a player is no server of ours
  private async checkSession(token: string | null): Promise<SessionCheck> {
    try {
      const headers: Record<string, string> = token === null ? {} : {Authorization: `Bearer ${token}`};
      const response = await this.environment.request(SESSION_PATH, {method: "GET", headers});

      if (response.status === 401) {
        this.trying = true;
        return "rejected";
      }

      if (response.status === 200) {
        parsePlayerResponse(await response.json());
        this.trying = true;
        return "valid";
      }
    } catch {
      // No answer, or not our server's
    }

    return "unreachable";
  }

  private connect(session: StoredSession): void {
    this.session = session;
    const socket = this.environment.openSocket(`${CITY_PATH}?access_token=${encodeURIComponent(session.token)}`);
    this.trying = true;

    socket.onmessage = (event) => this.receive(socket, event.data);
    socket.onclose = ({code}) => {
      socket.onmessage = null;
      socket.onclose = null;
      this.socket = null;
      if (code === CITY_FAILED_CLOSE) {
        this.cityFailedListeners.forEach((listener) => listener());
      }
      this.setStatus({online: false});
      this.scheduleReconnect();
    };
  }

  private receive(socket: SocketLike, data: unknown): void {
    if (typeof data !== "string") {
      return;
    }

    let message;

    try {
      message = parseServerMessage(data);
    } catch (error) {
      console.warn("Ignored a message from the server", error);
      return;
    }

    switch (message.type) {
      case "hello":
        this.reconnectDelayMs = FIRST_RECONNECT_DELAY_MS;
        this.socket = socket;
        this.setStatus({online: true, you: message.you, players: message.players});
        break;

      case "players":
        if (this.status.online) {
          this.setStatus({online: true, you: this.status.you, players: message.players});
        }
        break;

      case "cursor":
        if (this.status.online) {
          this.cursorListeners.forEach((listener) => listener(message));
        }
        break;

      default:
        this.cityListeners.forEach((listener) => listener(message));
    }
  }

  private scheduleReconnect(): void {
    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, LONGEST_RECONNECT_DELAY_MS);
    // Nothing waits on a try: one that fails schedules the next itself, and its outcome reaches the client's listeners
    this.environment.schedule(() => { void this.reconnect(); }, delay);
  }

  // Another tab signed in as this player may have stored a newer session, so the stored one comes first
  private async reconnect(): Promise<void> {
    const session = this.environment.store.load() ?? this.session;
    let result: SignInResult | null = null;

    if (session !== null) {
      const check = await this.checkSession(session.token);

      if (check === "valid") {
        this.connect(session);
        return;
      }

      if (check === "rejected") {
        result = await this.signInOnce(session.name, session.token);
      }
    } else if (this.pendingName !== null) {
      result = await this.signInOnce(this.pendingName, null);
    }

    if (result?.outcome === "signed-in") {
      return;
    }

    // A name the server refuses is refused every time, so the client stops trying and stays offline until the page
    // loads again and asks for a new one
    if (result?.outcome === "rejected") {
      this.trying = false;
      this.settleWelcomes(false);
      return;
    }

    this.scheduleReconnect();
  }

  private setStatus(status: CityStatus): void {
    this.status = status;
    this.listeners.forEach((listener) => listener(status));

    if (status.online) {
      this.settleWelcomes(true);
    }
  }

  private settleWelcomes(online: boolean): void {
    const welcomes = this.welcomes;
    this.welcomes = [];
    welcomes.forEach((welcome) => welcome(online));
  }
}
