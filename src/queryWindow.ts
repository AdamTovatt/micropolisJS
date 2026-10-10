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

import { ClientConfig } from "./clientConfig";
import { appendElement, requiredElement, setShown } from "./domElements";
import { type GrowthBlocker, type GrowthZone, type TileReportAnswer, type ZoneGrowthReport } from "./protocol";
import { Text } from "./text";
import { ClosableWindow } from "./windowBase";

// The band each value the query tool reports falls in, as an index into its labels in text.ts, lowest first, as
// getDensity in the original's tool.cpp sorts them

// The band of a value taken in steps of 64, which wraps past 255 as the original's does
function bandOf64(value: number): number {
  return (value >> 6) & 3;
}

function populationDensityBand(populationDensity: number): number {
  return bandOf64(populationDensity);
}

function landValueBand(landValue: number): number {
  if (landValue >= 150) {
    return 3;
  }

  if (landValue >= 80) {
    return 2;
  }

  return landValue >= 30 ? 1 : 0;
}

function crimeBand(crime: number): number {
  return bandOf64(crime);
}

// Any pollution at all is at least moderate
function pollutionBand(pollution: number): number {
  return pollution > 0 && pollution < 64 ? 1 : bandOf64(pollution);
}

// Declining below zero, stable at zero, and growing fast above 100
function rateOfGrowthBand(rateOfGrowth: number): number {
  if (rateOfGrowth < 0) {
    return 0;
  }

  if (rateOfGrowth === 0) {
    return 1;
  }

  return rateOfGrowth > 100 ? 3 : 2;
}

// What the window shows for one tile report: its text, field by field. A field named after one of the report's shows
// that field, and a field named after one with Band added shows the band it falls in. hasPower says in words whether
// the tile had power at the map scan's last pass over it, so a power line just laid reads no until the scan reaches
// it; it is null for a tile power means nothing to, neither a zone nor conductive, such as water or a park, whose row
// the window leaves out. It is not named powered: that is the debug table's flag. growth is how the zone holding the
// tile grows, and null for a tile of no zone that grows, whose rows the window leaves out. The fields from position on
// are the debug rows, which show only in debug mode.
export interface QueryView {
  category: string;
  hasPower: string | null;
  growth: GrowthView | null;
  populationDensityBand: string;
  landValueBand: string;
  crimeBand: string;
  pollutionBand: string;
  rateOfGrowthBand: string;
  position: string;
  tile: string;
  fireStationMap: string;
  fireCoverage: string;
  terrainDensity: string;
  policeStationMap: string;
  policeCoverage: string;
  cityCentreScore: string;
  rateOfGrowth: string;
  pollution: string;
  crime: string;
  landValue: string;
  trafficDensity: string;
  populationDensity: string;
  burnable: string;
  bulldozable: string;
  conductive: string;
  animated: string;
  powered: string;
  zoneCentre: string;
}

// How a zone grows, in words: where it stands; each thing holding it back, none for a zone nothing holds back; that the
// rules assess it only now and then, or null where they assess it whenever the map scan finds it; what its next trip
// may do with no road or path at its edge, or null with one; and, for the debug rows, its zone score and its centre,
// which the report is on, wherever the tile clicked lies in it
export interface GrowthView {
  outlook: string;
  blockers: string[];
  nowAndThen: string | null;
  noWayOut: string | null;
  score: string;
  centre: string;
}

// The element hasPower is written into, and the class of its row's label and value, which hide without it
const POWERED_ID = "queryPowered";
const POWERED_ROW_CLASS = "queryPowered";

// The elements the growth is written into, the class of its rows and of the box of its notes, which hide without it,
// and of the row of what holds it back, which hides when nothing does
const GROWTH_IDS: Record<keyof GrowthView, string> = {
  outlook: "queryOutlook",
  blockers: "queryBlockers",
  nowAndThen: "queryNowAndThen",
  noWayOut: "queryNoWayOut",
  score: "queryZoneScoreRaw",
  centre: "queryZoneCentreRaw",
};
const GROWTH_PART_CLASS = "queryGrowthPart";
const BLOCKERS_ROW_CLASS = "queryBlockersRow";

// The element each field of the view that always shows is written into
const ELEMENT_IDS: Record<Exclude<keyof QueryView, "hasPower" | "growth">, string> = {
  category: "queryZoneType",
  populationDensityBand: "queryDensity",
  landValueBand: "queryLandValue",
  crimeBand: "queryCrime",
  pollutionBand: "queryPollution",
  rateOfGrowthBand: "queryRate",
  position: "queryTile",
  tile: "queryTileValue",
  fireStationMap: "queryFireStationRaw",
  fireCoverage: "queryFireStationEffectRaw",
  terrainDensity: "queryTerrainDensityRaw",
  policeStationMap: "queryPoliceStationRaw",
  policeCoverage: "queryPoliceStationEffectRaw",
  cityCentreScore: "queryComRateRaw",
  rateOfGrowth: "queryRateRaw",
  pollution: "queryPollutionRaw",
  crime: "queryCrimeRaw",
  landValue: "queryLandValueRaw",
  trafficDensity: "queryTrafficDensityRaw",
  populationDensity: "queryDensityRaw",
  burnable: "queryTileBurnable",
  bulldozable: "queryTileBulldozable",
  conductive: "queryTileCond",
  animated: "queryTileAnim",
  powered: "queryTilePowered",
  zoneCentre: "queryTileZone",
};

