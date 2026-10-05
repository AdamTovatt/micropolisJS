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

import type { BudgetChoice } from "./budgetWindow";
import type { CarShareStep } from "./carShare";
import type { CitySource } from "./citySource";
import type { CityState } from "./cityState";
import type { DebugAction } from "./debugWindow";
import { ToolPaths } from "./dragPath";
import type { Emitter } from "./emitter";
import { errorMessage } from "./errorMessage";
import type { MouseOutline } from "./gameCanvas";
import type { ChosenTool, InputEvents, PanState, ToolClick } from "./inputStatus";
import type {
  BudgetRecord, CursorTool, DisasterKind, EvaluationRecord, SettingsRecord, TileReportAnswer,
} from "./protocol";
import { QueryTool } from "./queryTool";
import type { ScreenshotArea } from "./screenshotWindow";
import type { ClientSettings, SettingsChoice } from "./settingsWindow";
import * as UiMessages from "./uiMessages";
import type { PixelPoint, TilePoint } from "./viewPosition";
import { addFundsCommand, budgetCommand, disasterCommand, settingsCommands } from "./windowCommands";
import type { GameWindow } from "./windowBase";
import type { WindowManager } from "./windowManager";

// The game's controls: what the player's mouse and keyboard do to the map's view, the tool and this player's hover box,
// and what the windows they open do with the player's choices. Everything here reads the page through the parts it is
// given, so it is tested under Node with stand-ins for them.

// The player's input as the controls read it each tick, and the events it announces (InputStatus)
export interface ControlInput extends Pick<Emitter<InputEvents>, "addEventListener"> {
  readonly tool: ChosenTool | null;
  readonly pointer: PixelPoint | null;
  readonly pan: PanState;
  takeScroll(now: number): TilePoint;
  takeEscape(): boolean;
  clearTool(): void;
  toolColourOf(tool: CursorTool): string;
}

// The map's view as the controls move it and read it (GameCanvas): the map tile drawn under a point of the canvas, in
// CSS pixels, or null past its right or bottom edge, and pictures of the map
export interface ControlView {
  scrollBy(x: number, y: number): void;
  zoomBy(steps: number, point: PixelPoint | null): void;
  tileOnCanvasUnder(x: number, y: number): TilePoint | null;
  screenshotVisible(): string;
  screenshotMap(): string;
}

// The game's windows, which the controls open
export interface ControlWindows {
  budget: GameWindow<[BudgetRecord], BudgetChoice | null>;
  evaluation: GameWindow<[EvaluationRecord], void>;
  disaster: GameWindow<[], DisasterKind | null>;
  debug: GameWindow<[], DebugAction[]>;
  settings: GameWindow<[SettingsRecord, ClientSettings], SettingsChoice | null>;
  screenshot: GameWindow<[], ScreenshotArea | null>;
  screenshotLink: GameWindow<[string], void>;
  save: GameWindow<[], void>;
  touchWarning: GameWindow<[], void>;
  query: GameWindow<[TileReportAnswer], void>;
}

// The other players, as this player's hover box is told to them and theirs are drawn (OtherPlayers)
export interface ControlPlayers {
  reportCursor(tool: CursorTool | null, size: number, tile: TilePoint | null,
               onMap: (x: number, y: number) => boolean): void;
  outlines(toolColour: (tool: CursorTool) => string): MouseOutline[];
}

// What the controls do to the page beyond the map and the windows: say a failure out loud, give the player a file of
// JSON text, pause or run the city, and fold or unfold the minimap
export interface ControlPage {
  alert(message: string): void;
  saveFile(fileName: string, text: string): void;
  togglePause(): void;
  toggleMinimap(): void;
}

// The player's auto-bulldoze preference (AutoBulldozePreference)
export interface ControlPreference {
  isOn(): boolean;
  set(on: boolean): void;
}

// The browser's share of the trips that become cars, a step of the Cars slider (CarSharePreference)
export interface ControlShare {
  step(): CarShareStep;
  set(step: CarShareStep): void;
}

// The mark on the Budget button that a year-end budget review is due
export interface ReviewMarker {
  setLit(lit: boolean): void;
}

