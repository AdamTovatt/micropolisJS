/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 * Modified in Adam Tovatt's continuation of micropolisJS. Copyright (C) 2026 Adam Tovatt
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
import { BudgetWindow } from "./budgetWindow";
import type { Presence } from "./cityClient";
import { linkToCity } from "./cityLink";
import type { CitySource, StartedCity } from "./citySource";
import { CityState } from "./cityState";
import { ClientConfig } from "./clientConfig";
import { DebugWindow } from "./debugWindow";
import { DisasterWindow } from "./disasterWindow";
import { downloadJson, saveFileName } from "./download";
import { isShown, requiredElement, setShown, toggleShown } from "./domElements";
import { EvaluationWindow } from "./evaluationWindow";
import { GameCanvas } from "./gameCanvas";
import { GameControls } from "./gameControls";
import { InfoBar, placeInfoBar } from "./infoBar";
import { InputStatus } from "./inputStatus";
import * as Messages from "./messages";
import { Minimap } from "./minimap";
import { MonsterTV } from "./monsterTV";
import { LastEvent, NewsHold, routeMessage } from "./news";
import { NotificationBar, placeNotificationBar } from "./notification";
import { OtherPlayers } from "./otherPlayers";
import { cityOverlaySource, OverlayPicker } from "./overlayPicker";
import { PaintableSprite, spritesInView } from "./paintable";
import { placePanelFolding } from "./panelFolding";
import { CommandResult, NewsMessage } from "./protocol";
import { QueryWindow } from "./queryWindow";
import { placeRCI, RCI } from "./rci";
import { MapArt, tileSetPixels } from "./renderAssets";
import { SaveWindow } from "./saveWindow";
import { ScreenshotLinkWindow } from "./screenshotLinkWindow";
import { ScreenshotWindow } from "./screenshotWindow";
import { SettingsWindow } from "./settingsWindow";
import { SpeedControl } from "./speedControl";
import { StatusPanel } from "./statusPanel";
import { pageStore } from "./storage";
import { attachToTestHook } from "./testHook";
import { Text } from "./text";
import { placeToolToast, PlacedToast, toastedFailure } from "./toolToast";
import { TouchWarnWindow } from "./touchWarnWindow";
import * as UiMessages from "./uiMessages";
import type { TilePoint } from "./viewPosition";
import { toolOutcome } from "./windowCommands";
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
// queries, and shows the city from the client's copy of it, which the source's state messages build. What the player's
// mouse, keyboard and windows do is the controls' (GameControls).
export class Game {
  readonly gameCanvas: GameCanvas;

  private readonly source: CitySource;
  private readonly state: CityState;
  private readonly rci: RCI;
  private readonly statusPanel: StatusPanel;
  private readonly infoBar: InfoBar;
  private readonly speedControl: SpeedControl;
  readonly monsterTV: MonsterTV;
  private readonly controls: GameControls;
  private readonly otherPlayers: OtherPlayers;
  readonly notificationBar: NotificationBar<HTMLElement>;
  readonly toolToast: PlacedToast;
  private readonly minimap: Minimap;
  private readonly tooSmall = requiredElement("tooSmall");
  private readonly lastEventButton = requiredElement("lastEvent");

  private readonly newsHold = new NewsHold();
  private readonly lastEvent = new LastEvent();

  // Debug mode's frame counter
  private readonly fpsValue = requiredElement("fpsValue");
  private frameCount = 0;
  private animStart = 0;
  private lastElapsed = -1;

  private readonly touchListener = () => {
    window.removeEventListener("touchstart", this.touchListener, false);
    this.controls.warnOfTouch();
  };

  private readonly tick = () => {
    this.controls.tick(performance.now());
    window.setTimeout(this.tick, 0);
  };

