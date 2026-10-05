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

import type { ServerCities } from "./cityLink";
import type { StartedCity } from "./citySource";
import { CityListView } from "./cityListView";
import { ClientMap } from "./cityState";
import { ClientConfig } from "./clientConfig";
import { isChecked, isShown, requiredElement, setShown } from "./domElements";
import { errorMessage } from "./errorMessage";
import { GAME_LEVELS, GameLevel } from "./protocol";
import type { QuerySource } from "./querySource";
import type { MapArt } from "./renderAssets";
import { SplashCanvas } from "./splashCanvas";
import type { CityList } from "./storage";
import { UiRandom } from "./uiRandom";

// The splash screen is the first screen the player sees, once the tiles and sprites have loaded and the server has
// welcomed the player. It shows maps for the player to choose from, for a new city on the server; the cities this
// browser started or joined, to join again (cityListView.ts); and Load, which starts a saved game's file on the server
// as a new city. For a new city it then asks for the city's name and level. Generating a map belongs to the
// simulation, so each map comes from the city source, as the answer to a map preview query, which it answers before
// any city has started.

// The radio button of each level a new city can start at
const LEVEL_RADIOS: {level: GameLevel, id: string}[] = [
  {level: "EASY", id: "difficultyEasy"},
  {level: "MED", id: "difficultyMed"},
  {level: "HARD", id: "difficultyHard"},
];

// What the player is told on choosing a city while another is starting
const STILL_STARTING = "Another city is starting: wait for it, then choose again.";

// The number of the level checked
function checkedLevel(): number {
  const radio = LEVEL_RADIOS.find(({id}) => isChecked(id));
  if (radio === undefined) {
    throw new Error("The start form has no level checked");
  }

  return GAME_LEVELS.indexOf(radio.level);
}

// What the splash screen is made from: the source, which answers the map previews and starts and joins cities on the
// server, and the map's art the previews are drawn with
export interface SplashParts {
  source: ServerCities & QuerySource;
  mapArt: MapArt;
}

// What becomes of the city the player chooses
export interface Lobby {
  // The cities this browser started or joined
  cities: CityList;
  // Plays the city that started or was joined
  play(started: StartedCity): void;
}

// Shows the splash screen, first offering the map of the seed, or of a new one when given none. While the screen is too
// small to play, it waits until a resize makes room.
export function showSplashScreen(parts: SplashParts, seed: number | null, lobby: Lobby): void {
  if (!isShown(requiredElement("tooSmall"))) {
    new SplashScreen(parts, seed, lobby);
    return;
  }

  const onResize = () => {
    window.removeEventListener("resize", onResize);
    showSplashScreen(parts, seed, lobby);
  };
  window.addEventListener("resize", onResize);
}

class SplashScreen {
  private readonly splash = requiredElement("splash");
  private readonly seedText = requiredElement("splashSeed");
  private readonly generateButton = requiredElement("splashGenerate");
  private readonly playButton = requiredElement("splashPlay");
  private readonly loadButton = requiredElement("splashLoad");
  private readonly fileInput = requiredElement("splashLoadInput", HTMLInputElement);
  // The form asking for a new city's name and level
  private readonly start = requiredElement("start");
  private readonly playForm = requiredElement("playForm");
  private readonly nameInput = requiredElement("nameForm", HTMLInputElement);

  // The game seed of the map the player has chosen, whose preview may yet be on its way
  private seed: number;
  private readonly splashCanvas: SplashCanvas;
  private readonly cityList: CityListView;
  // Whether the player has moved on, to a new city or another
  private departed = false;
  // Whether a city is starting or being joined, which the player waits for
  private loading = false;

  private readonly onGenerate = (e: Event) => {
    e.preventDefault();
    this.choose(UiRandom.newSeed());
  };

  private readonly onLoad = (e: Event) => {
    e.preventDefault();
    this.fileInput.click();
  };

