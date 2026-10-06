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

import * as Messages from "./messages";
import {
  CITY_PROBLEMS, CityClass, DisasterKind, GameLevel, GrowthBlocker, GrowthOutlook, GrowthZone, OverlayLayer,
  ScoreReason, ServiceAmounts, SPEEDS, ToolName, ZoneCategory,
} from "./protocol";
import type { ToastedFailure } from "./toolToast";
import * as UiMessages from "./uiMessages";

// TODO Some kind of rudimentary L20N based on navigator.language?

// Query tool strings: each band's label, lowest band first, and the name of each zone category in protocol.ts
const densityStrings: readonly string[] = ["Low", "Medium", "High", "Very High"];
const landValueStrings: readonly string[] = ["Slum", "Lower Class", "Middle Class", "High"];
const crimeStrings: readonly string[] = ["Safe", "Light", "Moderate", "Dangerous"];
const pollutionStrings: readonly string[] = ["None", "Moderate", "Heavy", "Very Heavy"];
const rateStrings: readonly string[] = ["Declining", "Stable", "Slow Growth", "Fast Growth"];
// Whether a zone or a conductive tile has power
const poweredStrings = {yes: "Yes", no: "No"};
const zoneCategories: Record<ZoneCategory, string> = {
  CLEAR: "Clear", WATER: "Water", TREES: "Trees", RUBBLE: "Rubble", FLOOD: "Flood",
  RADIOACTIVE_WASTE: "Radioactive Waste", FIRE: "Fire", ROAD: "Road", POWER: "Power", RAIL: "Rail",
  RESIDENTIAL: "Residential", COMMERCIAL: "Commercial", INDUSTRIAL: "Industrial", SEAPORT: "Seaport",
  AIRPORT: "Airport", COAL_POWER: "Coal Power", FIRE_STATION: "Fire Department",
  POLICE_STATION: "Police Department", STADIUM: "Stadium", NUCLEAR_POWER: "Nuclear Power",
  DRAWBRIDGE: "Draw Bridge", RADAR: "Radar Dish", FOUNTAIN: "Fountain", FOOTBALL_GAME: "Steelers 38  Bears 3",
  URANIUM: "Ur 238",
};

// The query tool's words for how the zone holding a tile grows: where it stands, each thing holding it back, that the
// rules assess it only now and then, and what its next trip does with no road at its edge, by the kind of zone where
// they differ
const growth = {
  outlooks: {
    LIKELY_TO_GROW: "Likely to grow",
    MAY_GROW_OR_DECLINE: "May grow or decline",
    HOLDS_STEADY: "Holding steady",
    LIKELY_TO_DECLINE: "Likely to decline",
  } satisfies Record<GrowthOutlook, string>,
  blockers: {
    NO_POWER: "No power",
    LOW_LAND_VALUE: "Land value too low",
    POLLUTION_OUTWEIGHS_LAND_VALUE: "Pollution outweighs its land value",
    TOO_POLLUTED: "Too polluted for anyone to move in",
    FAR_FROM_CENTRE: "Far from the city centre",
    LAND_VALUE_LIMITS_SIZE: "Land value too low to grow bigger",
    NO_FREE_LOT: "No free lot for another house",
    NEIGHBOURHOOD_TOO_SPARSE: "Too few people nearby for apartments",
    FULL: "Fully built up",
  } satisfies Record<Exclude<GrowthBlocker, "LOW_DEMAND">, string>,
  lowDemand: {
    RESIDENTIAL: "Low demand for housing", COMMERCIAL: "Low demand for commerce", INDUSTRIAL: "Low demand for industry",
  } satisfies Record<GrowthZone, string>,
  nowAndThen: {
    RESIDENTIAL: "Homes are assessed now and then", COMMERCIAL: "Commerce is assessed now and then",
    INDUSTRIAL: "Industry is assessed now and then",
  } satisfies Record<GrowthZone, string>,
  noRoad: {
    RESIDENTIAL: "No road at its edge: its people will move out", COMMERCIAL: "No road at its edge: it will decline",
    INDUSTRIAL: "No road at its edge: it will decline",
  } satisfies Record<GrowthZone, string>,
};

