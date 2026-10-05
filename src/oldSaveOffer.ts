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

import { requiredElement, setShown } from "./domElements";
import { downloadJson } from "./download";
import type { StoredText } from "./storage";

// A game the browser kept in its localStorage before cities were kept on the server, which the splash screen offers
// to start on the server as a new city, to download as a file, or to discard, until the player has done one of them.
// The browser stops keeping it then. A start that fails keeps it, as the splash screen says, so the player can try
// again or choose otherwise; so does a start refused while another city starts, and a page closed before the start
// is answered. The page hands the save's text on unread, as Load does a file's.

// The key the page kept its saved game under
export const OLD_SAVE_KEY = "micropolisJSGame";

// The file the save is given to the player as, since the page doesn't read the city's name out of it
const OLD_SAVE_FILE = "micropolis-saved-city.json";

// Starts the save's text as a new city, and whether it started. One that didn't is said by what starts it.
export type StartSave = (text: string) => Promise<boolean>;

// The offer on the splash screen, shown while the browser keeps such a save
export class OldSaveOffer {
  private readonly panel = requiredElement("splashOldSave");
  private readonly startButton = requiredElement("splashOldSaveStart");
  private readonly downloadButton = requiredElement("splashOldSaveDownload");
  private readonly discardButton = requiredElement("splashOldSaveDiscard");

  private readonly onStart = (e: Event) => {
    e.preventDefault();

    const text = this.take();
    if (text !== null) {
      void this.startSave(text).then((started) => {
        if (started) {
          this.saved.remove();
        }
      });
    }
  };

  private readonly onDownload = (e: Event) => {
    e.preventDefault();

    const text = this.take();
    if (text !== null) {
      downloadJson(OLD_SAVE_FILE, text);
      this.done();
    }
  };

  private readonly onDiscard = (e: Event) => {
    e.preventDefault();
    this.done();
  };

  constructor(private readonly saved: StoredText, private readonly startSave: StartSave) {
    if (this.saved.read() !== null) {
      this.startButton.addEventListener("click", this.onStart);
      this.downloadButton.addEventListener("click", this.onDownload);
      this.discardButton.addEventListener("click", this.onDiscard);
      setShown(this.panel, true);
    }
  }

  // Takes the offer off the splash screen as it goes, leaving the save as it is
  withdraw(): void {
    this.startButton.removeEventListener("click", this.onStart);
    this.downloadButton.removeEventListener("click", this.onDownload);
    this.discardButton.removeEventListener("click", this.onDiscard);
    setShown(this.panel, false);
  }

  // The save's text, or null, said out loud, when another of the browser's tabs has dealt with it since
  private take(): string | null {
    const text = this.saved.read();
    if (text === null) {
      alert("The city saved in this browser was already started, downloaded or discarded in another tab.");
      this.withdraw();
    }

    return text;
  }

  // The browser stops keeping the save
  private done(): void {
    this.saved.remove();
    this.withdraw();
  }
}
