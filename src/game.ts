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

import { AutoBulldozePreference } from "./autoBulldozePreference";
import { BudgetChoice, BudgetWindow } from "./budgetWindow";
import type { Presence } from "./cityClient";
import { linkToCity } from "./cityLink";
import type { CitySource, StartedCity } from "./citySource";
import { CityState } from "./cityState";
import { ClientConfig } from "./clientConfig";
import { DebugAction, DebugWindow } from "./debugWindow";
import { DisasterWindow } from "./disasterWindow";
import { downloadJson } from "./download";
import { isShown, requiredElement, setShown, toggleShown } from "./domElements";
import { ToolPaths } from "./dragPath";
import { errorMessage } from "./errorMessage";
import { EvaluationWindow } from "./evaluationWindow";
import { GameCanvas, MouseOutline } from "./gameCanvas";
import { InfoBar, placeInfoBar } from "./infoBar";
import { InputStatus, ToolClick, ZoomRequest } from "./inputStatus";
import * as Messages from "./messages";
import { Minimap } from "./minimap";
import { MonsterTV } from "./monsterTV";
import { LastEvent, NewsHold, routeMessage } from "./news";
import { NotificationBar, placeNotificationBar } from "./notification";
import { OtherPlayers } from "./otherPlayers";
import { cityOverlaySource, OverlayPicker } from "./overlayPicker";
import { PaintableSprite, spritesInView } from "./paintable";
import { CommandResult, DisasterKind, NewsMessage, SettingsRecord, ToolName } from "./protocol";
import { QueryTool } from "./queryTool";
import { QueryWindow } from "./queryWindow";
import { placeRCI, RCI } from "./rci";
import { MapArt, tileSetPixels } from "./renderAssets";
import { SaveWindow } from "./saveWindow";
import { ScreenshotLinkWindow } from "./screenshotLinkWindow";
import { ScreenshotArea, ScreenshotWindow } from "./screenshotWindow";
import { SettingsChoice, SettingsWindow } from "./settingsWindow";
import { SpeedControl } from "./speedControl";
import { StatusPanel } from "./statusPanel";
import { pageStore } from "./storage";
import { attachToTestHook } from "./testHook";
import { Text } from "./text";
import { placeToolToast, PlacedToast, toastedFailure } from "./toolToast";
import { TouchWarnWindow } from "./touchWarnWindow";
import * as UiMessages from "./uiMessages";
import type { TilePoint } from "./viewPosition";
import { budgetCommand, disasterCommand, settingsCommands, toolOutcome } from "./windowCommands";
import { WindowManager } from "./windowManager";

// What a game is made from: the city source and the client's copy of its city, the server's word of the other players,
// and the art the map, the monster TV and the splash screen's preview draw with
export interface GameParts {
  source: CitySource;
  state: CityState;
  presence: Presence;
  mapArt: MapArt;
}

// Where sprites are drawn: the view's top-left tile, and the map pixels it shows across and down
interface SpriteViewport {
  getTileOrigin(): TilePoint;
  readonly mapPixelWidth: number;
  readonly mapPixelHeight: number;
}

// A game of the city a source has started. The game reaches the city only through the source: it sends commands and
// queries, and shows the city from the client's copy of it, which the source's state messages build.
export class Game {
  readonly gameCanvas: GameCanvas;

  private readonly source: CitySource;
  private readonly state: CityState;
  private readonly seed: number;
  private readonly autoBulldoze: AutoBulldozePreference;
  private readonly rci: RCI;
  private readonly statusPanel: StatusPanel;
  private readonly infoBar: InfoBar;
  private readonly inputStatus: InputStatus;
  private readonly toolPaths = new ToolPaths();
  private readonly speedControl: SpeedControl;
  readonly monsterTV: MonsterTV;
  private readonly windows: WindowManager;
  private readonly evalWindow: EvaluationWindow;
  private readonly disasterWindow: DisasterWindow;
  private readonly debugWindow: DebugWindow;
  private readonly settingsWindow: SettingsWindow;
  private readonly screenshotWindow: ScreenshotWindow;
  private readonly screenshotLinkWindow: ScreenshotLinkWindow;
  private readonly saveWindow: SaveWindow;
  private readonly touchWindow: TouchWarnWindow;
  private readonly queryWindow: QueryWindow;
  private readonly queryTool: QueryTool;
  private readonly otherPlayers: OtherPlayers;
  readonly notificationBar: NotificationBar<HTMLElement>;
  readonly toolToast: PlacedToast;
  private readonly minimap: Minimap;
  private readonly tooSmall = requiredElement("tooSmall");
  private readonly lastEventButton = requiredElement("lastEvent");

