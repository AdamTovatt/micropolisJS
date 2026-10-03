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

import $ from "jquery";

import { AutoBulldozePreference } from './autoBulldozePreference.ts';
import { BudgetWindow } from './budgetWindow.js';
import { CommandRecorder } from './commandLog.ts';
import { CommandQueue } from './commandQueue.ts';
import { LOCAL_PLAYER } from './commands.ts';
import { Config } from './config.js';
import { DebugWindow } from './debugWindow.js';
import { DisasterWindow } from './disasterWindow.js';
import { ToolPaths } from './dragPath.ts';
import { EvaluationWindow } from './evaluationWindow.ts';
import { GameCanvas } from './gameCanvas.js';
import { InfoBar } from './infoBar.js';
import { InputStatus } from './inputStatus.js';
import * as Messages from './messages.ts';
import { MonsterTV } from './monsterTV.js';
import { Notification } from './notification.js';
import { OverlayPicker, pageOverlaySource } from './overlayPicker.ts';
import { QueryWindow } from './queryWindow.js';
import { RCI } from './rci.js';
import { SaveWindow } from './saveWindow.js';
import { ScreenshotLinkWindow } from './screenshotLinkWindow.js';
import { ScreenshotWindow } from './screenshotWindow.js';
import { SettingsWindow } from './settingsWindow.js';
import { Simulation } from './simulation.js';
import { SpeedControl } from './speedControl.ts';
import { plainSavedState } from './stateHash.ts';
import { StatusPanel } from './statusPanel.ts';
import { StepDriver } from './stepDriver.ts';
import { Storage } from './storage.js';
import { Text } from './text.js';
import { TouchWarnWindow } from './touchWarnWindow.ts';
import { UiRandom } from './uiRandom.ts';
import { budgetCommand, settingsCommands, toolOutcome } from './windowCommands.ts';
import { WindowManager } from './windowManager.ts';

var disasterTimeout = 20 * 1000;


