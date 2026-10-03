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

import type { CityStart } from "./citySource";
import { Config } from "./config.js";
import { isChecked, isShown, requiredElement, setShown } from "./domElements";
import { Game, GameParts } from "./game";
import { GAME_LEVELS, GameLevel, MapPreviewAnswer } from "./protocol";
import { PreviewMap, SplashCanvas } from "./splashCanvas";
import { Storage } from "./storage";
import { UiRandom } from "./uiRandom";

// The splash screen is the first screen the player sees, once the tiles and sprites have loaded. It shows maps for the
// player to choose from, or loads a saved game; for a new game it then asks for the city's name and level, and
// launches the game. Generating a map belongs to the simulation, so each map comes from the city source, as the answer
// to a map preview query, which it answers before any city has started.

// The radio button of each level a new city can start at
const LEVEL_RADIOS: {level: GameLevel, id: string}[] = [
  {level: "EASY", id: "difficultyEasy"},
  {level: "MED", id: "difficultyMed"},
  {level: "HARD", id: "difficultyHard"},
];

// The number of the level checked
function checkedLevel(): number {
  const radio = LEVEL_RADIOS.find(({id}) => isChecked(id));
  if (radio === undefined) {
    throw new Error("The start form has no level checked");
  }

  return GAME_LEVELS.indexOf(radio.level);
}

// A preview's tiles as the splash canvas reads them
function previewMap(answer: MapPreviewAnswer): PreviewMap {
  return {
    width: answer.width,
    height: answer.height,
    getTileValue: (x, y) => answer.tiles[y * answer.width + x],
  };
}

// Shows the splash screen, first offering the map of the seed, or of a new one when given none. While the screen is too
// small to play, it waits until a resize makes room.
export function showSplashScreen(parts: GameParts, seed: number | null): void {
  if (!isShown(requiredElement("tooSmall"))) {
    new SplashScreen(parts, seed);
    return;
  }

  const onResize = () => {
    window.removeEventListener("resize", onResize);
    showSplashScreen(parts, seed);
  };
  window.addEventListener("resize", onResize);
}

class SplashScreen {
  private readonly splash = requiredElement("splash");
  private readonly seedText = requiredElement("splashSeed");
  private readonly generateButton = requiredElement("splashGenerate");
  private readonly playButton = requiredElement("splashPlay");
  private readonly loadButton = requiredElement("splashLoad", HTMLButtonElement);
  private readonly loadFileButton = requiredElement("splashLoadFile");
  private readonly fileInput = requiredElement("splashLoadFileInput", HTMLInputElement);
  // The form asking for a new city's name and level
  private readonly start = requiredElement("start");
  private readonly playForm = requiredElement("playForm");
  private readonly nameInput = requiredElement("nameForm", HTMLInputElement);

  // The game seed of the map the player has chosen, whose preview may yet be on its way
  private seed: number;
  private readonly splashCanvas: SplashCanvas;
  // Whether the player has moved on, to a new game or a saved one
  private departed = false;
  // Whether a saved game is being started, which the player waits for
  private loading = false;

  private readonly onGenerate = (e: Event) => {
    e.preventDefault();
    this.choose(UiRandom.newSeed());
  };

  // Fetches the saved game from storage, and launches it
  private readonly onLoad = (e: Event) => {
    e.preventDefault();

    const text = Storage.getSavedText();
    if (text !== null) {
      this.launchSavedGame(text, (err) => alert(`The saved game would not load: ${err}`));
    }
  };

  private readonly onChooseFile = (e: Event) => {
    e.preventDefault();
    this.fileInput.click();
  };

  // Launches the game saved in the chosen file. The file holds the text the game saves to storage.
  private readonly onFileChosen = () => {
    const file = this.fileInput.files?.[0];
    // Choosing the same file again, after it failed, is a change too
    this.fileInput.value = "";
    if (file === undefined) {
      return;
    }

    void file.text().then((text) => {
      // The player moved on while the file was read
      if (this.departed) {
        return;
      }

      // A file that reads as a save can still fail to load
      this.launchSavedGame(text, (err) => alert(`Could not read ${file.name}: ${err}`));
    });
  };

