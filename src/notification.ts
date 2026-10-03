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

import { Displayable, requiredElement, setShown } from "./domElements";
import { MessageTone, Text } from "./text";
import type { TilePoint } from "./viewPosition";

// The bar along the bottom of the map that announces a message for a while, coloured by its tone. A message about a
// place on the map is a link: clicking the bar centres the map there.

export const NOTIFICATION_ELEMENT_ID = "notifications";
// How long the bar shows a message, on wall time
export const NOTIFICATION_SECS = 30;
const TONES: MessageTone[] = ["good", "bad", "neutral"];

// A message the bar announces: its subject, from messages.ts, and where on the map it happened, if it did somewhere
export interface NotificationMessage {
  subject: string;
  data?: {x?: number, y?: number};
}

// What the bar shows for a message: its text and tone, and the tile clicking the bar centres the map on, or null
export interface NotificationView {
  text: string;
  tone: MessageTone;
  link: TilePoint | null;
}

// The map the bar centres on a message's place
export interface CentringMap {
  centreOn(x: number, y: number): void;
}

// What the bar reads and writes of its element, an E
export interface BarElement<E> extends Displayable<E> {
  textContent: string | null;
  readonly classList: {
    add(token: string): void;
    remove(...tokens: string[]): void;
    toggle(token: string, force: boolean): boolean;
  };
  addEventListener(type: "click", listener: (e: {preventDefault(): void}) => void): void;
}

export function notificationView(message: NotificationMessage): NotificationView {
  const {text, tone} = Text.messages[message.subject];
  const data = message.data;

  if (data !== undefined && data.x !== undefined && data.y !== undefined) {
    return {text, tone, link: {x: data.x, y: data.y}};
  }

  return {text, tone, link: null};
}

export class NotificationBar<E extends BarElement<E>> {
  private timeout: ReturnType<typeof setTimeout> | null = null;
  // The tile a click on the bar centres the map on, or null when the message has none
  private link: TilePoint | null = null;

  constructor(private readonly element: E, private readonly map: CentringMap) {
    this.element.addEventListener("click", (e) => {
      e.preventDefault();

      if (this.link !== null) {
        this.map.centreOn(this.link.x, this.link.y);
      }
    });

    this.close();
  }

  // Announces the message in its tone, for NOTIFICATION_SECS from now
  show(message: NotificationMessage): void {
    const view = notificationView(message);

    if (this.timeout !== null) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    this.element.classList.remove(...TONES);
    this.element.classList.add(view.tone);
    this.element.classList.toggle("pointer", view.link !== null);
    this.element.textContent = view.text;
    this.link = view.link;

    setShown(this.element, true);

    this.timeout = setTimeout(() => {
      this.timeout = null;
      this.close();
    }, NOTIFICATION_SECS * 1000);
  }

  private close(): void {
    setShown(this.element, false);
  }
}

// The bar in the page's notification element
export function placeNotificationBar(map: CentringMap): NotificationBar<HTMLElement> {
  return new NotificationBar(requiredElement(NOTIFICATION_ELEMENT_ID), map);
}