// A game of the given simulation: Game.newGame and Game.fromSave build one
function Game(simulation, logStart, tileSet, snowTileSet, spriteSheet, name) {
  this.tileSet = tileSet;
  this.snowTileSet = snowTileSet;
  this.name = name;
  this.autoBulldoze = new AutoBulldozePreference(Storage.canStore ? window.localStorage : null);
  this.simulation = simulation;
  this.gameMap = simulation.getMap();

  this.rci = new RCI('RCIContainer', this.simulation);
  this.statusPanel = new StatusPanel('statusPanel', this.simulation);

  // Note: must init canvas before inputStatus
  this.gameCanvas = new GameCanvas('canvasContainer');
  this.gameCanvas.init(this.gameMap, this.tileSet, spriteSheet);
  this.inputStatus = new InputStatus(this.gameMap, tileSet.tileWidth);

  this.overlayPicker = new OverlayPicker('overlayPanel', pageOverlaySource(this.simulation), this.gameCanvas);

  this.mouse = null;
  this.lastCoord = null;

  this.toolPaths = new ToolPaths();
  this.lastBadMessageTime = null;

  this.speedControl = new SpeedControl(this.simulation, function(speed) {
    this.commandQueue.send(LOCAL_PLAYER, {type: 'setSpeed', speed: speed});
  }.bind(this), this.inputStatus.showPaused.bind(this.inputStatus));

  // Initialise monsterTV
  this.monsterTV = new MonsterTV(this.gameMap, tileSet, spriteSheet);

  var opacityLayerID = 'opaque';

  this.budgetWindow = new BudgetWindow(opacityLayerID, 'budget');
  this.windows = new WindowManager(this.budgetWindow, this.budgetWindowValues.bind(this));
  this.simulation.addEventListener(Messages.BUDGET_REVIEW_DUE, this.windows.budgetReviewDue.bind(this.windows));

  this.handleWindowClosure = this.windows.closed.bind(this.windows);

  // Hook up listeners to open/close evaluation window
  this.evalWindow = new EvaluationWindow(opacityLayerID, 'evalWindow');
  this.evalWindow.addEventListener(Messages.EVAL_WINDOW_CLOSED, this.handleWindowClosure);
  this.inputStatus.addEventListener(Messages.EVAL_REQUESTED, this.handleEvalRequest.bind(this));

  // ... and similarly for the budget window
  this.budgetWindow.addEventListener(Messages.BUDGET_WINDOW_CLOSED, this.handleBudgetWindowClosure.bind(this));
  this.inputStatus.addEventListener(Messages.BUDGET_REQUESTED, this.handleBudgetRequest.bind(this));

  // ... and also the disaster window
  this.disasterWindow = new DisasterWindow(opacityLayerID, 'disasterWindow');
  this.disasterWindow.addEventListener(Messages.DISASTER_WINDOW_CLOSED, this.handleDisasterWindowClosure.bind(this));
  this.inputStatus.addEventListener(Messages.DISASTER_REQUESTED, this.handleDisasterRequest.bind(this));

  // ... the debug window
  this.debugWindow = new DebugWindow(opacityLayerID, 'debugWindow');
  this.debugWindow.addEventListener(Messages.DEBUG_WINDOW_CLOSED, this.handleDebugWindowClosure.bind(this));
  this.inputStatus.addEventListener(Messages.DEBUG_WINDOW_REQUESTED, this.handleDebugRequest.bind(this));

  // ... the settings window
  this.settingsWindow = new SettingsWindow(opacityLayerID, 'settingsWindow');
  this.settingsWindow.addEventListener(Messages.SETTINGS_WINDOW_CLOSED, this.handleSettingsWindowClosure.bind(this));
  this.inputStatus.addEventListener(Messages.SETTINGS_WINDOW_REQUESTED, this.handleSettingsRequest.bind(this));

  // ... the screenshot window
  this.screenshotWindow = new ScreenshotWindow(opacityLayerID, 'screenshotWindow');
  this.screenshotWindow.addEventListener(Messages.SCREENSHOT_WINDOW_CLOSED, this.handleScreenshotWindowClosure.bind(this));
  this.inputStatus.addEventListener(Messages.SCREENSHOT_WINDOW_REQUESTED, this.handleScreenshotRequest.bind(this));

  // ... the screenshot link window
  this.screenshotLinkWindow = new ScreenshotLinkWindow(opacityLayerID, 'screenshotLinkWindow');
  this.screenshotLinkWindow.addEventListener(Messages.SCREENSHOT_LINK_CLOSED, this.handleWindowClosure);

  // ... the save confirmation window
  this.saveWindow = new SaveWindow(opacityLayerID, 'saveWindow');
  this.saveWindow.addEventListener(Messages.SAVE_WINDOW_CLOSED, this.handleWindowClosure);

  // ... the touch warn window
  this.touchWindow = new TouchWarnWindow(opacityLayerID, 'touchWarnWindow');
  this.touchWindow.addEventListener(Messages.TOUCH_WINDOW_CLOSED, this.handleWindowClosure);

  // ... and finally the query window
  this.queryWindow = new QueryWindow(opacityLayerID, 'queryWindow');
  this.queryWindow.addEventListener(Messages.QUERY_WINDOW_CLOSED, this.handleWindowClosure);
  this.inputStatus.addEventListener(Messages.QUERY_WINDOW_NEEDED, this.handleQueryRequest.bind(this));

  // Listen for clicks on the save button
  this.inputStatus.addEventListener(Messages.SAVE_REQUESTED, this.handleSave.bind(this));

  // Listen for front end messages
  this.simulation.addEventListener(Messages.FRONT_END_MESSAGE, this.processFrontEndMessage.bind(this));

  // Listen for tool clicks, and how the commands they send went
  this.inputStatus.addEventListener(Messages.TOOL_CLICKED, this.handleTool.bind(this));
  this.simulation.addEventListener(Messages.COMMAND_RESULT, this.handleCommandResult.bind(this));

  // And pauses
  this.inputStatus.addEventListener(Messages.PAUSE_REQUESTED, this.handlePause.bind(this));

  // And date changes
  // XXX Not yet activated
  //this.simulation.addEventListener(Messages.DATE_UPDATED, this.onDateChange.bind(this));

  this.infoBar = InfoBar('cclass', 'population', 'score', 'funds', 'date', 'name');
  var initialValues = {
    classification: this.simulation.evaluation.cityClass,
    population: this.simulation.evaluation.cityPop,
    score: this.simulation.evaluation.cityScore,
    funds: this.simulation.budget.totalFunds,
    date: this.simulation.getDate(),
    name: this.name
  };
  this.infoBar(this.simulation, initialValues);

  this._notificationBar = new Notification('#notifications', this.gameCanvas);

  // Listen for touches, so we can warn tablet users
  this.touchListener = touchListener.bind(this);
  window.addEventListener('touchstart', this.touchListener, false);

  // Unhide controls
  this.revealControls();

  // Run the sim. Every change the player makes to the city is a command, sent through the queue.
  this.recorder = new CommandRecorder(this.simulation, logStart);
  this.commandQueue = new CommandQueue(this.simulation, this.recorder);
  this.stepDriver = new StepDriver();
  this.isStepping = isStepping.bind(this);
  this.stepSimulation = this.commandQueue.step.bind(this.commandQueue);
  this.tick = tick.bind(this);
  this.tick();

  // Paint the map
  var debug = Config.debug || Config.gameDebug;
  if (debug) {
    $('#debug').toggle();
    this.frameCount = 0;
    this.animStart = new Date();
    this.lastElapsed = -1;
  }

  this.commonAnimate = commonAnimate.bind(this);
  this.animate = (debug ? debugAnimate : this.commonAnimate).bind(this);
  this.animate();
}