// What the controls send to the city and ask of it: commands, queries, saves, downloads and the session's log, and
// whether the end-to-end runner holds its driver (CitySource)
export interface ControlSource extends Pick<CitySource, "ask" | "send" | "save" | "download" | "commandLog"> {
  readonly driver: Pick<CitySource["driver"], "isHeld">;
}

// What the controls read of the city: the records the windows open on, and the map's bounds (CityState)
export interface ControlCity extends Pick<CityState, "current"> {
  readonly map: {testBounds(x: number, y: number): boolean};
}

// What the controls are made from
export interface ControlParts {
  input: ControlInput;
  view: ControlView;
  windows: WindowManager;
  gameWindows: ControlWindows;
  reviewMarker: ReviewMarker;
  source: ControlSource;
  city: ControlCity;
  players: ControlPlayers;
  page: ControlPage;
  autoBulldoze: ControlPreference;
  carShare: ControlShare;
  // The city's seed, which the settings window shows, and its name, which its downloaded save file is named after
  seed: number;
  saveFileName: string;
}

// Each part is held in a field of its own, as Game holds its parts, so that a use reads this.input rather than
// this.parts.input
export class GameControls {
  private readonly input: ControlInput;
  private readonly view: ControlView;
  private readonly windows: WindowManager;
  private readonly gameWindows: ControlWindows;
  private readonly reviewMarker: ReviewMarker;
  private readonly source: ControlSource;
  private readonly city: ControlCity;
  private readonly players: ControlPlayers;
  private readonly page: ControlPage;
  private readonly autoBulldoze: ControlPreference;
  private readonly carShare: ControlShare;
  private readonly seed: number;
  private readonly saveFileName: string;
  private readonly queryTool: QueryTool;
  private readonly toolPaths = new ToolPaths();

  // This player's hover box, as the last tick placed it, or null while none is drawn
  private hover: MouseOutline | null = null;
  // Whether the player can see the city, which decides whether the other players see this player's hover box
  private viewerVisible = false;
  // Whether a save or a download is waiting on the server, which a click on the same button again doesn't repeat: each
  // counts toward the limit on them the server keeps
  private saving = false;
  private downloading = false;

  constructor(parts: ControlParts) {
    this.input = parts.input;
    this.view = parts.view;
    this.windows = parts.windows;
    this.gameWindows = parts.gameWindows;
    this.reviewMarker = parts.reviewMarker;
    this.source = parts.source;
    this.city = parts.city;
    this.players = parts.players;
    this.page = parts.page;
    this.autoBulldoze = parts.autoBulldoze;
    this.carShare = parts.carShare;
    this.seed = parts.seed;
    this.saveFileName = parts.saveFileName;

    // The query window shows the report the query tool asks the simulation for
    this.queryTool = new QueryTool(this.source, (report) => this.show(this.gameWindows.query, report));

    const input = this.input;
    input.addEventListener(UiMessages.EVAL_REQUESTED,
                           () => this.show(this.gameWindows.evaluation, this.city.current("evaluation")));
    input.addEventListener(UiMessages.BUDGET_REQUESTED, () => this.openBudget());
    input.addEventListener(UiMessages.DISASTER_REQUESTED, () => this.openDisasters());
    input.addEventListener(UiMessages.DEBUG_WINDOW_REQUESTED, () => this.openDebug());
    input.addEventListener(UiMessages.SETTINGS_WINDOW_REQUESTED, () => this.openSettings());
    input.addEventListener(UiMessages.SCREENSHOT_WINDOW_REQUESTED, () => this.openScreenshot());
    input.addEventListener(UiMessages.SAVE_REQUESTED, () => this.save());
    input.addEventListener(UiMessages.DOWNLOAD_REQUESTED, () => this.download());
    input.addEventListener(UiMessages.TOOL_CLICKED, (click) => this.useTool(click));
    input.addEventListener(UiMessages.PAUSE_REQUESTED, () => this.page.togglePause());
    input.addEventListener(UiMessages.MINIMAP_TOGGLE_REQUESTED, () => this.page.toggleMinimap());
    // A window holding the keyboard and mouse holds back a zoom, as it holds back scrolling
    input.addEventListener(UiMessages.ZOOM_REQUESTED, ({steps, point}) => {
      if (!this.windows.holdsInput()) {
        this.view.zoomBy(steps, point);
      }
    });
  }