  private mouse: MouseOutline | null = null;
  private readonly newsHold = new NewsHold();
  private readonly lastEvent = new LastEvent();
  // The city settings as the settings window showed them, which its choices are compared with when it closes
  private settingsShown: SettingsRecord | null = null;
  // Whether the player can see the city, which decides whether the other players see this player's hover box
  private viewerVisible = false;

  // Debug mode's frame counter
  private readonly fpsValue = requiredElement("fpsValue");
  private frameCount = 0;
  private animStart = 0;
  private lastElapsed = -1;

  private readonly handleWindowClosure: () => void;
  private readonly touchListener = () => {
    window.removeEventListener("touchstart", this.touchListener, false);
    this.windows.open(this.touchWindow);
  };

  private readonly tick = () => {
    this.handleInput();

    // The tiles clicked or dragged over since the last tick go as tool commands, one per path. The source applies the
    // commands it is sent whether or not the city is stepping: you can build when paused. While the end-to-end runner
    // holds the source's driver, it sends them itself, so that how a drag splits into commands never depends on when
    // ticks ran.
    if (!this.source.driver.isHeld()) {
      this.sendToolPaths();
    }

    this.mouse = this.windows.holdsInput() ? null : this.calculateMouseForPaint();
    this.reportCursor();

    window.setTimeout(this.tick, 0);
  };

  private readonly commonAnimate = () => {
    const paused = this.speedControl.isPaused();
    let sprites = this.calculateSpritesForPaint(this.gameCanvas);
    this.gameCanvas.paint(this.outlinesForPaint(), sprites, paused);

    sprites = this.calculateSpritesForPaint(this.monsterTV.canvas);
    this.monsterTV.paint(sprites, paused);

    this.minimap.paint();

    requestAnimationFrame(this.animate);
  };

  private readonly debugAnimate = () => {
    const elapsed = Math.floor((Date.now() - this.animStart) / 1000);

    if (elapsed > this.lastElapsed && this.frameCount > 0) {
      this.fpsValue.textContent = String(Math.floor(this.frameCount / elapsed));
      this.lastElapsed = elapsed;
    }

    this.frameCount++;
    this.commonAnimate();
  };

  private readonly animate: () => void;