  // Moves on from the chosen map to the form asking for the city's name and level
  private readonly onPlay = (e: Event) => {
    e.preventDefault();

    // A saved game is starting
    if (this.loading) {
      return;
    }

    this.leave();

    // As a convenience, the city name is not mandatory in debug mode
    if (Config.debug) {
      this.nameInput.removeAttribute("required");
    }

    this.playForm.addEventListener("submit", this.onSubmit);
    setShown(this.start, true);
    this.nameInput.focus();
  };

  // Launches a new game on the chosen map, with the name and level the player gave. The name may be empty: the start
  // form doesn't require one in debug mode.
  private readonly onSubmit = (e: Event) => {
    e.preventDefault();

    this.playForm.removeEventListener("submit", this.onSubmit);
    setShown(this.start, false);

    void this.startGame({name: this.nameInput.value || "MyTown", seed: this.seed, level: checkedLevel()});
  };

  constructor(private readonly parts: GameParts, seed: number | null) {
    this.splashCanvas = new SplashCanvas("splashContainer", parts.tileSet);
    this.seed = seed === null ? UiRandom.newSeed() : seed;
    this.choose(this.seed);

    this.generateButton.addEventListener("click", this.onGenerate);
    this.playButton.addEventListener("click", this.onPlay);
    this.loadButton.addEventListener("click", this.onLoad);

    // Debug mode can open a save file, such as an end-to-end checkpoint's, to reproduce what it shows
    if (Config.debug) {
      requiredElement("splashLoadFileContainer").classList.remove("hidden");
      this.loadFileButton.addEventListener("click", this.onChooseFile);
      this.fileInput.addEventListener("change", this.onFileChosen);
    }

    // Saving needs storage, and loading needs a game saved there
    requiredElement("saveRequest", HTMLButtonElement).disabled = !Storage.canStore;
    this.loadButton.disabled = !(Storage.canStore && Storage.getSavedText() !== null);

    setShown(this.splash, true);
    this.playButton.focus();
  }

  // Chooses the map of the game seed, shows the seed, and paints the map once the source answers with it, unless the
  // player has chosen another by then
  private choose(seed: number): void {
    this.seed = seed;
    this.seedText.textContent = String(seed);

    this.parts.source.ask({type: "mapPreview", seed}, (answer) => {
      if (answer.type !== "mapPreview") {
        throw new Error(`The source answered a map preview with ${JSON.stringify(answer)}`);
      }

      if (answer.seed === this.seed) {
        this.splashCanvas.paint(previewMap(answer));
      }
    });
  }

  // Removes the splash screen's listeners and hides it
  private leave(): void {
    this.loadButton.removeEventListener("click", this.onLoad);
    this.loadFileButton.removeEventListener("click", this.onChooseFile);
    this.fileInput.removeEventListener("change", this.onFileChosen);
    this.generateButton.removeEventListener("click", this.onGenerate);
    this.playButton.removeEventListener("click", this.onPlay);

    setShown(this.splash, false);
    this.departed = true;
  }

  // The game starts before the splash screen goes, so a save that won't load leaves it showing, and the player can
  // choose again. Only one saved game starts at a time, and no new one while it does.
  private launchSavedGame(text: string, failed: (reason: string) => void): void {
    if (this.loading) {
      return;
    }

    this.loading = true;
    this.startGame({save: text}).then(() => {
      this.loading = false;
      this.leave();
    }, (err: unknown) => {
      this.loading = false;
      failed(err instanceof Error ? err.message : String(err));
    });
  }

  // Starts the city, then the game
  private async startGame(start: CityStart): Promise<void> {
    new Game(this.parts, await this.parts.source.start(start));
  }
}
