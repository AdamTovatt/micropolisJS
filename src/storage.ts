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

import { CITY_ID } from "./protocol";

// What the page keeps in the browser's localStorage, such as the player's session and settings and the cities this
// browser started or joined. Each thing kept is under a key of its own, which the module keeping it owns, and is read
// and written through StoredText. The cities themselves are kept on the server.

// The JSON value of a stored text, or undefined for a text that isn't JSON, as one something other than this page
// wrote may not be
export function parseStored(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// The browser's localStorage, as the page uses it
export type PageStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// The browser's localStorage, or null where the page can't reach it, as where the browser blocks it
export function pageStore(): PageStore | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

// The text kept under a key of the store, which the page also holds itself: where there is no store, or it can't be
// read, or it missed one of this page's writes, as a full or disabled one does, the text is what this page last held,
// for as long as the page is open. Otherwise it is read from the store each time, so the browser's tabs share it.
export class StoredText {
  private held: string | null = null;
  // Whether the store missed this page's last write or removal, so the page holds what it has
  private behind = false;

  constructor(private readonly store: PageStore | null, private readonly key: string) {}

  read(): string | null {
    if (this.store === null || this.behind) {
      return this.held;
    }

    try {
      this.held = this.store.getItem(this.key);
    } catch {
      // Held as this page last had it, as the store can't be read
    }

    return this.held;
  }

  write(text: string): void {
    this.held = text;
    this.keep((store) => store.setItem(this.key, text));
  }

  remove(): void {
    this.held = null;
    this.keep((store) => store.removeItem(this.key));
  }

  private keep(change: (store: PageStore) => void): void {
    try {
      if (this.store !== null) {
        change(this.store);
      }
      this.behind = false;
    } catch {
      this.behind = true;
    }
  }
}

export const CITY_LIST_KEY = "micropolisJSCities";

// A city on the server this browser started or joined: its id, and its name, which the list shows
export interface KnownCity {
  city: string;
  name: string;
}

// The cities in the list's text, or null when the text isn't a list of them
function parseCities(text: string): KnownCity[] | null {
  const value = parseStored(text);
  const isCity = (entry: unknown): entry is KnownCity => isObject(entry) &&
    typeof entry.city === "string" && CITY_ID.test(entry.city) && typeof entry.name === "string";

  return Array.isArray(value) && value.every(isCity) ? value.map(({city, name}) => ({city, name})) : null;
}

// The cities this browser started or joined, the one played last first. A stored list that isn't one, written by
// something other than this page, starts again, which is said.
export class CityList {
  private readonly text: StoredText;

  constructor(store: PageStore | null) {
    this.text = new StoredText(store, CITY_LIST_KEY);
  }

  cities(): KnownCity[] {
    const text = this.text.read();
    const cities = text === null ? [] : parseCities(text);
    if (cities === null) {
      console.warn(`The list of cities this browser played isn't one, so it starts again: ${text}`);
    }

    return cities ?? [];
  }

  // Puts the city first, in place of any entry it had
  remember(city: KnownCity): void {
    this.keep([{city: city.city, name: city.name}, ...this.cities().filter((known) => known.city !== city.city)]);
  }

  // Takes the city with the id off the list
  forget(city: string): void {
    this.keep(this.cities().filter((known) => known.city !== city));
  }

  private keep(cities: KnownCity[]): void {
    this.text.write(JSON.stringify(cities));
  }
}
