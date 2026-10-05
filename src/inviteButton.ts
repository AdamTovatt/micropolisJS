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

import { inviteLink } from "./cityLink";
import { requiredElement, setShown } from "./domElements";

// The button in the Online panel, beside the list of who is online, that copies the invite link of the city the page is
// in, shown once the page is in a city. Where the clipboard is refused, as on an insecure origin, which has none, or
// where the player denied it, the link shows instead in a field, selected for the player to copy by hand, until it
// loses the focus.

// How long the button says it copied the link, in milliseconds
const COPIED_FOR = 2000;

export class InviteButton {
  private readonly button = requiredElement("inviteCopy");
  private readonly field = requiredElement("inviteLink", HTMLInputElement);
  // The button's own text, as the page gives it, which it says again once it has said it copied
  private readonly label = this.button.textContent;
  private link = "";
  // The timer that puts the button's own text back after it said it copied, or undefined for none
  private copied: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // A click has no caller to wait, and copy shows the field where the clipboard is refused
    this.button.addEventListener("click", () => void this.copy());
    this.field.addEventListener("blur", () => setShown(this.field, false));
  }

  // Offers the invite link of the city the page is in
  offer(city: string): void {
    this.link = inviteLink(window.location.href, city);
    setShown(this.button, true);
  }

  private async copy(): Promise<void> {
    // The type says the clipboard is always there, but outside a secure context it isn't
    const clipboard = navigator.clipboard as Clipboard | undefined;
    const copied = clipboard !== undefined && await clipboard.writeText(this.link).then(() => true, () => false);

    clearTimeout(this.copied);
    this.copied = undefined;
    if (!copied) {
      this.button.textContent = this.label;
      this.showField();
      return;
    }

    this.button.textContent = "Copied";
    this.copied = setTimeout(() => {
      this.button.textContent = this.label;
      this.copied = undefined;
    }, COPIED_FOR);
  }

  private showField(): void {
    this.field.value = this.link;
    setShown(this.field, true);
    this.field.focus();
    this.field.select();
  }
}