  // A game of the city the source has started, which the state has followed from its start
  constructor({source, state, presence, mapArt}: GameParts, started: StartedCity) {
    this.source = source;
    this.state = state;
    this.seed = started.seed;
    this.autoBulldoze = new AutoBulldozePreference(pageStore());

    // A city on the server goes in the page's address, so the address invites another player in, and a reload rejoins
    linkToCity(started, window);

    this.rci = placeRCI("RCIContainer");
    this.statusPanel = new StatusPanel("statusPanel");

    // Note: must init canvas before inputStatus
    this.gameCanvas = new GameCanvas("canvasContainer", state.map, mapArt);
    this.inputStatus = new InputStatus(this.gameCanvas, () => this.windows.holdsInput());

    new OverlayPicker("overlayPanel", cityOverlaySource(source, state), this.gameCanvas);

    this.minimap = new Minimap(state, tileSetPixels(mapArt), this.gameCanvas, pageStore());
    this.inputStatus.addEventListener(UiMessages.MINIMAP_TOGGLE_REQUESTED, () => this.minimap.toggle());

    // The Last event button centres the view on the last news with a place, which brings the player back to it after
    // the bar has moved on
    this.lastEventButton.addEventListener("click", () => {
      const place = this.lastEvent.where(this.state.sprites);
      if (place !== null) {
        this.gameCanvas.centreOn(place.x, place.y);
      }
    });

    this.speedControl = new SpeedControl(state.current("settings").speed, (speed) => {
      this.source.send({type: "setSpeed", speed});
    }, (paused) => this.inputStatus.showPaused(paused));

    this.monsterTV = new MonsterTV(state.map, mapArt);

    const opacityLayerID = "opaque";

    const budgetWindow = new BudgetWindow(opacityLayerID, "budget", source);
    const budgetButton = requiredElement("budgetRequest");
    this.windows = new WindowManager(budgetWindow, () => this.budgetWindowValues(),
                                     {setLit: (lit) => budgetButton.classList.toggle("reviewDue", lit)});

    this.handleWindowClosure = () => this.windows.closed();

    this.evalWindow = new EvaluationWindow(opacityLayerID, "evalWindow");
    this.evalWindow.addEventListener(UiMessages.EVAL_WINDOW_CLOSED, this.handleWindowClosure);
    this.inputStatus.addEventListener(UiMessages.EVAL_REQUESTED,
                                      () => this.windows.open(this.evalWindow, state.current("evaluation")));

    budgetWindow.addEventListener(UiMessages.BUDGET_WINDOW_CLOSED,
                                  (choice: BudgetChoice | null) => this.handleBudgetWindowClosure(choice));
    this.inputStatus.addEventListener(UiMessages.BUDGET_REQUESTED, () => this.windows.openBudget());

    this.disasterWindow = new DisasterWindow(opacityLayerID, "disasterWindow");
    this.disasterWindow.addEventListener(UiMessages.DISASTER_WINDOW_CLOSED,
                                         (kind: DisasterKind | null) => this.handleDisasterWindowClosure(kind));
    this.inputStatus.addEventListener(UiMessages.DISASTER_REQUESTED, () => this.windows.open(this.disasterWindow));

    this.debugWindow = new DebugWindow(opacityLayerID, "debugWindow");
    this.debugWindow.addEventListener(UiMessages.DEBUG_WINDOW_CLOSED,
                                      (actions: DebugAction[]) => this.handleDebugWindowClosure(actions));
    this.inputStatus.addEventListener(UiMessages.DEBUG_WINDOW_REQUESTED, () => this.windows.open(this.debugWindow));

    this.settingsWindow = new SettingsWindow(opacityLayerID, "settingsWindow");
    this.settingsWindow.addEventListener(UiMessages.SETTINGS_WINDOW_CLOSED,
                                         (choice: SettingsChoice | null) => this.handleSettingsWindowClosure(choice));
    this.inputStatus.addEventListener(UiMessages.SETTINGS_WINDOW_REQUESTED, () => this.handleSettingsRequest());

    this.screenshotWindow = new ScreenshotWindow(opacityLayerID, "screenshotWindow");
    this.screenshotWindow.addEventListener(UiMessages.SCREENSHOT_WINDOW_CLOSED,
                                           (area: ScreenshotArea | null) => this.handleScreenshotWindowClosure(area));
    this.inputStatus.addEventListener(UiMessages.SCREENSHOT_WINDOW_REQUESTED,
                                      () => this.windows.open(this.screenshotWindow));

    this.screenshotLinkWindow = new ScreenshotLinkWindow(opacityLayerID, "screenshotLinkWindow");
    this.screenshotLinkWindow.addEventListener(UiMessages.SCREENSHOT_LINK_CLOSED, this.handleWindowClosure);

    this.saveWindow = new SaveWindow(opacityLayerID, "saveWindow");
    this.saveWindow.addEventListener(UiMessages.SAVE_WINDOW_CLOSED, this.handleWindowClosure);

    this.touchWindow = new TouchWarnWindow(opacityLayerID, "touchWarnWindow");
    this.touchWindow.addEventListener(UiMessages.TOUCH_WINDOW_CLOSED, this.handleWindowClosure);

    // The query window shows the report the query tool asks the simulation for
    this.queryWindow = new QueryWindow(opacityLayerID, "queryWindow");
    this.queryWindow.addEventListener(UiMessages.QUERY_WINDOW_CLOSED, this.handleWindowClosure);
    this.queryTool = new QueryTool(source, (report) => this.windows.open(this.queryWindow, report));

    // Listen for clicks on the save button
    this.inputStatus.addEventListener(UiMessages.SAVE_REQUESTED, () => this.handleSave());

    // Listen for tool clicks
    this.inputStatus.addEventListener(UiMessages.TOOL_CLICKED, (data: ToolClick) => this.handleTool(data));

    // And pauses
    this.inputStatus.addEventListener(UiMessages.PAUSE_REQUESTED, () => this.speedControl.togglePause());

    // And zooms, which a window holding the keyboard and mouse holds back, as it holds back scrolling
    this.inputStatus.addEventListener(UiMessages.ZOOM_REQUESTED, ({steps, point}: ZoomRequest) => {
      if (!this.windows.holdsInput()) {
        this.gameCanvas.zoomBy(steps, point);
      }
    });

    this.infoBar = placeInfoBar(started.name);
    this.infoBar.showDate(state.current("date"));
    this.infoBar.showPopulation(state.current("population"));
    this.infoBar.showEvaluation(state.current("evaluation"));
    this.infoBar.showBudget(state.current("budget"));

    this.notificationBar = placeNotificationBar(this.gameCanvas);
    this.toolToast = placeToolToast();

    this.otherPlayers = new OtherPlayers(presence, requiredElement("activityList"));

    // Unhide controls, before the demand meter first draws: it sizes its canvas to its container on screen
    this.revealControls();

    // Follow the city as the source's state messages change it
    this.followCity();

    // Listen for touches, so we can warn tablet users
    window.addEventListener("touchstart", this.touchListener, false);

    document.addEventListener("visibilitychange", this.updateViewerVisible);
    window.addEventListener("resize", this.updateViewerVisible);
    this.updateViewerVisible();

    attachToTestHook(this);
    this.tick();

    // Paint the map
    const debug = ClientConfig.debug;
    if (debug) {
      toggleShown(requiredElement("debug"));
      this.animStart = Date.now();
    }

    this.animate = debug ? this.debugAnimate : this.commonAnimate;
    this.animate();
  }