Game.prototype.save = function() {
  var saveData = {name: this.name};
  this.simulation.save(saveData);

  Storage.saveGame(saveData);
};


// A new game on the map generated from the game seed, at the chosen level
Game.newGame = function(map, seed, tileSet, snowTileSet, spriteSheet, difficulty, name) {
  var level = difficulty || 0;
  var simulation = new Simulation(map, level, Simulation.SPEED_MED, seed);
  return new Game(simulation, {seed: seed, level: level}, tileSet, snowTileSet, spriteSheet, name || 'MyTown');
};


// A game restored from what Game.save wrote
Game.fromSave = function(savedGame, tileSet, snowTileSet, spriteSheet) {
  // The session's log starts from the city as loaded
  var simulation = Simulation.fromSave(savedGame);
  return new Game(simulation, {save: plainSavedState(simulation)}, tileSet, snowTileSet, spriteSheet, savedGame.name);
};


var nextFrame =
  window.requestAnimationFrame ||
  window.mozRequestAnimationFrame ||
  window.webkitRequestAnimationFrame;


Game.prototype.revealControls = function() {
 $('.initialHidden').each(function() {
   $(this).removeClass('initialHidden');
 });

 this._notificationBar.news({subject: Messages.WELCOME});
 this.rci.update({residential: 750, commercial: 750, industrial: 750});
};


Game.prototype.onDateChange = function(date) {
  if (date.month === 10 && UiRandom.stream.getChance(10))
    this.gameCanvas.changeTileSet(this.snowTileSet);
  else if (date.month === 1)
    this.gameCanvas.changeTileSet(this.tileSet);
};


Game.prototype.handleDisasterWindowClosure = function(request) {
  this.windows.closed();

  if (request === DisasterWindow.DISASTER_NONE)
    return;

  this.commandQueue.send(LOCAL_PLAYER, {type: 'triggerDisaster', kind: request});
};