// Evaluation window
const gameLevel: Record<GameLevel, string> = {EASY: "Easy", MED: "Medium", HARD: "Hard"};

const cityClass: Record<CityClass, string> = {
  VILLAGE: "Village",
  TOWN: "Town",
  CITY: "City",
  CAPITAL: "Capital",
  METROPOLIS: "Metropolis",
  MEGALOPOLIS: "Megalopolis",
};

const problems: Record<typeof CITY_PROBLEMS[number], string> = {
  CRIME: "Crime",
  POLLUTION: "Pollution",
  HOUSING: "Housing",
  TAXES: "Taxes",
  TRAFFIC: "Traffic",
  UNEMPLOYMENT: "Unemployment",
  FIRE: "Fire",
};

// Steps of the yearly score calculation, as listed in the evaluation window
const scoreReasons: Record<ScoreReason, string> = {
  PROBLEMS: "Base score from problems",
  RES_CAP: "No stadium",
  COM_CAP: "No airport",
  IND_CAP: "No seaport",
  ROAD_FUNDING: "Roads underfunded",
  POLICE_FUNDING: "Police underfunded",
  FIRE_FUNDING: "Fire service underfunded",
  RES_OVERSUPPLY: "Too much residential",
  COM_OVERSUPPLY: "Too much commercial",
  IND_OVERSUPPLY: "Too much industrial",
  MIGRATION: "Population change",
  FIRES: "Fires",
  TAXES: "Tax rate",
  UNPOWERED_ZONES: "Unpowered zones",
  RANGE: "Limit of 0 to 1000",
  AVERAGING: "Averaged with last year",
};

const scoreBreakdown = {
  lastYear: "Last year's score",
  reasons: scoreReasons,
};

// months
const months: readonly string[] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// What the toast at the pointer says when the player's tool command built nothing, for each outcome it tells of
// (toolToast.ts). A rejection's own reason is written by whichever rules ran the command, for a developer: the console
// has it.
const toolFailures: Record<ToastedFailure, string> = {
  needsBulldoze: "Area must be bulldozed first",
  onWater: "Can't build on water",
  noMoney: "Insufficient funds to build that",
  rejected: "That can't be done here",
};

// A map overlay layer's name, and the words for its low and high ends
interface LayerText {
  name: string;
  low: string;
  high: string;
}

// Map overlay strings: the picker, the legend's end of a ramp, as its word with the value the ramp spans there, what it
// says in place of the values while a layer has nothing to show, and each layer's text. An end's word names the end of
// the layer's own range, as "None" does, though a heatmap's ramp spans the city's values: the value beside it says
// where the ramp ends, and the word which way the layer runs.
const overlays: {
  none: string,
  end: (word: string, value: number) => string,
  nothingToShow: string,
  layers: Record<OverlayLayer, LayerText>,
} = {
  none: "None",
  end: (word, value) => `${word} (${value})`,
  nothingToShow: "Nothing to show yet",
  layers: {
    landValue: {name: "Land value", low: "Low", high: "High"},
    housingAppeal: {name: "Housing appeal", low: "Poor", high: "High"},
    pollution: {name: "Pollution", low: "None", high: "Heavy"},
    crime: {name: "Crime", low: "None", high: "High"},
    trafficDensity: {name: "Traffic", low: "None", high: "Jammed"},
    populationDensity: {name: "Population density", low: "Empty", high: "Dense"},
    policeCoverage: {name: "Police coverage", low: "None", high: "Full"},
    fireCoverage: {name: "Fire coverage", low: "None", high: "Full"},
    rateOfGrowth: {name: "Rate of growth", low: "Declining", high: "Growing"},
    powerGrid: {name: "Power grid", low: "Unpowered", high: "Powered"},
    railLoad: {name: "Rail load", low: "Empty", high: "Full"},
  },
};

// How a notification announces a message: good news is a milestone, bad news a disaster or a problem, and neutral
// news advice
export type MessageTone = "good" | "bad" | "neutral";

export interface MessageText {
  text: string;
  tone: MessageTone;
}