  // One tick of the game's input, at the time given in milliseconds: the view scrolls for the keys held, Escape closes
  // the window showing or else clears the tool, the tiles the tool reached go as commands, and this player's hover box
  // moves to the tile under the pointer, where the other players are told it is.
  //
  // The source applies the commands it is sent whether or not the city is stepping: you can build when paused. While the
  // end-to-end runner holds the source's driver, it sends the tool paths itself, so that how a drag splits into
  // commands never depends on when ticks ran.
  tick(now: number): void {
    const scroll = this.input.takeScroll(now);
    this.view.scrollBy(scroll.x, scroll.y);

    if (this.input.takeEscape()) {
      if (this.windows.holdsInput()) {
        this.windows.closeShown();
      } else {
        this.input.clearTool();
      }
    }

    if (!this.source.driver.isHeld()) {
      this.sendToolPaths();
    }

    this.hover = this.hoverBox();
    this.reportCursor();
  }

  // Sends each path gathered since the last tick as one tool command: a click, or a drag's latest tiles
  sendToolPaths(): void {
    this.toolPaths.take().forEach((toolPath) => {
      this.source.send({type: "tool", tool: toolPath.tool, path: toolPath.path,
                        autoBulldoze: this.autoBulldoze.isOn()});
    });
  }

  // The map tile under the pointer that this player's hover box is drawn at, or null while none is
  get hoverTile(): TilePoint | null {
    return this.hover === null ? null : {x: this.hover.x, y: this.hover.y};
  }

  // The outlines to draw over the map: the other players' hover boxes, named, under this player's own
  outlines(): MouseOutline[] {
    const outlines = this.players.outlines((tool) => this.input.toolColourOf(tool));

    if (this.hover !== null) {
      outlines.push(this.hover);
    }

    return outlines;
  }

  // Notes whether the player can see the city, as the page's visibility and size change
  setViewerVisible(visible: boolean): void {
    this.viewerVisible = visible;
  }

  // Opens the budget window on the budget record unless another is showing, however the player asked for it, and says
  // whether it did. Opening it is the review of any that fell due. It sends the budget the player chooses with OK.
  openBudget(): boolean {
    const choosing = this.windows.open(this.gameWindows.budget, this.city.current("budget"));
    if (choosing === null) {
      return false;
    }

    this.reviewMarker.setLit(false);
    this.whenChosen(choosing, (choice) => {
      if (choice !== null) {
        this.source.send(budgetCommand(choice.funding, choice.tax));
      }
    });

    return true;
  }

  // The year end paid for the services with the player's values, which the player is offered to review. The budget
  // window never opens unasked, since in a shared city it would open for every player at once: the marker shows until
  // this player opens it.
  budgetReviewDue(): void {
    this.reviewMarker.setLit(true);
  }

  // Warns a player on a touch device that the game is made for a mouse, unless a window is showing
  warnOfTouch(): void {
    this.show(this.gameWindows.touchWarning);
  }

  // The tool's outline at the map tile under the pointer: not while a window holds the mouse, no tool is chosen, the
  // pointer is off the map's canvas, or Space readies a pan or a pan holds the map, so the others don't see it either
  private hoverBox(): MouseOutline | null {
    const tool = this.input.tool;
    const pointer = this.input.pointer;
    if (this.windows.holdsInput() || tool === null || pointer === null || this.input.pan !== "free") {
      return null;
    }

    const tile = this.view.tileOnCanvasUnder(pointer.x, pointer.y);
    if (tile === null) {
      return null;
    }

    return {x: tile.x, y: tile.y, width: tool.width, height: tool.width, colour: this.input.toolColourOf(tool.name),
            label: null};
  }

  // Tells the others where this player's hover box is: nowhere while it isn't drawn, or while the player can't see the
  // city, such as in a hidden tab, where the pointer may never leave the canvas
  private reportCursor(): void {
    const tool = this.input.tool;
    const tile = this.viewerVisible ? this.hoverTile : null;

    this.players.reportCursor(tool?.name ?? null, tool?.width ?? 0, tile,
                              (x, y) => this.city.map.testBounds(x, y));
  }

