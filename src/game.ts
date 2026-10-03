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
import { CommandRecorder, LogStart } from "./commandLog";
import { CommandQueue, CommandTarget } from "./commandQueue";
import { CommandResult, LOCAL_PLAYER } from "./commands";
import { Config } from "./config.js";
import { DebugAction, DebugWindow } from "./debugWindow";
import { DisasterWindow } from "./disasterWindow";
import { isShown, requiredElement, setShown } from "./domElements";
import { ToolPaths } from "./dragPath";
import { EvaluationWindow } from "./evaluationWindow";
import { GameCanvas, MouseOutline, PaintableMap, PaintableSprite } from "./gameCanvas";
import { CityDate, InfoSource, placeInfoBar } from "./infoBar";
import { InputStatus, ToolClick } from "./inputStatus";
import * as Messages from "./messages";
import { MonsterTV } from "./monsterTV";
import { FrontEndMessage, NewsHold, routeMessage } from "./news";
import { NotificationBar, placeNotificationBar } from "./notification";
import { OverlayPicker, PageSimulation, pageOverlaySource } from "./overlayPicker";
import { BudgetRecord, DisasterKind, EvaluationRecord, SettingsRecord, SPEEDS, ToolName } from "./protocol";
import { pageQuerySource } from "./querySource";
import { QueryTool } from "./queryTool";
import { QueryWindow } from "./queryWindow";
import { placeRCI, RCI, ValveSource } from "./rci";
import { SaveWindow } from "./saveWindow";
import { ScreenshotLinkWindow } from "./screenshotLinkWindow";
import { ScreenshotArea, ScreenshotWindow } from "./screenshotWindow";
import { SettingsChoice, SettingsWindow } from "./settingsWindow";
import { Simulation } from "./simulation.js";
import { SpeedControl, SpeedSource } from "./speedControl";
import { plainSavedState, Saveable } from "./stateHash";
import { CityStatusSource, StatusPanel } from "./statusPanel";
import { StepDriver } from "./stepDriver";
import { SavedGame, Storage } from "./storage";
import { attachToTestHook, HookedSimulation } from "./testHook";
import { Text } from "./text";
import { TileSet } from "./tileSet";
import { TouchWarnWindow } from "./touchWarnWindow";
import { UiRandom } from "./uiRandom";
import { budgetCommand, settingsCommands, toolOutcome } from "./windowCommands";
import { WindowManager } from "./windowManager";

// What the game reads of the simulation itself, beside what it hands it to
interface SimulationParts {
  getMap(): PaintableMap;
  addEventListener(event: typeof Messages.BUDGET_REVIEW_DUE, listener: () => void): void;
  addEventListener(event: typeof Messages.FRONT_END_MESSAGE, listener: (message: FrontEndMessage) => void): void;
  addEventListener(event: typeof Messages.COMMAND_RESULT, listener: (result: CommandResult) => void): void;
  readonly evaluation: {cityClass: string, cityPop: number, cityScore: number};
  readonly budget: {totalFunds: number};
  readonly seed: number;
  readonly spriteManager: {getSpritesInView(x: number, y: number, width: number, height: number): PaintableSprite[]};
  getDate(): CityDate;
  budgetRecord(): BudgetRecord;
  evaluationRecord(): EvaluationRecord;
  settingsRecord(): SettingsRecord;
  isPaused(): boolean;
}

// The simulation the game runs: what it reads itself, and what each part it hands the simulation to reads
type GameSimulation = SimulationParts & CityStatusSource & PageSimulation & SpeedSource & Saveable & CommandTarget &
  ValveSource & InfoSource & HookedSimulation;

// A game of the given simulation: Game.newGame and Game.fromSave build one
export class Game {
  readonly gameMap: PaintableMap;
  readonly gameCanvas: GameCanvas;
  readonly commandQueue: CommandQueue;
  readonly stepDriver: StepDriver;

  private readonly autoBulldoze: AutoBulldozePreference;
  private readonly rci: RCI;
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
  private readonly notificationBar: NotificationBar;
  private readonly recorder: CommandRecorder;
  private readonly tooSmall: HTMLElement;