// What the notifications and the status panel say for each message
const messages: {[subject: string]: MessageText} = {
  [Messages.FIRE_STATION_NEEDS_FUNDING]: {text: "Fire departments need funding", tone: "neutral"},
  [Messages.NEED_AIRPORT]: {text: "Commerce requires an Airport", tone: "neutral"},
  [Messages.NEED_FIRE_STATION]: {text: "Citizens demand a Fire Department", tone: "neutral"},
  [Messages.NEED_ELECTRICITY]: {text: "Build a Power Plant", tone: "neutral"},
  [Messages.NEED_MORE_INDUSTRIAL]: {text: "More industrial zones needed", tone: "neutral"},
  [Messages.NEED_MORE_COMMERCIAL]: {text: "More commercial zones needed", tone: "neutral"},
  [Messages.NEED_MORE_RESIDENTIAL]: {text: "More residential zones needed", tone: "neutral"},
  [Messages.NEED_MORE_RAILS]: {text: "Inadequate rail system", tone: "neutral"},
  [Messages.NEED_MORE_ROADS]: {text: "More roads required", tone: "neutral"},
  [Messages.NEED_POLICE_STATION]: {text: "Citizens demand a Police Department", tone: "neutral"},
  [Messages.NEED_SEAPORT]: {text: "Industry requires a Sea Port", tone: "neutral"},
  [Messages.NEED_STADIUM]: {text: "Residents demand a Stadium", tone: "neutral"},
  [Messages.ROAD_NEEDS_FUNDING]: {text: "Roads deteriorating, due to lack of funds", tone: "neutral"},
  [Messages.POLICE_NEEDS_FUNDING]: {text: "Police departments need funding", tone: "neutral"},
  [UiMessages.WELCOME]: {text: "Welcome to micropolisJS", tone: "neutral"},
  [Messages.BUDGET_REVIEW_DUE]: {text: "Year-end budget ready: click to review", tone: "neutral"},
  // Under 70% of zones have power while the city has a plant, so what they lack is a connection, not capacity: the
  // not-enough-power condition says when a plant is needed. Short enough for the notification bar's width.
  [Messages.BLACKOUTS_REPORTED]: {
    text: `Unpowered zones: run power lines (${overlays.layers.powerGrid.name} overlay)`,
    tone: "bad",
  },
  [Messages.EARTHQUAKE]: {text: "Major earthquake reported !!", tone: "bad"},
  [Messages.EXPLOSION_REPORTED]: {text: "Explosion detected ", tone: "bad"},
  [Messages.FLOODING_REPORTED]: {text: "Flooding reported !", tone: "bad"},
  [Messages.FIRE_REPORTED]: {text: "Fire reported ", tone: "bad"},
  [Messages.HEAVY_TRAFFIC]: {text: "Heavy Traffic reported", tone: "bad"},
  [Messages.HELICOPTER_CRASHED]: {text: "A helicopter crashed ", tone: "bad"},
  [Messages.HIGH_CRIME]: {text: "Crime very high", tone: "bad"},
  [Messages.HIGH_POLLUTION]: {text: "Pollution very high", tone: "bad"},
  [Messages.MONSTER_SIGHTED]: {text: "A Monster has been sighted !", tone: "bad"},
  [Messages.NO_MONEY]: {text: "YOUR CITY HAS GONE BROKE", tone: "bad"},
  [Messages.NOT_ENOUGH_POWER]: {text: "Blackouts reported: insufficient power capacity", tone: "bad"},
  [Messages.NUCLEAR_MELTDOWN]: {text: "A Nuclear Meltdown has occurred !!", tone: "bad"},
  [Messages.PLANE_CRASHED]: {text: "A plane has crashed ", tone: "bad"},
  [Messages.SHIP_CRASHED]: {text: "Shipwreck reported ", tone: "bad"},
  [Messages.TAX_TOO_HIGH]: {text: "Citizens upset. The tax rate is too high", tone: "bad"},
  [Messages.TORNADO_SIGHTED]: {text: "Tornado reported !", tone: "bad"},
  [Messages.TRAFFIC_JAMS]: {text: "Frequent traffic jams reported", tone: "bad"},
  [Messages.REACHED_CAPITAL]: {text: "Now a capital! Population has reached 50,000", tone: "good"},
  [Messages.REACHED_CITY]: {text: "Now a city! Population has reached 10,000", tone: "good"},
  [Messages.REACHED_MEGALOPOLIS]: {text: "Now a megalopolis! Population has reached 500,000", tone: "good"},
  [Messages.REACHED_METROPOLIS]: {text: "Now a metropolis! Population has reached 100,000", tone: "good"},
  [Messages.REACHED_TOWN]: {text: "Now a town! Population has reached 2,000", tone: "good"},
};

