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
import { linkToCity } from "./cityLink";
import type { CitySource, StartedCity } from "./citySource";
import { CityState } from "./cityState";
import { ClientConfig } from "./clientConfig";
import { DebugAction, DebugWindow } from "./debugWindow";
import { DisasterWindow } from "./disasterWindow";
import { isShown, requiredElement, toggleShown } from "./domElements";
import { ToolPaths } from "./dragPath";
import { EvaluationWindow } from "./evaluationWindow";
import { GameCanvas, MouseOutline, PaintableSprite, spritesInView } from "./gameCanvas";
import { InfoBar, placeInfoBar } from "./infoBar";
import { InputStatus, ToolClick } from "./inputStatus";
import * as Messages from "./messages";
import { MonsterTV } from "./monsterTV";
import { NewsHold, routeMessage } from "./news";
import { NotificationBar, placeNotificationBar } from "./notification";
import { cityOverlaySource, OverlayPicker } from "./overlayPicker";
import { CommandResult, DisasterKind, NewsMessage, SettingsRecord, ToolName } from "./protocol";
import { QueryTool } from "./queryTool";
import { QueryWindow } from "./queryWindow";
import { placeRCI, RCI } from "./rci";
import { SaveWindow } from "./saveWindow";
import { ScreenshotLinkWindow } from "./screenshotLinkWindow";
import { ScreenshotArea, ScreenshotWindow } from "./screenshotWindow";
import { SettingsChoice, SettingsWindow } from "./settingsWindow";
import { SpeedControl } from "./speedControl";
import { StatusPanel } from "./statusPanel";
import { Storage } from "./storage";
import { attachToTestHook } from "./testHook";
import { TileSet } from "./tileSet";
import { TouchWarnWindow } from "./touchWarnWindow";
import { budgetCommand, settingsCommands, toolOutcome, toolOutputText } from "./windowCommands";
import { WindowManager } from "./windowManager";

// What a game is made from: the city source and the client's copy of its city, and the images the game draws with
export interface GameParts {
  source: CitySource;
  state: CityState;
  tileSet: TileSet;
  spriteSheet: HTMLImageElement;
}

// A game of the city a source has started. The game reaches the city only through the source: it sends commands and
// queries, and shows the city from the client's copy of it, which the source's state messages build.
export class Game {
  readonly gameCanvas: GameCanvas;
  readonly tileSet: TileSet;

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
  private readonly monsterTV: MonsterTV;
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
  readonly notificationBar: NotificationBar<HTMLElement>;
  private readonly tooSmall = requiredElement("tooSmall");

  private mouse: MouseOutline | null = null;
  private readonly newsHold = new NewsHold();
  // The city settings as the settings window showed them, which its choices are compared with when it closes
  private settingsShown: SettingsRecord | null = null;
  // Whether the source was last told the player can see the city
  private viewerVisible: boolean | null = null;

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

    // A year-end budget review that fell due, or fell due while a window showed
    this.windows.openDue();

    this.mouse = this.windows.holdsInput() ? null : this.calculateMouseForPaint();