  // Calls the listener with each command result from now on, any player's
  onCommandResult(listener: (result: CommandResult) => void): void {
    this.state.on("commandResult", ({result}) => listener(result));
  }

  // Sends each path gathered since the last tick as one tool command: a click, or a drag's latest tiles
  sendToolPaths(): void {
    this.toolPaths.take().forEach((toolPath) => {
      this.source.send({type: "tool", tool: toolPath.tool, path: toolPath.path,
                        autoBulldoze: this.autoBulldoze.isOn()});
    });
  }

  private followCity(): void {
    const state = this.state;

    // The demand and status are sent each cycle, and may have come before the game followed the city. Until the valves
    // first set it, the demand meter shows the original's starting values.
    this.rci.update(state.latest("demand") ?? {residential: 750, commercial: 750, industrial: 750});
    const status = state.latest("status");
    if (status !== null) {
      this.statusPanel.show(status);
    }

    state.on("demand", (demand) => this.rci.update(demand));
    state.on("status", (status) => this.statusPanel.show(status));
    state.on("date", (date) => this.infoBar.showDate(date));
    state.on("population", (population) => this.infoBar.showPopulation(population));
    state.on("evaluation", (evaluation) => this.infoBar.showEvaluation(evaluation));
    state.on("budget", (budget) => this.infoBar.showBudget(budget));
    state.on("settings", (settings) => this.speedControl.showSpeed(settings.speed));
    state.on("sprites", ({sprites}) => this.monsterTV.spritesMoved(sprites));
    state.on("news", (news) => this.showNews(news));
    state.on("commandResult", ({result}) => {
      this.handleCommandResult(result);
      this.otherPlayers.commandResult(result);
    });
    // The Budget button marks the review due until the player opens the budget, and the notification bar offers it, if
    // no news shows: the year end's own news, such as the city going broke, comes before the review
    state.on("budgetReviewDue", () => {
      this.windows.budgetReviewDue();
      this.notificationBar.offer({subject: Messages.BUDGET_REVIEW_DUE}, () => this.windows.openBudget());
    });
  }

