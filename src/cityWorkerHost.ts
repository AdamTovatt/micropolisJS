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
import { callError } from "./cityWorkerMessages";
import type { Call, CallResults, PageMessage, Port, WorkerMessage } from "./cityWorkerMessages";
import { Config } from "./config.js";
import { LOCAL_PLAYER } from "./protocol";

// The city's side of the Worker source: a city host, which the page reaches only through messages. The host posts the
// state messages a call changed as it makes them, before the call's answer, and the channel keeps its order, so the
// page has the state before the call resolves. What goes wrong outside a call, in the host's loop or in a command,
// is thrown out of the worker (cityWorker.ts), which the page hears of.

// The scope a promise rejects in with no one to catch it: the worker's own, or a test's stand-in
export interface RejectionScope {
  addEventListener(type: "unhandledrejection", listener: (event: {reason: unknown}) => void): void;
}

// A promise that rejects in the scope with no one to catch it is thrown, as an error thrown outside a call already is,
// so that the worker's error event carries it to the page
export function raiseUnhandledRejections(scope: RejectionScope): void {
  scope.addEventListener("unhandledrejection", ({reason}) => {
    throw reason instanceof Error ? reason : new Error(String(reason));
  });
}

// Serves the city over the port, its loop run by the ticker
export function serveCity(port: Port, ticker: Ticker): void {
  const post = (message: WorkerMessage) => port.postMessage(message);
  const host = new CityHost((messages) => post({type: "state", messages}), ticker);

  // Each call's answer, as the page reads it
  function answer(call: Call): CallResults[Call["method"]] | Promise<CallResults[Call["method"]]> {
    switch (call.method) {
      case "start":
        return host.start(call.start);
      case "ask":
        return host.ask(call.query);
      case "save":
        return host.save();
      case "commandLog":
        return host.commandLog();
      case "hold":
        return host.hold();
      case "release":
        return host.release();
      case "flush":
        return host.flush();
      case "advance":
        return host.advance(call.steps);
      case "cityTime":
        return host.cityTime();
    }
  }

  port.onmessage = ({data}) => {
    const message = data as PageMessage;
    switch (message.type) {
      case "init":
        Config.debug = message.debug;
        break;

      case "send":
        host.send(LOCAL_PLAYER, message.command);
        break;

      case "setViewerVisible":
        host.setViewerVisible(message.visible);
        break;

      case "call": {
        // The executor runs at once, so the call is made before the next message is read. A call that throws fails as
        // one that rejects does, and so does an answer that can't be posted, so every call is answered.
        const id = message.id;
        void new Promise((resolve) => resolve(answer(message.call)))
          .then((value) => post({type: "answer", id, value}))
          .catch((e: unknown) => post({type: "failed", id, error: callError(e)}));
        break;
      }
    }
  };
}