  private mouse: MouseOutline | null = null;
  private readonly newsHold = new NewsHold();
  // The city settings as the settings window showed them, which its choices are compared with when it closes
  private settingsShown: SettingsRecord | null = null;

  // Debug mode's frame counter
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

    // The tiles clicked or dragged over since the last tick go as tool commands, one per path. The commands sent since
    // the last tick apply first, whether or not the city is stepping: you can build when paused. While the end-to-end
    // runner holds the driver, it applies them itself, so that how a drag splits into commands never depends on when
    // ticks ran.
    if (!this.stepDriver.isHeld()) {
      this.sendToolPaths();
      this.commandQueue.applyCommands();
    }

    // Run the sim: as many steps as the time since the last tick is due
    this.stepDriver.run(performance.now(), this.isStepping, this.stepSimulation);

    // A year-end budget review that fell due during those steps, or while a window showed
    this.windows.openDue();

    this.mouse = this.windows.holdsInput() ? null : this.calculateMouseForPaint();

    window.setTimeout(this.tick, 0);
  };

  private readonly commonAnimate = () => {
    const paused = this.simulation.isPaused();
    let sprites = this.calculateSpritesForPaint(this.gameCanvas);
    this.gameCanvas.paint(this.mouse, sprites, paused);

    sprites = this.calculateSpritesForPaint(this.monsterTV.canvas);
    this.monsterTV.paint(sprites, paused);

    requestAnimationFrame(this.animate);
  };

  private readonly debugAnimate = () => {
    const elapsed = Math.floor((Date.now() - this.animStart) / 1000);

    if (elapsed > this.lastElapsed && this.frameCount > 0) {
      requiredElement("fpsValue").textContent = String(Math.floor(this.frameCount / elapsed));
      this.lastElapsed = elapsed;
    }

    this.frameCount++;
    this.commonAnimate();
  };

  private readonly animate: () => void;

  readonly stepSimulation: () => void;
  readonly isStepping = () => this.notSteppingReason() === null;

  constructor(readonly simulation: GameSimulation, logStart: LogStart, readonly tileSet: TileSet,
              private readonly snowTileSet: TileSet, spriteSheet: HTMLImageElement, private readonly name: string) {
    this.autoBulldoze = new AutoBulldozePreference(Storage.canStore ? window.localStorage : null);
    this.gameMap = simulation.getMap();

    this.rci = placeRCI("RCIContainer", this.simulation);
    new StatusPanel("statusPanel", this.simulation);

    // Note: must init canvas before inputStatus
    this.gameCanvas = new GameCanvas("canvasContainer");
    this.gameCanvas.init(this.gameMap, this.tileSet, spriteSheet);
    this.inputStatus = new InputStatus(tileSet.tileWidth);

    new OverlayPicker("overlayPanel", pageOverlaySource(this.simulation), this.gameCanvas);

    this.speedControl = new SpeedControl(this.simulation, (speed) => {
      this.commandQueue.send(LOCAL_PLAYER, {type: "setSpeed", speed});
    }, (paused) => this.inputStatus.showPaused(paused));

    // Initialise monsterTV
    this.monsterTV = new MonsterTV(this.gameMap, tileSet, spriteSheet);

    const opacityLayerID = "opaque";

    const budgetWindow = new BudgetWindow(opacityLayerID, "budget", pageQuerySource(this.simulation));
    this.windows = new WindowManager(budgetWindow, () => this.budgetWindowValues());
    this.simulation.addEventListener(Messages.BUDGET_REVIEW_DUE, () => this.windows.budgetReviewDue());

    this.handleWindowClosure = () => this.windows.closed();

    // Hook up listeners to open/close evaluation window
    this.evalWindow = new EvaluationWindow(opacityLayerID, "evalWindow");
    this.evalWindow.addEventListener(Messages.EVAL_WINDOW_CLOSED, this.handleWindowClosure);
    this.inputStatus.addEventListener(Messages.EVAL_REQUESTED,
                                      () => this.windows.open(this.evalWindow, this.simulation.evaluationRecord()));

    // ... and similarly for the budget window
    budgetWindow.addEventListener(Messages.BUDGET_WINDOW_CLOSED,
                                  (choice: BudgetChoice | null) => this.handleBudgetWindowClosure(choice));
    this.inputStatus.addEventListener(Messages.BUDGET_REQUESTED, () => this.windows.openBudget());

    // ... and also the disaster window
    this.disasterWindow = new DisasterWindow(opacityLayerID, "disasterWindow");
    this.disasterWindow.addEventListener(Messages.DISASTER_WINDOW_CLOSED,
                                         (kind: DisasterKind | null) => this.handleDisasterWindowClosure(kind));
    this.inputStatus.addEventListener(Messages.DISASTER_REQUESTED, () => this.windows.open(this.disasterWindow));

    // ... the debug window
    this.debugWindow = new DebugWindow(opacityLayerID, "debugWindow");
    this.debugWindow.addEventListener(Messages.DEBUG_WINDOW_CLOSED,
                                      (actions: DebugAction[]) => this.handleDebugWindowClosure(actions));
    this.inputStatus.addEventListener(Messages.DEBUG_WINDOW_REQUESTED, () => this.windows.open(this.debugWindow));

    // ... the settings window
    this.settingsWindow = new SettingsWindow(opacityLayerID, "settingsWindow");
    this.settingsWindow.addEventListener(Messages.SETTINGS_WINDOW_CLOSED,
                                         (choice: SettingsChoice | null) => this.handleSettingsWindowClosure(choice));
    this.inputStatus.addEventListener(Messages.SETTINGS_WINDOW_REQUESTED, () => this.handleSettingsRequest());

    // ... the screenshot window
    this.screenshotWindow = new ScreenshotWindow(opacityLayerID, "screenshotWindow");
    this.screenshotWindow.addEventListener(Messages.SCREENSHOT_WINDOW_CLOSED,
                                           (area: ScreenshotArea | null) => this.handleScreenshotWindowClosure(area));
    this.inputStatus.addEventListener(Messages.SCREENSHOT_WINDOW_REQUESTED,
                                      () => this.windows.open(this.screenshotWindow));

    // ... the screenshot link window
    this.screenshotLinkWindow = new ScreenshotLinkWindow(opacityLayerID, "screenshotLinkWindow");
    this.screenshotLinkWindow.addEventListener(Messages.SCREENSHOT_LINK_CLOSED, this.handleWindowClosure);

    // ... the save confirmation window
    this.saveWindow = new SaveWindow(opacityLayerID, "saveWindow");
    this.saveWindow.addEventListener(Messages.SAVE_WINDOW_CLOSED, this.handleWindowClosure);

    // ... the touch warn window
    this.touchWindow = new TouchWarnWindow(opacityLayerID, "touchWarnWindow");
    this.touchWindow.addEventListener(Messages.TOUCH_WINDOW_CLOSED, this.handleWindowClosure);

    // ... and finally the query window, which shows the report the query tool asks the simulation for
    this.queryWindow = new QueryWindow(opacityLayerID, "queryWindow");
    this.queryWindow.addEventListener(Messages.QUERY_WINDOW_CLOSED, this.handleWindowClosure);
    this.queryTool = new QueryTool(pageQuerySource(this.simulation),
                                   (report) => this.windows.open(this.queryWindow, report));

    // Listen for clicks on the save button
    this.inputStatus.addEventListener(Messages.SAVE_REQUESTED, () => this.handleSave());

    // Listen for front end messages
    this.simulation.addEventListener(Messages.FRONT_END_MESSAGE, (message) => this.processFrontEndMessage(message));

    // Listen for tool clicks, and how the commands they send went
    this.inputStatus.addEventListener(Messages.TOOL_CLICKED, (data: ToolClick) => this.handleTool(data));
    this.simulation.addEventListener(Messages.COMMAND_RESULT, (result) => this.handleCommandResult(result));

    // And pauses
    this.inputStatus.addEventListener(Messages.PAUSE_REQUESTED, () => this.speedControl.togglePause());

    // And date changes
    // XXX Not yet activated
    //this.simulation.addEventListener(Messages.DATE_UPDATED, (date) => this.onDateChange(date));

    const initialValues = {
      classification: this.simulation.evaluation.cityClass,
      population: this.simulation.evaluation.cityPop,
      score: this.simulation.evaluation.cityScore,
      funds: this.simulation.budget.totalFunds,
      date: this.simulation.getDate(),
      name: this.name,
    };
    placeInfoBar(this.simulation, initialValues);

    this.notificationBar = placeNotificationBar(this.gameCanvas);
    this.tooSmall = requiredElement("tooSmall");

    // Listen for touches, so we can warn tablet users
    window.addEventListener("touchstart", this.touchListener, false);

    // Unhide controls
    this.revealControls();

    // Run the sim. Every change the player makes to the city is a command, sent through the queue.
    this.recorder = new CommandRecorder(this.simulation, logStart);
    this.commandQueue = new CommandQueue(this.simulation, this.recorder);
    this.stepDriver = new StepDriver();
    this.stepSimulation = () => this.commandQueue.step();
    attachToTestHook(this);
    this.tick();

    // Paint the map
    const debug = Config.debug || Config.gameDebug;
    if (debug) {
      const debugPanel = requiredElement("debug");
      setShown(debugPanel, !isShown(debugPanel));
      this.animStart = Date.now();
    }

    this.animate = debug ? this.debugAnimate : this.commonAnimate;
    this.animate();
  }

  // A new game on the map generated from the game seed, at the chosen level. The name may be empty: the splash screen
  // doesn't require one in debug mode.
  static newGame(map: unknown, seed: number, tileSet: TileSet, snowTileSet: TileSet, spriteSheet: HTMLImageElement,
                 level: number, name: string): Game {
    const simulation = new Simulation(map, level, SPEEDS.medium, seed);
    return new Game(simulation, {seed, level}, tileSet, snowTileSet, spriteSheet, name || "MyTown");
  }

  // A game restored from what Game.save wrote
  static fromSave(savedGame: SavedGame, tileSet: TileSet, snowTileSet: TileSet, spriteSheet: HTMLImageElement): Game {
    // The session's log starts from the city as loaded
    const simulation = Simulation.fromSave(savedGame);
    return new Game(simulation, {save: plainSavedState(simulation)}, tileSet, snowTileSet, spriteSheet,
                    savedGame.name as string);
  }

  // What the game saves, before storage stamps its version
  saveData(): object {
    const saveData = {name: this.name};
    this.simulation.save(saveData);

    return saveData;
  }

  save(): void {
    Storage.saveGame(this.saveData());
  }

  // Why the city isn't stepping, or null when it is. It steps unless it is paused, the screen is too small to play, or
  // the tab is hidden: a hidden tab is not watched, so the city waits rather than running on unseen.
  notSteppingReason(): string | null {
    if (this.simulation.isPaused()) {
      return "it is paused";
    }

    if (isShown(this.tooSmall)) {
      return "the screen is too small to play";
    }

    if (document.hidden) {
      return "the page is hidden";
    }

    return null;
  }

  // Sends each path gathered since the last tick as one tool command: a click, or a drag's latest tiles
  sendToolPaths(): void {
    this.toolPaths.take().forEach((toolPath) => {
      this.commandQueue.send(LOCAL_PLAYER, {type: "tool", tool: toolPath.tool, path: toolPath.path,
                                            autoBulldoze: this.autoBulldoze.isOn()});
    });
  }

  private revealControls(): void {
    document.querySelectorAll(".initialHidden").forEach((element) => element.classList.remove("initialHidden"));

    this.notificationBar.show({subject: Messages.WELCOME});
    this.rci.update({residential: 750, commercial: 750, industrial: 750});
  }

  // Not yet called: see the date listener in the constructor
  onDateChange(date: CityDate): void {
    if (date.month === 10 && UiRandom.stream.getChance(10)) {
      this.gameCanvas.changeTileSet(this.snowTileSet);
    } else if (date.month === 1) {
      this.gameCanvas.changeTileSet(this.tileSet);
    }
  }

  private handleDisasterWindowClosure(kind: DisasterKind | null): void {
    this.windows.closed();

    if (kind !== null) {
      this.commandQueue.send(LOCAL_PLAYER, {type: "triggerDisaster", kind});
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
      this.commandQueue.send(LOCAL_PLAYER, command);
    });
  }

  private handleDebugWindowClosure(actions: DebugAction[]): void {
    this.windows.closed();

    actions.forEach((action) => {
      if (action === "addFunds") {
        this.commandQueue.send(LOCAL_PLAYER, {type: "addFunds"});
      } else if (action === "downloadLog") {
        this.downloadLog();
      } else {
        console.warn("Unexpected action", action);
      }
    });
  }

  // Saves the session's command log as a file, for the headless runner to replay: `npm run simulate -- --log <file>`.
  // Where the page can't work out state hashes, the log has no checkpoints, and the player is told.
  private downloadLog(): void {
    const step = this.commandQueue.stepIndex;

    void this.recorder.log().then((recorded) => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(recorded.log)], {type: "application/json"}));
      const link = document.createElement("a");
      link.href = url;
      link.download = `micropolis-log-${step}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoked once the download has had time to start: revoking at once can cancel it
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      if (recorded.unhashed !== null) {
        console.error(`The command log has no checkpoints: ${recorded.unhashed.message}`);
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
      this.commandQueue.send(LOCAL_PLAYER, budgetCommand(choice.funding, choice.tax));
    }
  }

  // The arguments the budget window opens with: the budget record
  private budgetWindowValues(): unknown[] {
    return [this.simulation.budgetRecord()];
  }

  private handleSettingsRequest(): void {
    // The city settings as the window shows them, which its choices are compared with when it closes
    const shown = this.simulation.settingsRecord();
    const client = {autoBulldoze: this.autoBulldoze.isOn(), seed: this.simulation.seed,
                    resumeSpeed: this.speedControl.getRunningSpeed()};

    if (this.windows.open(this.settingsWindow, shown, client)) {
      this.settingsShown = shown;
    }
  }

  // The tiles the player's tool reaches gather into paths (see ToolPaths), sent each tick by sendToolPaths
  private handleTool(data: ToolClick): void {
    // Were was the tool clicked?
    const tileCoords = this.gameCanvas.canvasCoordinateToTileCoordinate(data.x, data.y);

    const toolName = this.inputStatus.toolName;
    if (tileCoords === null || toolName === null) {
      this.toolPaths.lost();
      return;
    }

    // The view may show a margin around the map, where there is no tile to report on
    if (toolName === "query") {
      if (this.gameMap.testBounds(tileCoords.x, tileCoords.y)) {
        this.queryTool.query(tileCoords.x, tileCoords.y);
      }
      return;
    }

    this.toolPaths.reached(toolName as ToolName, {x: tileCoords.x, y: tileCoords.y}, data.start);
  }

  // The tool output shows how the player's last tool command went
  private handleCommandResult(result: CommandResult): void {
    const outcome = toolOutcome(result);
    if (outcome === null) {
      return;
    }

    if (outcome === "rejected") {
      console.warn(`Tool command rejected: ${result.reason}`);
    }

    let text = "Tools";
    if (outcome === "needsBulldoze") {
      text = Text.toolMessages.needsDoze;
    } else if (outcome === "noMoney") {
      text = Text.toolMessages.noMoney;
    }
    requiredElement("toolOutput").textContent = text;
  }

  private handleSave(): void {
    this.save();
    this.windows.open(this.saveWindow);
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

  private processFrontEndMessage(message: FrontEndMessage): void {
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
    // Determine whether we need to draw a tool outline in the
    // canvas
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
    const spriteList = this.simulation.spriteManager.getSpritesInView(origin.x, origin.y, canvas.canvasWidth,
                                                                      canvas.canvasHeight);

    if (spriteList.length === 0) {
      return null;
    }

    return spriteList;
  }
}
