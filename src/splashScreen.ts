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

import { Config } from "./config.js";
import { isChecked, isShown, requiredElement, setShown } from "./domElements";
import { Game } from "./game";
import { MapGenerator } from "./mapGenerator.js";
import { Random } from "./random";
import { Simulation } from "./simulation.js";
import { PreviewMap, SplashCanvas } from "./splashCanvas";
import { SavedGame, Storage } from "./storage";
import { TileSet } from "./tileSet";
import { UiRandom } from "./uiRandom";

// The splash screen is the first screen the player sees, once the tiles and sprites have loaded. It generates maps for
// the player to choose from, or loads a saved game; for a new game it then asks for the city's name and level, and
// launches the game.

// A map the player can choose, and the game seed it was generated from
interface MapChoice {
  seed: number;
  map: PreviewMap;
}

// The radio button of each level a new city can start at
const LEVEL_RADIOS: {level: number, id: string}[] = [
  {level: Simulation.LEVEL_EASY, id: "difficultyEasy"},
  {level: Simulation.LEVEL_MED, id: "difficultyMed"},
  {level: Simulation.LEVEL_HARD, id: "difficultyHard"},
];

function checkedLevel(): number {
  const radio = LEVEL_RADIOS.find(({id}) => isChecked(id));
  if (radio === undefined) {
    throw new Error("The start form has no level checked");
  }

  return radio.level;
}

// Shows the splash screen, first offering the map of the seed, or of a new one when given none. While the screen is too
// small to play, it waits until a resize makes room.
export function showSplashScreen(tileSet: TileSet, spriteSheet: HTMLImageElement, seed: number | null): void {
  if (!isShown(requiredElement("tooSmall"))) {
    new SplashScreen(tileSet, spriteSheet, seed);
    return;
  }

  const onResize = () => {
    window.removeEventListener("resize", onResize);
    showSplashScreen(tileSet, spriteSheet, seed);
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

  private choice: MapChoice;
  private readonly splashCanvas: SplashCanvas;
  // Whether the player has moved on, to a new game or a saved one
  private departed = false;

  private readonly onGenerate = (e: Event) => {
    e.preventDefault();

    this.choice = this.generate(null);
    this.splashCanvas.paint(this.choice.map);
  };

  // Fetches the saved game from storage, and launches it
  private readonly onLoad = (e: Event) => {
    e.preventDefault();

    const savedGame = Storage.getSavedGame();
    if (savedGame !== null) {
      this.launchSavedGame(savedGame);
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
      try {
        this.launchSavedGame(Storage.parse(text));
      } catch (err) {
        alert(`Could not read ${file.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  };

  // Moves on from the chosen map to the form asking for the city's name and level
  private readonly onPlay = (e: Event) => {
    e.preventDefault();

    this.leave();

    // As a convenience, the city name is not mandatory in debug mode
    if (Config.debug) {
      this.nameInput.removeAttribute("required");
    }

    this.playForm.addEventListener("submit", this.onSubmit);
    setShown(this.start, true);
    this.nameInput.focus();
  };

  // Launches a new game on the chosen map, with the name and level the player gave
  private readonly onSubmit = (e: Event) => {
    e.preventDefault();

    this.playForm.removeEventListener("submit", this.onSubmit);
    setShown(this.start, false);

    Game.newGame(this.choice.map, this.choice.seed, this.tileSet, this.spriteSheet, checkedLevel(),
                 this.nameInput.value);
  };

  constructor(private readonly tileSet: TileSet, private readonly spriteSheet: HTMLImageElement, seed: number | null) {
    this.choice = this.generate(seed);

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
    this.loadButton.disabled = !(Storage.canStore && Storage.getSavedGame() !== null);

    // Paint the minimap
    this.splashCanvas = new SplashCanvas("splashContainer", tileSet);
    this.splashCanvas.paint(this.choice.map);

    setShown(this.splash, true);
    this.playButton.focus();
  }

  // Generates the map of the game seed, or of a new seed when given none, and shows the seed
  private generate(seed: number | null): MapChoice {
    const chosen = seed === null ? UiRandom.newSeed() : seed;
    const map = MapGenerator(Random.mapStream(chosen));
    this.seedText.textContent = String(chosen);

    return {seed: chosen, map};
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

  // The game is built before the splash screen goes, so a save that won't load leaves it showing
  private launchSavedGame(savedGame: SavedGame): void {
    Game.fromSave(savedGame, this.tileSet, this.spriteSheet);

    this.leave();
  }
}
