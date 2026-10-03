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

import type { CitySource } from "./citySource";
import type { MapMessage, SpriteView, StateMessage, StateMessageType, TileChange } from "./protocol";
import { BIT_MASK } from "./tileFlags";
import { TILE_INVALID } from "./tileValues";

// The client's copy of the city, built from the state messages a city source sends and nothing else: the map, kept
// up to date by tile changes, and the latest message of each other type since the city started. The client draws from
// it, and its parts follow the messages they show.

export type MessageOf<T extends StateMessageType> = Extract<StateMessage, {type: T}>;

type MapTiles = Pick<MapMessage, "width" | "height" | "tiles">;

// The client's copy of the map: each tile's raw value, with its flags, as the last map and tiles messages left it
export class ClientMap {
  width = 0;
  height = 0;
  private tiles: number[] = [];

  // From a map message, or a map preview, which holds a map the same way
  constructor(message: MapTiles) {
    this.replace(message);
  }

  // The whole map again, as a city starts
  replace(message: MapTiles): void {
    this.width = message.width;
    this.height = message.height;
    this.tiles = [...message.tiles];
  }

  change(changes: TileChange[]): void {
    changes.forEach(({x, y, value}) => {
      this.tiles[y * this.width + x] = value;
    });
  }

  testBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  // The tile's value without its flags
  getTileValue(x: number, y: number): number {
    if (!this.testBounds(x, y)) {
      throw new Error(`Tile (${x}, ${y}) is off the map`);
    }

    return this.tiles[y * this.width + x] & BIT_MASK;
  }

  // Fills result, row by row, with the raw values of the w by h tiles from (x, y), TILE_INVALID off the map
  getTileValuesForPainting(x: number, y: number, w: number, h: number, result: number[]): number[] {
    for (let row = 0; row < h; row++) {
      for (let column = 0; column < w; column++) {
        const mapX = x + column;
        const mapY = y + row;
        result[row * w + column] = this.testBounds(mapX, mapY) ? this.tiles[mapY * this.width + mapX] : TILE_INVALID;
      }
    }

    return result;
  }
}

type Listeners = {[T in StateMessageType]?: ((message: MessageOf<T>) => void)[]};
type Latest = {[T in StateMessageType]?: MessageOf<T>};

export class CityState {
  private clientMap: ClientMap | null = null;
  private latestMessages: Latest = {};
  private readonly listeners: Listeners = {};

  constructor(source: Pick<CitySource, "subscribe">) {
    source.subscribe((message) => this.receive(message));
  }

  // The map, once a city has started
  get map(): ClientMap {
    if (this.clientMap === null) {
      throw new Error("No city has started");
    }

    return this.clientMap;
  }

  // The sprites as the last sprites message placed them
  get sprites(): readonly SpriteView[] {
    return this.latest("sprites")?.sprites ?? [];
  }

  // The latest message of the type, or null before any has come
  latest<T extends StateMessageType>(type: T): MessageOf<T> | null {
    return (this.latestMessages[type] as MessageOf<T> | undefined) ?? null;
  }

  // The latest message of the type, which a started city has sent
  current<T extends StateMessageType>(type: T): MessageOf<T> {
    const message = this.latest(type);
    if (message === null) {
      throw new Error(`The city has sent no ${type} message`);
    }

    return message;
  }

  // Calls the listener with each message of the type from now on, once the copy has taken it in
  on<T extends StateMessageType>(type: T, listener: (message: MessageOf<T>) => void): void {
    const listeners = (this.listeners[type] ?? []) as ((message: MessageOf<T>) => void)[];
    listeners.push(listener);
    (this.listeners as Record<T, ((message: MessageOf<T>) => void)[]>)[type] = listeners;
  }

  private receive(message: StateMessage): void {
    if (message.type === "map") {
      // A new city: nothing the city before it sent holds for it
      this.latestMessages = {};
      if (this.clientMap === null) {
        this.clientMap = new ClientMap(message);
      } else {
        this.clientMap.replace(message);
      }
    } else if (message.type === "tiles") {
      this.map.change(message.changes);
    }

    (this.latestMessages as Record<string, StateMessage>)[message.type] = message;
    const listeners = (this.listeners[message.type] ?? []) as ((message: StateMessage) => void)[];
    listeners.forEach((listener) => listener(message));
  }
}
