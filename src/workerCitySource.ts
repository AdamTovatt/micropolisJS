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

import { PendingCalls, queryReply, Subscribers, trackingHold } from "./citySource";
import type { CityDriver, CitySource, CityStart, Pending, StartedCity } from "./citySource";
import { rebuiltError } from "./cityWorkerMessages";
import type { Call, CallResults, PageMessage, Port, WorkerMessage } from "./cityWorkerMessages";
import { Command, LOCAL_PLAYER, Query, QueryAnswer, SessionLog, StateMessage } from "./protocol";

// The Worker source: the simulation runs in a Web Worker (cityWorker.ts), off the page's thread, and the page reaches
// it only through messages. Every call is answered after the state it changed has been delivered.

// The page's end of the channel: the Worker, which also fires an error event when something goes wrong in it, or a
// test's stand-in
export interface WorkerPort extends Port {
  addEventListener(type: "error", listener: (event: Event) => void): void;
}

export class WorkerCitySource implements CitySource {
  readonly player = LOCAL_PLAYER;
  readonly driver: CityDriver;

  private readonly subscribers = new Subscribers();
  private readonly calls = new PendingCalls("The city's worker answered call");
  // What the worker failed with, once it can never answer
  private failure: Error | null = null;

  // The port is the worker, or a channel to the worker's side; debug is whether the client is in debug mode, which the
  // simulation in the worker takes on
  constructor(private readonly port: WorkerPort, debug: boolean) {
    port.onmessage = ({data}) => this.receive(data as WorkerMessage);
    port.addEventListener("error", this.workerFailed);
    this.post({type: "init", debug});

    this.driver = trackingHold({
      hold: () => this.call({method: "hold"}),
      release: () => this.call({method: "release"}),
      flush: () => this.call({method: "flush"}),
      advance: (steps) => this.call({method: "advance", steps}),
      cityTime: () => this.call({method: "cityTime"}),
      // A city in the browser is kept only where the page keeps the text, so the runner's read is the save itself
      savedGame: () => this.call({method: "save"}),
    });
  }

  subscribe(listener: (message: StateMessage) => void): void {
    this.subscribers.subscribe(listener);
  }

  start(start: CityStart): Promise<StartedCity> {
    return this.call({method: "start", start});
  }

  send(command: Command): void {
    this.post({type: "send", command});
  }

  ask(query: Query, reply: (answer: QueryAnswer) => void): void {
    this.request({method: "ask", query}, queryReply(query, reply));
  }

  setViewerVisible(visible: boolean): void {
    this.post({type: "setViewerVisible", visible});
  }

  save(): Promise<string> {
    return this.call({method: "save"});
  }

  commandLog(): Promise<SessionLog> {
    return this.call({method: "commandLog"});
  }

  private call<C extends Call>(call: C): Promise<CallResults[C["method"]]> {
    return new Promise((resolve, reject) => {
      this.request(call, {resolve: resolve as (value: unknown) => void, reject});
    });
  }

  private request(call: Call, pending: Pending): void {
    if (this.failure !== null) {
      pending.reject(this.failure);
      return;
    }

    this.post({type: "call", id: this.calls.add(pending), call});
  }

  private post(message: PageMessage): void {
    this.port.postMessage(message);
  }

  private receive(message: WorkerMessage): void {
    switch (message.type) {
      case "state":
        this.subscribers.deliver(message.messages);
        break;

      case "answer":
        this.calls.settle(message.id).resolve(message.value);
        break;

      case "failed":
        this.calls.settle(message.id).reject(rebuiltError(message.error));
        break;
    }
  }

  // What goes wrong in the worker outside a call, such as in the loop that steps the city, goes wrong in the page too,
  // so it is never silent. The page reports it only as this throw, which names the worker; the worker reports it in its
  // own scope too. A worker whose script failed to load fires a plain event, with no message, and never answers: every
  // call waiting on it fails, and every call after, so that nothing waits on it forever.
  private readonly workerFailed = (event: Event): void => {
    event.preventDefault();
    const message = (event as Partial<ErrorEvent>).message;
    if (message !== undefined) {
      throw new Error(`The city's worker failed: ${message}`);
    }

    const failure = new Error("The city's worker failed: its script didn't load");
    this.failure = failure;
    this.calls.failAll(failure);
    throw failure;
  };
}