Game.prototype.handleSettingsWindowClosure = function(actions) {
  this.windows.closed();

  var chosen = {autoBudget: this.settingsShown.autoBudget, disasters: this.settingsShown.disasters};

  for (var i = 0, l = actions.length; i < l; i++) {
    var a = actions[i];

    switch (a.action) {
      case SettingsWindow.AUTOBUDGET:
        chosen.autoBudget = a.data;
        break;

      case SettingsWindow.AUTOBULLDOZE:
        this.autoBulldoze.set(a.data);
        break;

      case SettingsWindow.SPEED:
        this.speedControl.setRunningSpeed(a.data);
        break;

      case SettingsWindow.DISASTERS_CHANGED:
        chosen.disasters = a.data;
        break;

      default:
        console.warn('Unexpected action', a);
    }
  }

  settingsCommands(this.settingsShown, chosen).forEach(function(command) {
    this.commandQueue.send(LOCAL_PLAYER, command);
  }, this);
};


Game.prototype.handleDebugWindowClosure = function(actions) {
  this.windows.closed();

  for (var i = 0, l = actions.length; i < l; i++) {
    var a = actions[i];

    switch (a.action) {
      case DebugWindow.ADD_FUNDS:
        this.commandQueue.send(LOCAL_PLAYER, {type: 'addFunds'});
        break;

      case DebugWindow.DOWNLOAD_LOG:
        this.downloadLog();
        break;

      default:
        console.warn('Unexpected action', a);
    }
  }
};


// Saves the session's command log as a file, for the headless runner to replay: `npm run simulate -- --log <file>`.
// Where the page can't work out state hashes, the log has no checkpoints, and the player is told.
Game.prototype.downloadLog = function() {
  var step = this.commandQueue.stepIndex;

  this.recorder.log().then(function(recorded) {
    var url = URL.createObjectURL(new Blob([JSON.stringify(recorded.log)], {type: 'application/json'}));
    var link = document.createElement('a');
    link.href = url;
    link.download = 'micropolis-log-' + step + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoked once the download has had time to start: revoking at once can cancel it
    window.setTimeout(function() { URL.revokeObjectURL(url); }, 1000);

    if (recorded.unhashed !== null) {
      console.error('The command log has no checkpoints: ' + recorded.unhashed.message);
      this._notificationBar.badNews({subject: Messages.LOG_UNCHECKED});
    }
  }.bind(this));
};


Game.prototype.handleScreenshotWindowClosure = function(action) {
  this.windows.closed();

  if (action === null)
    return;

  var dataURI;
  if (action === ScreenshotWindow.SCREENSHOT_VISIBLE)
    dataURI = this.gameCanvas.screenshotVisible();
  else if (action === ScreenshotWindow.SCREENSHOT_ALL)
    dataURI = this.gameCanvas.screenshotMap();

  this.windows.open(this.screenshotLinkWindow, dataURI);
};


Game.prototype.handleBudgetWindowClosure = function(data) {
  this.windows.closed();

  if (!data.cancelled)
    this.commandQueue.send(LOCAL_PLAYER, budgetCommand(data.funding, data.taxPercent));
};


// The values the budget window opens with: each service's maintenance cost and funding percentage (0 to 1), by service.
Game.prototype.budgetWindowValues = function() {
  var budget = this.simulation.budget;

  return [{
    maintenance: budget.maintenance(),
    percents: budget.percents(),
    taxRate: budget.cityTax,
    totalFunds: budget.totalFunds,
    taxesCollected: budget.taxFund,
    forecast: budget.forecast.bind(budget)
  }];
};


Game.prototype.handleBudgetRequest = function() {
  this.windows.openBudget();
};


Game.prototype.handleEvalRequest = function() {
  this.windows.open(this.evalWindow, this.simulation.evaluationRecord());
};