const categoryText: {[category: string]: string} = Text.zoneCategories;

function flag(set: boolean): string {
  return set ? "✔" : "✘";
}

// Power means something to a zone and to a tile that conducts it, which the power scan powers wherever it reaches
function hasPowerText(report: TileReportAnswer): string | null {
  if (!report.zoneCentre && !report.conductive) {
    return null;
  }

  return report.powered ? Text.poweredStrings.yes : Text.poweredStrings.no;
}

// LOW_DEMAND names the demand of the zone's own kind
function blockerText(blocker: GrowthBlocker, zone: GrowthZone): string {
  return blocker === "LOW_DEMAND" ? Text.growth.lowDemand[zone] : Text.growth.blockers[blocker];
}

function growthView(growth: ZoneGrowthReport | null): GrowthView | null {
  if (growth === null) {
    return null;
  }

  const words = Text.growth;
  return {
    outlook: words.outlooks[growth.outlook],
    blockers: growth.blockers.map((blocker) => blockerText(blocker, growth.zone)),
    nowAndThen: growth.assessedNowAndThen ? words.nowAndThen[growth.zone] : null,
    noWayOut: growth.wayAtEdge ? null : words.noWayOut[growth.zone],
    score: `${growth.score}`,
    centre: `${growth.x}, ${growth.y}`,
  };
}

// Every decision about what the window shows is made here, so it is tested under node. The window only writes the
// view into the DOM. A code without text is a defect the tests catch, so there is no fallback.
export function queryView(report: TileReportAnswer): QueryView {
  return {
    category: categoryText[report.category],
    hasPower: hasPowerText(report),
    growth: growthView(report.growth),
    populationDensityBand: Text.densityStrings[populationDensityBand(report.populationDensity)],
    landValueBand: Text.landValueStrings[landValueBand(report.landValue)],
    crimeBand: Text.crimeStrings[crimeBand(report.crime)],
    pollutionBand: Text.pollutionStrings[pollutionBand(report.pollution)],
    rateOfGrowthBand: Text.rateStrings[rateOfGrowthBand(report.rateOfGrowth)],
    position: `${report.x}, ${report.y}`,
    tile: `${report.tile}`,
    fireStationMap: `${report.fireStationMap}`,
    fireCoverage: `${report.fireCoverage}`,
    terrainDensity: `${report.terrainDensity}`,
    policeStationMap: `${report.policeStationMap}`,
    policeCoverage: `${report.policeCoverage}`,
    cityCentreScore: `${report.cityCentreScore}`,
    rateOfGrowth: `${report.rateOfGrowth}`,
    pollution: `${report.pollution}`,
    crime: `${report.crime}`,
    landValue: `${report.landValue}`,
    trafficDensity: `${report.trafficDensity}`,
    populationDensity: `${report.populationDensity}`,
    burnable: flag(report.burnable),
    bulldozable: flag(report.bulldozable),
    conductive: flag(report.conductive),
    animated: flag(report.animated),
    powered: flag(report.powered),
    zoneCentre: flag(report.zoneCentre),
  };
}

// The query tool's report on a tile
export class QueryWindow extends ClosableWindow<[TileReportAnswer], void> {
  constructor(opacityLayerID: string, windowID: string) {
    super(opacityLayerID, windowID, undefined);
    this.closeOnSubmit("queryForm");
  }

  protected fill(report: TileReportAnswer): void {
    this.write(report);
  }

  // Writes a report into the window, as it writes the one it opens on
  write(report: TileReportAnswer): void {
    render(queryView(report), ClientConfig.debug);
  }
}

// Shows the elements of the class where shown, and hides them where not
function showRows(className: string, shown: boolean): void {
  document.querySelectorAll<HTMLElement>(`.${className}`).forEach((element) => setShown(element, shown));
}

function renderGrowth(growth: GrowthView | null): void {
  showRows(GROWTH_PART_CLASS, growth !== null);
  showRows(BLOCKERS_ROW_CLASS, (growth?.blockers.length ?? 0) > 0);

  const blockers = requiredElement(GROWTH_IDS.blockers);
  blockers.replaceChildren();
  for (const blocker of growth?.blockers ?? []) {
    appendElement(blockers, "li").textContent = blocker;
  }

  for (const field of ["outlook", "score", "centre"] as const) {
    requiredElement(GROWTH_IDS[field]).textContent = growth?.[field] ?? "";
  }

  for (const field of ["nowAndThen", "noWayOut"] as const) {
    const note = requiredElement(GROWTH_IDS[field]);
    note.textContent = growth?.[field] ?? null;
    setShown(note, (growth?.[field] ?? null) !== null);
  }
}

function render(view: QueryView, debug: boolean): void {
  for (const field of Object.keys(ELEMENT_IDS) as (keyof typeof ELEMENT_IDS)[]) {
    requiredElement(ELEMENT_IDS[field]).textContent = view[field];
  }

  requiredElement(POWERED_ID).textContent = view.hasPower;
  showRows(POWERED_ROW_CLASS, view.hasPower !== null);
  renderGrowth(view.growth);

  document.querySelectorAll(".queryDebug").forEach((element) => element.classList.toggle("hidden", !debug));
}