    window.setTimeout(this.tick, 0);
  };

  private readonly commonAnimate = () => {
    const paused = this.speedControl.isPaused();
    let sprites = this.calculateSpritesForPaint(this.gameCanvas);
    this.gameCanvas.paint(this.mouse, sprites, paused);

    sprites = this.calculateSpritesForPaint(this.monsterTV.canvas);
    this.monsterTV.paint(sprites, paused);

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
  constructor({source, state, tileSet, spriteSheet}: GameParts, started: StartedCity) {
    this.source = source;
    this.state = state;
    this.tileSet = tileSet;
    this.seed = started.seed;
    this.autoBulldoze = new AutoBulldozePreference(Storage.canStore ? window.localStorage : null);

    // A city on the server goes in the page's address, so the address invites another player in, and a reload rejoins
    linkToCity(started, window);

    this.rci = placeRCI("RCIContainer");
    this.statusPanel = new StatusPanel("statusPanel");

    // Note: must init canvas before inputStatus
    this.gameCanvas = new GameCanvas("canvasContainer");
    this.gameCanvas.init(state.map, this.tileSet, spriteSheet);
    this.inputStatus = new InputStatus(tileSet.tileWidth);

    new OverlayPicker("overlayPanel", cityOverlaySource(source, state), this.gameCanvas);

    this.speedControl = new SpeedControl(state.current("settings").speed, (speed) => {
      this.source.send({type: "setSpeed", speed});
    }, (paused) => this.inputStatus.showPaused(paused));

    this.monsterTV = new MonsterTV(state.map, tileSet, spriteSheet);

    const opacityLayerID = "opaque";

    const budgetWindow = new BudgetWindow(opacityLayerID, "budget", source);
    this.windows = new WindowManager(budgetWindow, () => this.budgetWindowValues());

    this.handleWindowClosure = () => this.windows.closed();

    this.evalWindow = new EvaluationWindow(opacityLayerID, "evalWindow");
    this.evalWindow.addEventListener(Messages.EVAL_WINDOW_CLOSED, this.handleWindowClosure);
    this.inputStatus.addEventListener(Messages.EVAL_REQUESTED,
                                      () => this.windows.open(this.evalWindow, state.current("evaluation")));

    budgetWindow.addEventListener(Messages.BUDGET_WINDOW_CLOSED,
                                  (choice: BudgetChoice | null) => this.handleBudgetWindowClosure(choice));
    this.inputStatus.addEventListener(Messages.BUDGET_REQUESTED, () => this.windows.openBudget());

    this.disasterWindow = new DisasterWindow(opacityLayerID, "disasterWindow");
    this.disasterWindow.addEventListener(Messages.DISASTER_WINDOW_CLOSED,
                                         (kind: DisasterKind | null) => this.handleDisasterWindowClosure(kind));
    this.inputStatus.addEventListener(Messages.DISASTER_REQUESTED, () => this.windows.open(this.disasterWindow));

    this.debugWindow = new DebugWindow(opacityLayerID, "debugWindow");
    this.debugWindow.addEventListener(Messages.DEBUG_WINDOW_CLOSED,
                                      (actions: DebugAction[]) => this.handleDebugWindowClosure(actions));
    this.inputStatus.addEventListener(Messages.DEBUG_WINDOW_REQUESTED, () => this.windows.open(this.debugWindow));

    this.settingsWindow = new SettingsWindow(opacityLayerID, "settingsWindow");
    this.settingsWindow.addEventListener(Messages.SETTINGS_WINDOW_CLOSED,
                                         (choice: SettingsChoice | null) => this.handleSettingsWindowClosure(choice));
    this.inputStatus.addEventListener(Messages.SETTINGS_WINDOW_REQUESTED, () => this.handleSettingsRequest());

    this.screenshotWindow = new ScreenshotWindow(opacityLayerID, "screenshotWindow");
    this.screenshotWindow.addEventListener(Messages.SCREENSHOT_WINDOW_CLOSED,
                                           (area: ScreenshotArea | null) => this.handleScreenshotWindowClosure(area));
    this.inputStatus.addEventListener(Messages.SCREENSHOT_WINDOW_REQUESTED,
                                      () => this.windows.open(this.screenshotWindow));

    this.screenshotLinkWindow = new ScreenshotLinkWindow(opacityLayerID, "screenshotLinkWindow");
    this.screenshotLinkWindow.addEventListener(Messages.SCREENSHOT_LINK_CLOSED, this.handleWindowClosure);

    this.saveWindow = new SaveWindow(opacityLayerID, "saveWindow");
    this.saveWindow.addEventListener(Messages.SAVE_WINDOW_CLOSED, this.handleWindowClosure);

    this.touchWindow = new TouchWarnWindow(opacityLayerID, "touchWarnWindow");
    this.touchWindow.addEventListener(Messages.TOUCH_WINDOW_CLOSED, this.handleWindowClosure);

    // The query window shows the report the query tool asks the simulation for
    this.queryWindow = new QueryWindow(opacityLayerID, "queryWindow");
    this.queryWindow.addEventListener(Messages.QUERY_WINDOW_CLOSED, this.handleWindowClosure);
    this.queryTool = new QueryTool(source, (report) => this.windows.open(this.queryWindow, report));

    // Listen for clicks on the save button
    this.inputStatus.addEventListener(Messages.SAVE_REQUESTED, () => this.handleSave());

    // Listen for tool clicks
    this.inputStatus.addEventListener(Messages.TOOL_CLICKED, (data: ToolClick) => this.handleTool(data));

    // And pauses
    this.inputStatus.addEventListener(Messages.PAUSE_REQUESTED, () => this.speedControl.togglePause());

    this.infoBar = placeInfoBar(started.name);
    this.infoBar.showDate(state.current("date"));
    this.infoBar.showPopulation(state.current("population"));
    this.infoBar.showEvaluation(state.current("evaluation"));
    this.infoBar.showBudget(state.current("budget"));

    this.notificationBar = placeNotificationBar(this.gameCanvas);

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

  // The saved game's text
  save(): Promise<string> {
    return this.source.save();
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
    state.on("commandResult", ({result}) => this.handleCommandResult(result));
    state.on("budgetReviewDue", () => this.windows.budgetReviewDue());
  }

  // Tells the source whenever the player stops or starts being able to see the city: the city steps only while the
  // player can, unless it is a shared city on a server. It is hidden while the screen is too small to play, which only
  // a resize changes, or the tab is hidden: a hidden tab is not watched, so the city waits rather than running on
  // unseen.
  private readonly updateViewerVisible = (): void => {
    const visible = !isShown(this.tooSmall) && !document.hidden;
    if (visible !== this.viewerVisible) {
      this.viewerVisible = visible;
      this.source.setViewerVisible(visible);
    }
  };

  private revealControls(): void {
    document.querySelectorAll(".initialHidden").forEach((element) => element.classList.remove("initialHidden"));

    this.notificationBar.show({subject: Messages.WELCOME});
  }

  private handleDisasterWindowClosure(kind: DisasterKind | null): void {
    this.windows.closed();

    if (kind !== null) {
      this.source.send({type: "triggerDisaster", kind});
    }
  }

  private handleSettingsWindowClosure(choice: SettingsChoice | null): void {
    this.windows.closed();

    if (choice === null) {
      return;
    }

    this.autoBulldoze.set(choice.autoBulldoze);
    this.speedControl.setRunningSpeed(choice.speed);
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

  // Saves the session's command log as a file, for the headless runner to replay: `npm run simulate -- --log <file>`.
  // Where the source can't work out state hashes, the log has no checkpoints, and the player is told.
  private downloadLog(): void {
    void this.source.commandLog().then((recorded) => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(recorded.log)], {type: "application/json"}));
      const link = document.createElement("a");
      link.href = url;
      link.download = `micropolis-log-${recorded.step}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoked once the download has had time to start: revoking at once can cancel it
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      if (recorded.unhashed !== null) {
        console.error(`The command log has no checkpoints: ${recorded.unhashed}`);
        this.notificationBar.show({subject: Messages.LOG_UNCHECKED});
      }
    });
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
    const client = {autoBulldoze: this.autoBulldoze.isOn(), seed: this.seed,
                    resumeSpeed: this.speedControl.getRunningSpeed()};

    if (this.windows.open(this.settingsWindow, shown, client)) {
      this.settingsShown = shown;
    }
  }

  // The tiles the player's tool reaches gather into paths (see ToolPaths), sent each tick by sendToolPaths
  private handleTool(data: ToolClick): void {
    // Where was the tool clicked?
    const tileCoords = this.gameCanvas.canvasCoordinateToTileCoordinate(data.x, data.y);

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

  // The tool output shows how the player's last tool command went
  private handleCommandResult(result: CommandResult): void {
    const outcome = toolOutcome(result, this.source.player);
    if (outcome === null) {
      return;
    }

    if (outcome === "rejected") {
      console.warn(`Tool command rejected: ${result.reason}`);
    }

    this.inputStatus.showToolOutput(toolOutputText(outcome));
  }

  // The window opens once the save is written
  private handleSave(): void {
    void this.save().then((text) => {
      Storage.saveText(text);
      this.windows.open(this.saveWindow);
    });
  }

  private handleInput(): void {
    if (!this.windows.holdsInput()) {
      // Handle keyboard movement

      if (this.inputStatus.left) {
        this.gameCanvas.moveWest();
      } else if (this.inputStatus.up) {
        this.gameCanvas.moveNorth();
      } else if (this.inputStatus.right) {
        this.gameCanvas.moveEast();
      } else if (this.inputStatus.down) {
        this.gameCanvas.moveSouth();
      }
    }

    if (this.inputStatus.escape) {
      // We need to handle escape, as InputStatus won't know what windows are showing
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
    }
  }

  private calculateMouseForPaint(): MouseOutline | null {
    // Determine whether we need to draw a tool outline in the canvas
    if (this.inputStatus.mouseX === -1 || this.inputStatus.toolWidth <= 0) {
      return null;
    }

    const tileCoords = this.gameCanvas.canvasCoordinateToTileOffset(this.inputStatus.mouseX, this.inputStatus.mouseY);
    if (tileCoords === null) {
      return null;
    }

    return {x: tileCoords.x, y: tileCoords.y, width: this.inputStatus.toolWidth, height: this.inputStatus.toolWidth,
            colour: this.inputStatus.toolColour || "yellow"};
  }

  private calculateSpritesForPaint(canvas: GameCanvas): PaintableSprite[] | null {
    const origin = canvas.getTileOrigin();
    const spriteList = spritesInView(this.state.sprites, origin.x, origin.y, canvas.canvasWidth, canvas.canvasHeight);

    if (spriteList.length === 0) {
      return null;
    }

    return spriteList;
  }
}
