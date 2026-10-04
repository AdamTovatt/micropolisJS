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

import { CityClientEnvironment, SessionStore, SocketLike, StoredSession } from "./cityClient";
import { isObject, pageStore, parseStored, StoredText } from "./storage";

// The city client's environment in the browser: fetch, WebSocket, localStorage, the Web Locks API and timers

export const SESSION_STORAGE_KEY = "micropolisJSSession";
const SESSION_LOCK = "micropolisJSSession";

// The game waits on the server's first answer before its splash screen, so a server that never answers counts as none
export const REQUEST_TIMEOUT_MS = 5000;

// The session in the text, or null when the text holds none
function parseSession(text: string): StoredSession | null {
  const value = parseStored(text);
  return isObject(value) && typeof value.token === "string" && typeof value.name === "string"
    ? {token: value.token, name: value.name}
    : null;
}

// Without storage the session lasts as long as the page (StoredText)
export function browserCityEnvironment(requestTimeoutMs = REQUEST_TIMEOUT_MS): CityClientEnvironment {
  const kept = new StoredText(pageStore(), SESSION_STORAGE_KEY);

  const store: SessionStore = {
    load() {
      const text = kept.read();
      return text === null ? null : parseSession(text);
    },
    save(session) {
      kept.write(JSON.stringify(session));
    },
  };

  return {
    // The signal also ends a body that stops arriving after the headers
    request: (path, init) => fetch(path, {...init, signal: AbortSignal.timeout(requestTimeoutMs)}),
    openSocket: (pathAndQuery) => {
      const scheme = location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${scheme}//${location.host}${pathAndQuery}`);
      const city: SocketLike = {onmessage: null, onclose: null, send: (data) => socket.send(data)};
      socket.onmessage = (event) => city.onmessage?.(event);
      socket.onclose = ({code}) => city.onclose?.({code});
      return city;
    },
    store,
    // The Web Locks API exists only in secure contexts, so a page served over plain HTTP from another host than
    // localhost runs the task at once: tabs whose token expires together may then each sign in as a new player
    exclusively: (task) => typeof navigator !== "undefined" && navigator.locks !== undefined
      ? navigator.locks.request(SESSION_LOCK, task)
      : task(),
    schedule: (callback, delayMs) => { setTimeout(callback, delayMs); },
  };
}