  private readonly commonAnimate = () => {
    const paused = this.speedControl.isPaused();
    let sprites = this.calculateSpritesForPaint(this.gameCanvas);
    this.gameCanvas.paint(this.controls.outlines(), sprites, paused);

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
    const autoBulldoze = new AutoBulldozePreference(pageStore());

    // A city on the server goes in the page's address, so the address invites another player in, and a reload rejoins
    linkToCity(started, window);

    this.rci = placeRCI(requiredElement("RCIMeter"));
    this.statusPanel = new StatusPanel(requiredElement("statusPanelBody"));

    // Note: must init canvas before inputStatus
    this.gameCanvas = new GameCanvas("canvasContainer", state.map, mapArt);
    const windows = new WindowManager();
    const inputStatus = new InputStatus(this.gameCanvas, () => windows.holdsInput());

    new OverlayPicker(requiredElement("overlayPanelBody"), requiredElement("overlayPanelSelect", HTMLSelectElement),
                      cityOverlaySource(source, state), this.gameCanvas);

    // The panels over the map fold to their title strips, as the browser last had them
    const panels = placePanelFolding(pageStore());

    this.minimap = new Minimap(state, tileSetPixels(mapArt), this.gameCanvas);

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
    }, (paused) => inputStatus.showPaused(paused));

    this.monsterTV = new MonsterTV(state.map, mapArt);

    this.infoBar = placeInfoBar(started.name);
    this.infoBar.showDate(state.current("date"));
    this.infoBar.showPopulation(state.current("population"));
    this.infoBar.showEvaluation(state.current("evaluation"));
    this.infoBar.showBudget(state.current("budget"));

    this.notificationBar = placeNotificationBar(this.gameCanvas);
    this.toolToast = placeToolToast();

    this.otherPlayers = new OtherPlayers(presence, requiredElement("activityList"), requiredElement("activityListBody"));

    const opacityLayerID = "opaque";
    const budgetButton = requiredElement("budgetRequest");
    this.controls = new GameControls({
      input: inputStatus,
      view: this.gameCanvas,
      windows,
      gameWindows: {
        budget: new BudgetWindow(opacityLayerID, "budget", source),
        evaluation: new EvaluationWindow(opacityLayerID, "evalWindow"),
        disaster: new DisasterWindow(opacityLayerID, "disasterWindow"),
        debug: new DebugWindow(opacityLayerID, "debugWindow"),
        settings: new SettingsWindow(opacityLayerID, "settingsWindow"),
        screenshot: new ScreenshotWindow(opacityLayerID, "screenshotWindow"),
        screenshotLink: new ScreenshotLinkWindow(opacityLayerID, "screenshotLinkWindow"),
        save: new SaveWindow(opacityLayerID, "saveWindow"),
        touchWarning: new TouchWarnWindow(opacityLayerID, "touchWarnWindow"),
        query: new QueryWindow(opacityLayerID, "queryWindow"),
      },
      reviewMarker: {setLit: (lit) => budgetButton.classList.toggle("reviewDue", lit)},
      source,
      city: state,
      players: this.otherPlayers,
      page: {
        alert: (message) => window.alert(message),
        saveFile: downloadJson,
        togglePause: () => this.speedControl.togglePause(),
        toggleMinimap: () => panels.toggle("map"),
      },
      autoBulldoze,
      seed: started.seed,
      saveFileName: saveFileName(started.name),
    });

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
    this.controls.sendToolPaths();
  }

  // The map tile under the pointer that this player's hover box is drawn at, or null while none is
  get hoverTile(): TilePoint | null {
    return this.controls.hoverTile;
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
      this.controls.budgetReviewDue();
      this.notificationBar.offer({subject: Messages.BUDGET_REVIEW_DUE}, () => this.controls.openBudget());
    });
  }

  // Notes whether the player can see the city: not while the screen is too small to play, which only a resize
  // changes, or while the tab is hidden. The city on the server steps on either way, as its other players see it.
  private readonly updateViewerVisible = (): void => {
    this.controls.setViewerVisible(!isShown(this.tooSmall) && !document.hidden);
  };

  private revealControls(): void {
    document.querySelectorAll(".initialHidden").forEach((element) => element.classList.remove("initialHidden"));

    this.notificationBar.show({subject: UiMessages.WELCOME});
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

  private calculateSpritesForPaint(canvas: SpriteViewport): PaintableSprite[] {
    const origin = canvas.getTileOrigin();
    return spritesInView(this.state.sprites, origin.x, origin.y, canvas.mapPixelWidth, canvas.mapPixelHeight);
  }
}
