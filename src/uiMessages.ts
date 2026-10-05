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

// The names of the client's own events and notices, which no city sends: what the player asks of the controls and does
// with a tool, and the notifications the page shows of its own accord. The names the city sends are in
// messages.ts. A notice is shown by its subject as a news message is, so no name here shares a string with one there,
// as test/messages.ts checks.

export const BUDGET_REQUESTED = "Budget window requested";
export const DEBUG_WINDOW_REQUESTED = "Debug Window Requested";
export const DISASTER_REQUESTED = "Disaster Requested";
export const DOWNLOAD_REQUESTED = "Download requested";
export const EVAL_REQUESTED = "Evaluation Requested";
export const MINIMAP_TOGGLE_REQUESTED = "Minimap toggle requested";
export const PAUSE_REQUESTED = "Pause requested";
export const SAVE_REQUESTED = "Save requested";
export const SCREENSHOT_WINDOW_REQUESTED = "Screenshot window requested";
export const SETTINGS_WINDOW_REQUESTED = "Settings window requested";
export const TOOL_CLICKED = "Tool clicked";
export const WELCOME = "Welcome to micropolisJS";
export const ZOOM_REQUESTED = "Zoom requested";