  // Notes whether the player can see the city: not while the screen is too small to play, which only a resize
  // changes, or while the tab is hidden. The city on the server steps on either way, as its other players see it.
  private readonly updateViewerVisible = (): void => {
    this.viewerVisible = !isShown(this.tooSmall) && !document.hidden;
  };

  private revealControls(): void {
    document.querySelectorAll(".initialHidden").forEach((element) => element.classList.remove("initialHidden"));

    this.notificationBar.show({subject: UiMessages.WELCOME});
  }

  private handleDisasterWindowClosure(kind: DisasterKind | null): void {
    this.windows.closed();

    if (kind !== null) {
      this.source.send(disasterCommand(kind));
    }
  }

  private handleSettingsWindowClosure(choice: SettingsChoice | null): void {
    this.windows.closed();

    if (choice === null) {
      return;
    }

    this.autoBulldoze.set(choice.autoBulldoze);
    settingsCommands(this.settingsShown!, choice).forEach((command) => {
      this.source.send(command);
    });
  }

  private handleDebugWindowClosure(actions: DebugAction[]): void {
    this.windows.closed();

    actions.forEach((action) => {
      if (action === "addFunds") {
        this.source.send({type: "addFunds"});
      } else if (action === "downloadLog") {
        this.downloadLog();
      } else {
        console.warn("Unexpected action", action);
      }
    });
  }

  // Saves the session's command log as a file, for the headless runner to replay:
  // `dotnet run --project server/Micropolis.Headless -- --log <file>`. A log the source can't give is said out loud, as
  // a save is.
  private downloadLog(): void {
    this.source.commandLog().then((recorded) => {
      downloadJson(`micropolis-log-${recorded.step}.json`, JSON.stringify(recorded.log));
    }, (error: unknown) => window.alert(`The command log couldn't be downloaded: ${errorMessage(error)}`));
  }

  private handleScreenshotWindowClosure(area: ScreenshotArea | null): void {
    this.windows.closed();

    if (area === null) {
      return;
    }

    const dataURI = area === "visible" ? this.gameCanvas.screenshotVisible() : this.gameCanvas.screenshotMap();
    this.windows.open(this.screenshotLinkWindow, dataURI);
  }

  private handleBudgetWindowClosure(choice: BudgetChoice | null): void {
    this.windows.closed();

    if (choice !== null) {
      this.source.send(budgetCommand(choice.funding, choice.tax));
    }
  }

  // The arguments the budget window opens with: the budget record
  private budgetWindowValues(): unknown[] {
    return [this.state.current("budget")];
  }

  private handleSettingsRequest(): void {
    // The city settings as the window shows them, which its choices are compared with when it closes
    const shown = this.state.current("settings");
    const client = {autoBulldoze: this.autoBulldoze.isOn(), seed: this.seed};

    if (this.windows.open(this.settingsWindow, shown, client)) {
      this.settingsShown = shown;
    }
  }

  // The tiles the player's tool reaches gather into paths (see ToolPaths), sent each tick by sendToolPaths
  private handleTool(data: ToolClick): void {
    // Where was the tool clicked?
    const tileCoords = this.gameCanvas.tileOnCanvasUnder(data.x, data.y);

    const toolName = this.inputStatus.toolName;
    if (tileCoords === null || toolName === null) {
      this.toolPaths.lost();
      return;
    }

    // The view may show a margin around the map, where there is no tile to report on
    if (toolName === "query") {
      if (this.state.map.testBounds(tileCoords.x, tileCoords.y)) {
        this.queryTool.query(tileCoords.x, tileCoords.y);
      }
      return;
    }

    this.toolPaths.reached(toolName as ToolName, {x: tileCoords.x, y: tileCoords.y}, data.start);
  }

