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

// The base of a client object that announces what the player does, such as a button clicked or a tool used, to the
// listeners added for each event, by its name from uiMessages.ts. Events maps each event's name to the type of the
// value it carries, undefined for none, so a listener receives that type and an emit can only send it. The simulation's
// events are its own (EventEmitter in the C# rules), and reach the client only as state messages.
export class Emitter<Events extends object> {
  private readonly listeners = new Map<keyof Events, ((value: never) => void)[]>();

  // Calls the listener with each value the event carries from now on; a listener added twice is called once
  addEventListener<Event extends keyof Events>(event: Event, listener: (value: Events[Event]) => void): void {
    const listeners = this.listeners.get(event) ?? [];
    if (!listeners.includes(listener)) {
      listeners.push(listener);
    }

    this.listeners.set(event, listeners);
  }

  // An event that carries undefined is emitted without a value
  protected emit<Event extends keyof Events>(event: Event,
                                             ...value: undefined extends Events[Event] ? [] : [Events[Event]]): void {
    const listeners = (this.listeners.get(event) ?? []) as ((value: Events[Event] | undefined) => void)[];
    listeners.forEach((listener) => listener(value[0]));
  }
}
