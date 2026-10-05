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

// CLASSIFICATION_UPDATED, DATE_UPDATED, FUNDS_CHANGED, POPULATION_UPDATED, SCORE_UPDATED and SPEED_CHANGED are
// simulation behaviour, which Messages in the C# rules names, and which the client doesn't read: it shows the date, the
// speed and the city's figures from the state messages the server's city host sends. The client's own events and
// notices, which no city sends, are in uiMessages.ts.

export const BUDGET_REVIEW_DUE = "Year-end budget to review";
export const BLACKOUTS_REPORTED = "Blackouts reported";
export const CITY_STATUS_UPDATED = "City status updated";
export const CLASSIFICATION_UPDATED = "Classification updated";
export const COMMAND_RESULT = "Command result";
export const DATE_UPDATED = "Date changed";
export const EARTHQUAKE = "Earthquake";
export const EXPLOSION_REPORTED = "Explosion Reported";
export const FIRE_REPORTED = "Fire!";
export const FIRE_STATION_NEEDS_FUNDING = "Fire station needs funding";
export const FLOODING_REPORTED = "Flooding reported";
export const FRONT_END_MESSAGE = "Front-end Message";
export const FUNDS_CHANGED = "Total funds has changed";
export const HEAVY_TRAFFIC = "Heavy traffic reported";
export const HELICOPTER_CRASHED = "Helicopter crashed";
export const HIGH_CRIME = "High crime";
export const HIGH_POLLUTION = "High pollution";
export const MONSTER_SIGHTED = "Monster sighted";
export const NEED_AIRPORT = "Airport needed";
export const NEED_ELECTRICITY = "More power needed";
export const NEED_FIRE_STATION = "Fire station needed";
export const NEED_MORE_COMMERCIAL = "More commercial zones needed";
export const NEED_MORE_INDUSTRIAL = "More industrial zones needed";
export const NEED_MORE_RAILS = "More railways needed";
export const NEED_MORE_RESIDENTIAL = "More residential needed";
export const NEED_MORE_ROADS = "More roads needed";
export const NEED_POLICE_STATION = "Police station needed";
export const NEED_SEAPORT = "Seaport needed";
export const NEED_STADIUM = "Stadium needed";
export const NO_MONEY = "No money";
export const NOT_ENOUGH_POWER = "Not enough power";
export const NUCLEAR_MELTDOWN = "Nuclear Meltdown";
export const OVERLAY_UPDATED = "Overlay layer updated";
export const PLANE_CRASHED = "Plane crashed";
export const POLICE_NEEDS_FUNDING = "Police need funding";
export const POPULATION_UPDATED = "Population updated";
export const REACHED_CAPITAL = "Now a capital";
export const REACHED_CITY = "Now a city";
export const REACHED_METROPOLIS = "Now a metropolis";
export const REACHED_MEGALOPOLIS = "Now a megalopolis";
export const REACHED_TOWN = "Now a town";
export const ROAD_NEEDS_FUNDING = "Roads need funding";
export const SCORE_UPDATED = "Scoe updated";
export const SHIP_CRASHED = "Shipwrecked";
export const SPEED_CHANGED = "Speed changed";
export const TAX_TOO_HIGH = "Tax too high";
export const TORNADO_SIGHTED = "Tornado sighted";
export const TRAFFIC_JAMS = "Traffic jams reported";
export const TRAIN_CRASHED = "Train crashed";
export const VALVES_UPDATED = "Valves updated";

export const DISASTER_MESSAGES = [
  EARTHQUAKE,
  EXPLOSION_REPORTED,
  FIRE_REPORTED,
  FLOODING_REPORTED,
  MONSTER_SIGHTED,
  NUCLEAR_MELTDOWN,
  TORNADO_SIGHTED,
];

export const CRASHES = [
  HELICOPTER_CRASHED,
  PLANE_CRASHED,
  SHIP_CRASHED,
  TRAIN_CRASHED,
];