  // A toast at the pointer says why the player's own tool command built nothing
  private handleCommandResult(result: CommandResult): void {
    const failure = toastedFailure(toolOutcome(result, this.source.player));
    if (failure === null) {
      return;
    }

    if (failure === "rejected") {
      console.warn(`Tool command rejected: ${result.reason}`);
    }

    this.toolToast.show(Text.toolFailures[failure]);
  }

  // The server keeps the city in its store, and the window opens once it has. A save the server refuses, or one on a
  // server the connection to is down, is said out loud.
  private handleSave(): void {
    this.source.save().then(() => {
      this.windows.open(this.saveWindow);
    }, (error: unknown) => window.alert(`The city couldn't be saved: ${errorMessage(error)}`));
  }

  private handleInput(): void {
    // Keyboard movement
    const scroll = this.inputStatus.takeScroll(performance.now());
    this.gameCanvas.scrollBy(scroll.x, scroll.y);

    // Escape closes the window showing, or else clears the tool
    if (this.inputStatus.takeEscape()) {
      if (this.windows.holdsInput()) {
        this.windows.closeShown();
      } else {
        this.inputStatus.clearTool();
      }
    }
  }

  private showNews(message: NewsMessage): void {
    const route = routeMessage(message, this.newsHold, Date.now());

    if (route.tv !== null) {
      if ("trackable" in route.tv) {
        this.monsterTV.track(route.tv.x, route.tv.y, route.tv.sprite);
      } else {
        this.monsterTV.show(route.tv.x, route.tv.y);
      }
    }

    if (route.unknown) {
      console.warn("Unexpected message: ", message.subject);
    }

    if (route.notify) {
      this.notificationBar.show(message);
      this.lastEvent.heard(message);
      setShown(this.lastEventButton, this.lastEvent.known);
    }
  }

  // The map tile under the pointer that this player's hover box is drawn at, or null while none is
  get hoverTile(): TilePoint | null {
    return this.mouse === null ? null : {x: this.mouse.x, y: this.mouse.y};
  }

  private calculateMouseForPaint(): MouseOutline | null {
    // Determine whether we need to draw a tool outline in the canvas: not while Space readies a pan or a pan holds the
    // map, so the others don't see it either
    if (this.inputStatus.mouseX === -1 || this.inputStatus.toolWidth <= 0 || this.inputStatus.pan !== "free") {
      return null;
    }

    const tileCoords = this.gameCanvas.tileOnCanvasUnder(this.inputStatus.mouseX,
                                                                        this.inputStatus.mouseY);
    if (tileCoords === null) {
      return null;
    }

    return {x: tileCoords.x, y: tileCoords.y, width: this.inputStatus.toolWidth, height: this.inputStatus.toolWidth,
            colour: this.inputStatus.toolColourOf(this.inputStatus.toolName ?? ""), label: null};
  }

  // Tells the others where this player's hover box is: nowhere while it isn't drawn, a window holding the mouse, or
  // while the player can't see the city, such as in a hidden tab, where the pointer may never leave the canvas
  private reportCursor(): void {
    const shown = this.mouse !== null && this.viewerVisible;
    const tile = shown
      ? this.gameCanvas.tileOnCanvasUnder(this.inputStatus.mouseX, this.inputStatus.mouseY)
      : null;

    this.otherPlayers.reportCursor(this.inputStatus.toolName, this.inputStatus.toolWidth, tile,
                                   (x, y) => this.state.map.testBounds(x, y));
  }

  // The other players' hover boxes, named, under this player's own
  private outlinesForPaint(): MouseOutline[] {
    const outlines = this.otherPlayers.outlines((tool) => this.inputStatus.toolColourOf(tool));

    if (this.mouse !== null) {
      outlines.push(this.mouse);
    }

    return outlines;
  }

  private calculateSpritesForPaint(canvas: SpriteViewport): PaintableSprite[] {
    const origin = canvas.getTileOrigin();
    return spritesInView(this.state.sprites, origin.x, origin.y, canvas.mapPixelWidth, canvas.mapPixelHeight);
  }
}
