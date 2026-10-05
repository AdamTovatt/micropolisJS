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

// The names of the client's own events and notices, which no city sends: what the player asks of the controls, what a
// window closes with, and the notifications the page shows of its own accord. The names the city sends are in
// messages.ts. A notice is shown by its subject as a news message is, so no name here shares a string with one there,
// as test/messages.ts checks.

export const BUDGET_REQUESTED = "Budget window requested";
export const BUDGET_WINDOW_CLOSED = "Budget window closed";
export const DEBUG_WINDOW_REQUESTED = "Debug Window Requested";
export const DEBUG_WINDOW_CLOSED = "Debug Window Closed";
export const DISASTER_REQUESTED = "Disaster Requested";
export const DISASTER_WINDOW_CLOSED = "Disaster window closed";
export const EVAL_REQUESTED = "Evaluation Requested";
export const EVAL_WINDOW_CLOSED = "Eval window closed";
export const MINIMAP_TOGGLE_REQUESTED = "Minimap toggle requested";
export const PAUSE_REQUESTED = "Pause requested";
export const QUERY_WINDOW_CLOSED = "Query window closed";
export const SAVE_REQUESTED = "Save requested";
export const SAVE_WINDOW_CLOSED = "Save window closed";
export const SCREENSHOT_LINK_CLOSED = "Screenshot link closed";
export const SCREENSHOT_WINDOW_CLOSED = "Screenshot window closed";
export const SCREENSHOT_WINDOW_REQUESTED = "Screenshot window requested";
export const SETTINGS_WINDOW_CLOSED = "Settings window closed";
export const SETTINGS_WINDOW_REQUESTED = "Settings window requested";
export const TOOL_CLICKED = "Tool clicked";
export const TOUCH_WINDOW_CLOSED = "Touch Window closed";
export const WELCOME = "Welcome to micropolisJS";
export const ZOOM_REQUESTED = "Zoom requested";
