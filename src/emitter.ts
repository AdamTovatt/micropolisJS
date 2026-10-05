/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 * Modified in Adam Tovatt's continuation of micropolisJS. Copyright (C) 2026 Adam Tovatt
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

// The base of a client object that announces what the player does, such as a window closing or a button clicked, to
// the listeners added for each event, by its name from uiMessages.ts. The simulation's events are its own
// (EventEmitter in the C# rules), and reach the client only as state messages.
export class Emitter {
  private readonly listeners = new Map<string, ((value: never) => void)[]>();

  // Calls the listener with each value the event carries from now on; a listener added twice is called once
  addEventListener(event: string, listener: (value: never) => void): void {
    const listeners = this.listeners.get(event) ?? [];
    if (!listeners.includes(listener)) {
      listeners.push(listener);
    }

    this.listeners.set(event, listeners);
  }

  protected emit(event: string, value?: unknown): void {
    (this.listeners.get(event) ?? []).forEach((listener) => (listener as (value: unknown) => void)(value));
  }
}