// The title of the disaster view, by the subject of the news whose place it shows, and for news it has none for
const tvTitles: {[subject: string]: string} = {
  [Messages.EARTHQUAKE]: "Earthquake",
  [Messages.EXPLOSION_REPORTED]: "Explosion",
  [Messages.FIRE_REPORTED]: "Fire",
  [Messages.FLOODING_REPORTED]: "Flood",
  [Messages.MONSTER_SIGHTED]: "Monster",
  [Messages.NUCLEAR_MELTDOWN]: "Meltdown",
  [Messages.TORNADO_SIGHTED]: "Tornado",
  [Messages.HELICOPTER_CRASHED]: "Helicopter crash",
  [Messages.PLANE_CRASHED]: "Plane crash",
  [Messages.SHIP_CRASHED]: "Shipwreck",
  [Messages.HEAVY_TRAFFIC]: "Heavy traffic",
};
const tvTitleUnknown = "News";

// Status panel strings
const statusPanel = {
  capsLabel: "Demand capped",
  commercialCap: "Commercial",
  commercialCapTitle: "Commercial demand can't rise above zero until the city has an airport",
  industrialCap: "Industrial",
  industrialCapTitle: "Industrial demand can't rise above zero until the city has a seaport",
  powerLabel: "Power",
  powerUnknown: "—",
  residentialCap: "Residential",
  residentialCapTitle: "Residential demand can't rise above zero until the city has a stadium",
};

// What the activity list says another player did, after their name, for each command that went through
const playerActions = {
  tools: {
    airport: "built an airport", bulldozer: "bulldozed", coal: "built a coal power plant",
    commercial: "zoned commercial land", fire: "built a fire station", industrial: "zoned industrial land",
    nuclear: "built a nuclear power plant", park: "built a park", police: "built a police station",
    port: "built a seaport", rail: "laid rail", residential: "zoned residential land", road: "built a road",
    stadium: "built a stadium", station: "built a rail station", wire: "laid power lines",
  } satisfies Record<ToolName, string>,
  taxes: (tax: number) => `set taxes to ${tax}%`,
  funding: {road: "road funding", fire: "fire funding", police: "police funding"} satisfies Record<keyof ServiceAmounts, string>,
  fundingTo: (service: string, percent: number) => `${service} to ${percent}%`,
  speeds: {
    paused: "paused the city", slow: "set the speed to slow", medium: "set the speed to medium",
    fast: "set the speed to fast",
  } satisfies Record<keyof typeof SPEEDS, string>,
  autoBudget: (on: boolean) => on ? "turned auto-budget on" : "turned auto-budget off",
  disastersSetting: (on: boolean) => on ? "turned disasters on" : "turned disasters off",
  disasters: {
    monster: "set a monster loose", fire: "started a fire", flood: "caused a flood", crash: "crashed a plane",
    meltdown: "caused a nuclear meltdown", tornado: "summoned a tornado", earthquake: "caused an earthquake",
  } satisfies Record<DisasterKind, string>,
  addFunds: "added funds",
  line: (name: string, action: string) => `${name} ${action}`,
};

export const Text = {
  cityClass,
  crimeStrings,
  densityStrings,
  gameLevel,
  growth,
  landValueStrings,
  messages,
  months,
  overlays,
  playerActions,
  problems,
  pollutionStrings,
  poweredStrings,
  rateStrings,
  scoreBreakdown,
  statusPanel,
  toolFailures,
  tvTitles,
  tvTitleUnknown,
  zoneCategories,
};
