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

import { Displayable, appendElement, requiredElement, setShown } from "./domElements";
import { MessageTone, Text } from "./text";
import type { TilePoint } from "./viewPosition";

// The bar along the bottom of the map that announces a message for a while, coloured by its tone. A message about a
// place on the map is a link, which the bar says beside the text: clicking the bar centres the map there. An offer,
// such as the year-end budget's, is a message with an action of its own, which clicking the bar runs instead.

const ELEMENT_ID = "notifications";
const TIMEOUT_SECS = 30;
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

// The parts of the bar: its element, an E, the element its text shows in, and the "Go there" the bar shows beside the
// text of a message that links to a place
export interface BarParts<E extends BarElement<E>> {
  bar: E;
  text: {textContent: string | null};
  goThere: E;
}

// What the bar reads and writes of its element, an E
export interface BarElement<E> extends Displayable<E> {
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
  // Non-null exactly while the bar shows a message
  private timeout: ReturnType<typeof setTimeout> | null = null;
  // The tile a click on the bar centres the map on, or null when the message has none
  private link: TilePoint | null = null;
  // What a click on an offer does, which says whether it was done, or null when the bar shows news
  private action: (() => boolean) | null = null;

  constructor(private readonly parts: BarParts<E>, private readonly map: CentringMap) {
    this.parts.bar.addEventListener("click", (e) => {
      e.preventDefault();

      if (this.action !== null) {
        if (this.action()) {
          this.dismiss();
        }
      } else if (this.link !== null) {
        this.map.centreOn(this.link.x, this.link.y);
      }
    });

    this.close();
  }

  // Announces the message in its tone, for TIMEOUT_SECS from now, in place of any message showing
  show(message: NotificationMessage): void {
    this.announce(message, null);
  }

  // Offers the action under the message, if the bar shows nothing: an offer is a hint, which takes no message's place,
  // and news replaces it. A click on the bar runs the action, and hides the bar once the action was done.
  offer(message: NotificationMessage, action: () => boolean): void {
    if (this.timeout === null) {
      this.announce(message, action);
    }
  }

  // Hides the bar now, before its time is up: the end-to-end runner's screenshots would otherwise show it or not
  // depending on how long the run took
  dismiss(): void {
    this.cancelTimeout();
    this.close();
  }

  private announce(message: NotificationMessage, action: (() => boolean) | null): void {
    const view = notificationView(message);

    this.cancelTimeout();

    this.parts.bar.classList.remove(...TONES);
    this.parts.bar.classList.add(view.tone);
    this.parts.bar.classList.toggle("pointer", action !== null || view.link !== null);
    this.parts.text.textContent = view.text;
    setShown(this.parts.goThere, action === null && view.link !== null);
    this.link = view.link;
    this.action = action;

    setShown(this.parts.bar, true);

    this.timeout = setTimeout(() => {
      this.timeout = null;
      this.close();
    }, TIMEOUT_SECS * 1000);
  }

  private cancelTimeout(): void {
    if (this.timeout !== null) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  private close(): void {
    setShown(this.parts.bar, false);
  }
}

// The bar in the page's notification element, its text and "Go there" made in it
export function placeNotificationBar(map: CentringMap): NotificationBar<HTMLElement> {
  const bar = requiredElement(ELEMENT_ID);
  const text = appendElement(bar, "span", "notificationText");
  const goThere = appendElement(bar, "span", "notificationGoThere");
  goThere.textContent = "Go there";
  return new NotificationBar({bar, text, goThere}, map);
}
