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

import type { CityClientEnvironment, SessionStore, SocketLike } from "../src/cityClient";

// A city client's environment in Node, against the server at the origin, for the command line and for the client's
// tests that run against the real server. drop loses its connection as a network going would, after which the client
// reconnects; close ends its sockets and timers for good.

export interface NodeCityEnvironment extends CityClientEnvironment {
  drop(): void;
  close(): void;
}

export function nodeCityEnvironment(origin: string, store: SessionStore): NodeCityEnvironment {
  const sockets: WebSocket[] = [];
  const timers: NodeJS.Timeout[] = [];
  let closed = false;

  return {
    request: (path, init) => fetch(origin + path, init),
    openSocket: (pathAndQuery) => {
      const socket = new WebSocket(origin.replace(/^http/, "ws") + pathAndQuery);
      sockets.push(socket);
      const city: SocketLike = {onmessage: null, onclose: null, send: (data) => socket.send(data)};
      socket.onmessage = (event) => city.onmessage?.({data: event.data});
      socket.onclose = ({code}) => city.onclose?.({code});
      return city;
    },
    store,
    exclusively: (task) => task(),
    schedule: (callback, delayMs) => {
      if (!closed) {
        timers.push(setTimeout(callback, delayMs));
      }
    },
    drop: () => sockets.forEach((socket) => socket.close()),
    close: () => {
      closed = true;
      timers.forEach((timer) => clearTimeout(timer));
      sockets.forEach((socket) => socket.close());
    },
  };
}