Game.prototype.handleSettingsRequest = function() {
  // The city settings as the window shows them, which its choices are compared with when it closes
  var shown = {autoBudget: this.simulation.budget.autoBudget,
               disasters: this.simulation.disasterManager.disastersEnabled};

  if (this.windows.open(this.settingsWindow, {
    autoBudget: shown.autoBudget, autoBulldoze: this.autoBulldoze.isOn(),
    speed: this.speedControl.getRunningSpeed(), disasters: shown.disasters, seed: this.simulation.seed
  }))
    this.settingsShown = shown;
};


Game.prototype.handleDebugRequest = function() {
  this.windows.open(this.debugWindow);
};


Game.prototype.handleDisasterRequest = function() {
  this.windows.open(this.disasterWindow);
};


Game.prototype.handleQueryRequest = function() {
  this.windows.open(this.queryWindow);
};


Game.prototype.handleScreenshotRequest = function() {
  this.windows.open(this.screenshotWindow);
};


// The tiles the player's tool reaches gather into paths (see ToolPaths), sent each tick by sendToolPaths
Game.prototype.handleTool = function(data) {
  // Were was the tool clicked?
  var tileCoords = this.gameCanvas.canvasCoordinateToTileCoordinate(data.x, data.y);

  var toolName = this.inputStatus.toolName;
  if (tileCoords === null || toolName === null) {
    this.toolPaths.lost();
    return;
  }

  if (toolName === 'query') {
    this.inputStatus.queryTool.doTool(tileCoords.x, tileCoords.y, this.simulation.blockMaps);
    return;
  }

  this.toolPaths.reached(toolName, {x: tileCoords.x, y: tileCoords.y}, data.start);
};


// Sends each path gathered since the last tick as one tool command: a click, or a drag's latest tiles
Game.prototype.sendToolPaths = function() {
  this.toolPaths.take().forEach(function(toolPath) {
    this.commandQueue.send(LOCAL_PLAYER, {type: 'tool', tool: toolPath.tool, path: toolPath.path,
                                          autoBulldoze: this.autoBulldoze.isOn()});
  }, this);
};


// The tool output shows how the player's last tool command went
Game.prototype.handleCommandResult = function(result) {
  var outcome = toolOutcome(result);
  if (outcome === null)
    return;

  switch (outcome) {
    case 'needsBulldoze':
      $('#toolOutput').text(Text.toolMessages.needsDoze);
      break;

    case 'noMoney':
      $('#toolOutput').text(Text.toolMessages.noMoney);
      break;

    case 'rejected':
      console.warn('Tool command rejected: ' + result.reason);

      /* falls through */
    default:
      $('#toolOutput').html('Tools');
  }
};


Game.prototype.handleSave = function() {
  this.save();
  this.windows.open(this.saveWindow);
};


Game.prototype.handlePause = function() {
  this.speedControl.togglePause();
};


Game.prototype.handleInput = function() {
  if (!this.windows.holdsInput()) {
    // Handle keyboard movement

    if (this.inputStatus.left)
      this.gameCanvas.moveWest();
    else if (this.inputStatus.up)
      this.gameCanvas.moveNorth();
    else if (this.inputStatus.right)
      this.gameCanvas.moveEast();
    else if (this.inputStatus.down)
      this.gameCanvas.moveSouth();
  }

  if (this.inputStatus.escape) {
    // We need to handle escape, as InputStatus won't know what windows are showing
    if (this.windows.holdsInput())
      this.windows.closeShown();
    else
      this.inputStatus.clearTool();
  }
};


// Will be bound on construction
var touchListener = function() {
  window.removeEventListener('touchstart', this.touchListener, false);
  this.windows.open(this.touchWindow);
};