  // Starts the game saved in the chosen file as a new city. The file holds a saved game's text.
  private readonly onFileChosen = () => {
    const file = this.fileInput.files?.[0];
    // Choosing the same file again, after it failed, is a change too
    this.fileInput.value = "";
    if (file === undefined) {
      return;
    }

    // A change event has no caller to wait: the city starts from here once the file is read
    void file.text().then((text) => {
      // The player moved on while the file was read
      if (this.departed) {
        return;
      }

      // A file that reads as a save can still fail to start, which launch tells the player, so nothing waits on it
      void this.launch(() => this.parts.source.start({save: text}),
                       (reason) => alert(`Could not start ${file.name}: ${reason}`));
    });
  };

  // Moves on from the chosen map to the form asking for the city's name and level
  private readonly onPlay = (e: Event) => {
    e.preventDefault();

    if (this.loading) {
      alert(STILL_STARTING);
      return;
    }

    this.leave();

    // As a convenience, the city name is not mandatory in debug mode
    if (ClientConfig.debug) {
      this.nameInput.removeAttribute("required");
    }

    this.playForm.addEventListener("submit", this.onSubmit);
    setShown(this.start, true);
    this.nameInput.focus();
  };

  // Starts a new city on the chosen map, with the name and level the player gave. The name may be empty: the start
  // form doesn't require one in debug mode. A city the source can't start, such as one on a server that went away, is
  // said out loud, and the splash screen comes back on the same map.
  private readonly onSubmit = (e: Event) => {
    e.preventDefault();

    this.playForm.removeEventListener("submit", this.onSubmit);
    setShown(this.start, false);

    const start = {name: this.nameInput.value || "MyTown", seed: this.seed, level: checkedLevel()};
    // A submit event has no caller to wait, and launch tells the player of a city that couldn't start
    void this.launch(() => this.parts.source.start(start), (reason) => {
      alert(`The city could not start: ${reason}`);
      showSplashScreen(this.parts, this.seed, this.lobby);
    });
  };

  constructor(private readonly parts: SplashParts, seed: number | null, private readonly lobby: Lobby) {
    this.splashCanvas = new SplashCanvas("splashContainer", parts.mapArt);
    this.seed = seed === null ? UiRandom.newSeed() : seed;
    this.choose(this.seed);

    this.generateButton.addEventListener("click", this.onGenerate);
    this.playButton.addEventListener("click", this.onPlay);
    this.loadButton.addEventListener("click", this.onLoad);
    this.fileInput.addEventListener("change", this.onFileChosen);

    // A city that can't be joined stays on the list, as a server that couldn't reach its store may yet join it: the
    // player forgets it once it's gone for good. A click has no caller to wait, and launch tells the player of a city
    // that couldn't be joined.
    this.cityList = new CityListView(lobby.cities, (known) => void this.launch(() => parts.source.join(known.city),
      (reason) => alert(`${known.name} can't be joined: ${reason}`)));

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
        this.splashCanvas.paint(new ClientMap(answer));
      }
    });
  }

  // Removes the splash screen's listeners and hides it, letting go of the preview's context
  private leave(): void {
    this.loadButton.removeEventListener("click", this.onLoad);
    this.fileInput.removeEventListener("change", this.onFileChosen);
    this.generateButton.removeEventListener("click", this.onGenerate);
    this.playButton.removeEventListener("click", this.onPlay);
    this.cityList.withdraw();

    setShown(this.splash, false);
    this.splashCanvas.release();
    this.departed = true;
  }

  // Starts or joins a city, and plays it. Every city the player chooses starts here. The splash screen goes only once
  // the city has started or been joined, so one loaded or joined from it that won't start or can't be joined leaves it
  // showing, and the player can choose again; a new city has left it for the start form already, so its failure brings it back. Only one city
  // starts or is joined at a time, and no new one starts while it does, which the player is told. Only the start is
  // caught here: a game that fails to build is a defect, which goes unhandled rather than being taken for a city that
  // couldn't start.
  private async launch(starting: () => Promise<StartedCity>, failed: (reason: string) => void): Promise<void> {
    if (this.loading) {
      alert(STILL_STARTING);
      return;
    }

    this.loading = true;
    let started: StartedCity;
    try {
      started = await starting();
    } catch (err) {
      failed(errorMessage(err));
      return;
    } finally {
      this.loading = false;
    }

    // The preview's context goes before the map's is made
    this.leave();
    this.lobby.play(started);
  }
}