  // The tiles the player's tool reaches gather into paths (see ToolPaths), sent each tick by sendToolPaths. The query
  // tool asks for the report of the tile clicked instead.
  private useTool(click: ToolClick): void {
    const tile = this.view.tileOnCanvasUnder(click.x, click.y);
    const tool = this.input.tool;
    if (tile === null || tool === null) {
      this.toolPaths.lost();
      return;
    }

    // The view may show a margin around the map, where there is no tile to report on
    if (tool.name === "query") {
      if (this.city.map.testBounds(tile.x, tile.y)) {
        this.queryTool.query(tile.x, tile.y);
      }
      return;
    }

    this.toolPaths.reached(tool.name, {x: tile.x, y: tile.y}, click.start);
  }

  // Opens a window whose closing has no choice to act on
  private show<Args extends unknown[]>(window: GameWindow<Args, void>, ...args: Args): void {
    // Nothing waits on the window closing: the manager lets go of the input itself
    void this.windows.open(window, ...args);
  }

  // Acts on the choice a window closes with, or on nothing when it didn't open, as when another is showing
  private whenChosen<Choice>(choosing: Promise<Choice> | null, act: (choice: Choice) => void): void {
    // Nothing waits on the act: the player chooses in their own time, and the act is all there is to do with it
    void choosing?.then(act);
  }

  private openDisasters(): void {
    this.whenChosen(this.windows.open(this.gameWindows.disaster), (kind) => {
      if (kind !== null) {
        this.source.send(disasterCommand(kind));
      }
    });
  }

  private openDebug(): void {
    this.whenChosen(this.windows.open(this.gameWindows.debug), (actions) => {
      actions.forEach((action) => {
        if (action === "addFunds") {
          this.source.send(addFundsCommand());
        } else {
          this.downloadLog();
        }
      });
    });
  }

  // The city settings as the window shows them, which its choices are compared with when it closes: the city keeps
  // running behind the window (settingsCommands)
  private openSettings(): void {
    const shown = this.city.current("settings");
    const client = {autoBulldoze: this.autoBulldoze.isOn(), carShare: this.carShare.step(), seed: this.seed};

    this.whenChosen(this.windows.open(this.gameWindows.settings, shown, client), (choice) => {
      if (choice === null) {
        return;
      }

      this.autoBulldoze.set(choice.autoBulldoze);
      this.carShare.set(choice.carShare);
      settingsCommands(shown, choice).forEach((command) => {
        this.source.send(command);
      });
    });
  }

  // The picture is taken in the client, and the link to it opens in the screenshot window's place
  private openScreenshot(): void {
    this.whenChosen(this.windows.open(this.gameWindows.screenshot), (area) => {
      if (area === null) {
        return;
      }

      const dataURI = area === "visible" ? this.view.screenshotVisible() : this.view.screenshotMap();
      this.show(this.gameWindows.screenshotLink, dataURI);
    });
  }

  // Saves the session's command log as a file, for the headless runner to replay:
  // `dotnet run --project server/Micropolis.Headless -- --log <file>`. A log the source can't give is said out loud, as
  // a save is.
  private downloadLog(): void {
    this.source.commandLog().then((recorded) => {
      this.page.saveFile(`micropolis-log-${recorded.step}.json`, JSON.stringify(recorded.log));
    }, (error: unknown) => this.page.alert(`The command log couldn't be downloaded: ${errorMessage(error)}`));
  }

  // The server keeps the city in its store, and the window opens once it has. A save the server refuses, or one on a
  // server the connection to is down, is said out loud.
  private save(): void {
    if (this.saving) {
      return;
    }

    this.saving = true;
    this.source.save().then(() => {
      this.show(this.gameWindows.save);
    }, (error: unknown) => this.page.alert(`The city couldn't be saved: ${errorMessage(error)}`))
      .finally(() => {
        this.saving = false;
      });
  }

  // Gives the player the city's save as a file named after the city, which Load on the splash screen starts again as
  // a new city. A download the server refuses, or one on a server the connection to is down, is said out loud.
  private download(): void {
    if (this.downloading) {
      return;
    }

    this.downloading = true;
    this.source.download().then((text) => {
      this.page.saveFile(this.saveFileName, text);
    }, (error: unknown) => this.page.alert(`The city couldn't be downloaded: ${errorMessage(error)}`))
      .finally(() => {
        this.downloading = false;
      });
  }
}
