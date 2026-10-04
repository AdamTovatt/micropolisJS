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

import type { CityStart, StartedCity } from "./citySource";
import type { AdvanceResult, Command, Query, QueryAnswer, SessionLog, StateMessage } from "./protocol";

// What the page and the city's Web Worker say to each other: the Worker source's side and cityWorker.ts's. Both are in
// the browser and built together, so this is not part of the protocol: the state messages it carries are.

// One end of the channel: the Worker object on the page's side, the worker's own scope on the other, or either end of
// a MessageChannel in a test
export interface Port {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent) => void) | null;
}

// A call the page makes of the city, which the worker answers once it has sent any state the call changed
export type Call =
  | {method: "start", start: CityStart}
  | {method: "ask", query: Query}
  | {method: "save"}
  | {method: "commandLog"}
  | {method: "hold"}
  | {method: "release"}
  | {method: "flush"}
  | {method: "advance", steps: number}
  | {method: "cityTime"};

// What each call answers with
export interface CallResults {
  start: StartedCity;
  ask: QueryAnswer;
  save: string;
  commandLog: SessionLog;
  hold: void;
  release: void;
  flush: void;
  advance: AdvanceResult;
  cityTime: number;
}

// What the page sends the worker: first whether the page is in debug mode, then what the player does, and the calls
// it makes, each with an id the answer carries
export type PageMessage =
  | {type: "init", debug: boolean}
  | {type: "send", command: Command}
  | {type: "setViewerVisible", visible: boolean}
  | {type: "call", id: number, call: Call};

// An error a call failed with: its name, which the page gives the error it rejects the call with where the name is one
// of JavaScript's own, and its message
export interface CallError {
  name: string;
  message: string;
}

// What a call failed with, as the worker sends it
export function callError(e: unknown): CallError {
  return e instanceof Error ? {name: e.name, message: e.message} : {name: "Error", message: String(e)};
}

// The errors a failed call rejects with, by name, so a caller can tell them apart as it could in the page
const ERRORS: Record<string, new (message: string) => Error> = {
  RangeError, ReferenceError, SyntaxError, TypeError,
};

// The error the page rejects a failed call with
export function rebuiltError({name, message}: CallError): Error {
  return new (ERRORS[name] ?? Error)(message);
}

// What the worker sends the page: the state messages the city sends, in order, and the answer to each call
export type WorkerMessage =
  | {type: "state", messages: StateMessage[]}
  | {type: "answer", id: number, value: unknown}
  | {type: "failed", id: number, error: CallError};