Game.prototype.processFrontEndMessage = function(message) {
  var subject = message.subject;
  var d = new Date();

  // Good news is a milestone: the city reaching a new class. It shows even over a recent disaster, unlike neutral news,
  // as the notification is the only place the player learns of it
  if (Text.goodMessages[subject] !== undefined) {
    this._notificationBar.goodNews(message);
    return;
  }

  // Show disaster if applicable
  if (message.data) {
    if (message.data.showable)
    this.monsterTV.show(message.data.x, message.data.y);
    else if (message.data.trackable)
    this.monsterTV.track(message.data.x, message.data.y, message.data.sprite);
  }

  if (Text.badMessages[subject] !== undefined) {
    this._notificationBar.badNews(message);
    if (Messages.DISASTER_MESSAGES.indexOf(message.subject) !== -1)
      this.lastBadMessageTime = d;
    return;
  }

  if (Text.neutralMessages[subject] !== undefined) {
    if (this.lastBadMessageTime === null || d - this.lastBadMessageTime > disasterTimeout) {
      this.lastBadMessageTime = null;
      this._notificationBar.news(message);
    }
    return;
  }

  console.warn('Unexpected message: ', subject);
};


Game.prototype.calculateMouseForPaint = function() {
  // Determine whether we need to draw a tool outline in the
  // canvas
  var mouse = null;

  if (this.inputStatus.mouseX !== -1 && this.inputStatus.toolWidth > 0) {
    var tileCoords = this.gameCanvas.canvasCoordinateToTileOffset(this.inputStatus.mouseX, this.inputStatus.mouseY);
    if (tileCoords !== null) {
      mouse = {};

      mouse.x = tileCoords.x;
      mouse.y = tileCoords.y;

      // The inputStatus fields came from DOM attributes, so will be strings.
      // Coerce back to numbers.
      mouse.width = this.inputStatus.toolWidth - 0;
      mouse.height = this.inputStatus.toolWidth - 0;
      mouse.colour = this.inputStatus.toolColour || 'yellow';
    }
  }

  return mouse;
};


Game.prototype.calculateSpritesForPaint = function(canvas) {
  var origin = canvas.getTileOrigin();
  var spriteList = this.simulation.spriteManager.getSpritesInView(origin.x, origin.y, canvas.canvasWidth, canvas.canvasHeight);

  if (spriteList.length === 0)
    return null;

  return spriteList;
};


// The city steps unless it is paused, the screen is too small to play, or the tab is hidden: a hidden tab is not
// watched, so the city waits rather than running on unseen
var isStepping = function() {
  return !this.simulation.isPaused() && !$('#tooSmall').is(':visible') && !document.hidden;
};


var tick = function() {
  this.handleInput();

  // The tiles clicked or dragged over since the last tick go as tool commands, one per path. The commands sent since the
  // last tick apply first, whether or not the city is stepping: you can build when paused.
  this.sendToolPaths();
  this.commandQueue.applyCommands();

  // Run the sim: as many steps as the time since the last tick is due
  this.stepDriver.run(performance.now(), this.isStepping, this.stepSimulation);

  // A year-end budget review that fell due during those steps, or while a window showed
  this.windows.openDue();

  this.mouse = this.windows.holdsInput() ? null : this.calculateMouseForPaint();

  window.setTimeout(this.tick, 0);
};


var commonAnimate = function() {
  var paused = this.simulation.isPaused();
  var sprites = this.calculateSpritesForPaint(this.gameCanvas);
  this.gameCanvas.paint(this.mouse, sprites, paused);

  sprites = this.calculateSpritesForPaint(this.monsterTV.canvas);
  this.monsterTV.paint(sprites, paused);

  nextFrame(this.animate);
};


var debugAnimate = function() {
  var date = new Date();
  var elapsed = Math.floor((date - this.animStart) / 1000);

  if (elapsed > this.lastElapsed && this.frameCount > 0) {
    $('#fpsValue').text(Math.floor(this.frameCount/elapsed));
    this.lastElapsed = elapsed;
  }

  this.frameCount++;
  this.commonAnimate();
};


export { Game };
