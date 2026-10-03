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
  parseErrorResponse, parsePlayerResponse, parseServerMessage, parseSessionResponse, PlayerInfo, signInRequest,
} from "./protocol";

// The browser's side of the server, as protocol/README.md describes it: signing in and the city's WebSocket. When no
// server answers, the game runs single-player and the client stays offline. Once online, it reconnects after any drop
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
  onclose: (() => void) | null;
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

export class CityClient {
  private session: StoredSession | null = null;
  private status: CityStatus = {online: false};
  private reconnectDelayMs = FIRST_RECONNECT_DELAY_MS;
  private readonly listeners: ((status: CityStatus) => void)[] = [];

  constructor(private readonly environment: CityClientEnvironment) {}

  getStatus(): CityStatus {
    return this.status;
  }

  // Calls the listener with the status now and after every change
  onStatus(listener: (status: CityStatus) => void): void {
    this.listeners.push(listener);
    listener(this.status);
  }

  // Finds out whether a server answers, and connects with the stored session when it does. The stored name signs in
  // again when the server rejects the stored token; when the server refuses that name too, the player gives a new one.
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

    const result = await this.renewSession(stored);

    switch (result.outcome) {
      case "signed-in":
        return "signed-in";
      case "rejected":
        return "needs-name";
      default:
        return "offline";
    }
  }

  // Signs in as a new player under the name, and connects
  async signIn(name: string): Promise<SignInResult> {
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
        return "rejected";
      }

      if (response.status === 200) {
        parsePlayerResponse(await response.json());
        return "valid";
      }
    } catch {
      // No answer, or not our server's
    }

    return "unreachable";
  }

  // Signs in again under the rejected session's name, unless another tab already has. The tabs of a browser share
  // the stored session, and run this one at a time, so tabs whose token expired together become one new player.
  private renewSession(rejected: StoredSession): Promise<SignInResult> {
    return this.environment.exclusively(async () => {
      const stored = this.environment.store.load();

      if (stored !== null && stored.token !== rejected.token && await this.checkSession(stored.token) === "valid") {
        this.connect(stored);
        return {outcome: "signed-in"};
      }

      return this.signIn(rejected.name);
    });
  }

  private connect(session: StoredSession): void {
    this.session = session;
    const socket = this.environment.openSocket(`${CITY_PATH}?access_token=${encodeURIComponent(session.token)}`);

    socket.onmessage = (event) => this.receive(event.data);
    socket.onclose = () => {
      socket.onmessage = null;
      socket.onclose = null;
      this.setStatus({online: false});
      this.scheduleReconnect();
    };
  }

  private receive(data: unknown): void {
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

    if (message.type === "hello") {
      this.reconnectDelayMs = FIRST_RECONNECT_DELAY_MS;
      this.setStatus({online: true, you: message.you, players: message.players});
    } else if (this.status.online) {
      this.setStatus({online: true, you: this.status.you, players: message.players});
    }
  }

  private scheduleReconnect(): void {
    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, LONGEST_RECONNECT_DELAY_MS);
    this.environment.schedule(() => { void this.reconnect(); }, delay);
  }

  // Another tab signed in as this player may have stored a newer session, so the stored one comes first
  private async reconnect(): Promise<void> {
    const session = this.environment.store.load() ?? this.session;

    if (session === null) {
      return;
    }

    const check = await this.checkSession(session.token);

    if (check === "valid") {
      this.connect(session);
      return;
    }

    if (check === "rejected") {
      const result = await this.renewSession(session);

      // A name the server refuses is refused every time, so the client stays offline until the page loads again and
      // asks for a new one
      if (result.outcome === "signed-in" || result.outcome === "rejected") {
        return;
      }
    }

    this.scheduleReconnect();
  }

  private setStatus(status: CityStatus): void {
    this.status = status;
    this.listeners.forEach((listener) => listener(status));
  }
}
