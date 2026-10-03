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

import { Config } from "./config.js";
import { requiredElement } from "./domElements";
import { QUERY_WINDOW_CLOSED } from "./messages";
import { type TileReportAnswer } from "./protocol";
import { Text } from "./text.js";
import { ClosableWindow } from "./windowBase";

// The band each value the query tool reports falls in, as an index into its labels in text.js, lowest first

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

function pollutionBand(pollution: number): number {
  return bandOf64(pollution);
}

function rateOfGrowthBand(rateOfGrowth: number): number {
  return bandOf64(rateOfGrowth);
}

// What the window shows for one tile report: its text, field by field. A field named after one of the report's shows
// that field, and a field named after one with Band added shows the band it falls in. The fields from position on are
// the debug rows, which show only in debug mode.
export interface QueryView {
  category: string;
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

// The element each field of the view is written into
const ELEMENT_IDS: Record<keyof QueryView, string> = {
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

// Every decision about what the window shows is made here, so it is tested under node. The window only writes the
// view into the DOM. A code without text is a defect the tests catch, so there is no fallback.
export function queryView(report: TileReportAnswer): QueryView {
  return {
    category: categoryText[report.category],
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
export class QueryWindow extends ClosableWindow {
  constructor(opacityLayerID: string, windowID: string) {
    super(opacityLayerID, windowID, QUERY_WINDOW_CLOSED);
    this.closeOnSubmit("queryForm");
  }

  open(report: TileReportAnswer): void {
    render(queryView(report), Config.debug || Config.queryDebug);
    this._toggleDisplay();
  }
}

function render(view: QueryView, debug: boolean): void {
  for (const field of Object.keys(ELEMENT_IDS) as (keyof QueryView)[]) {
    requiredElement(ELEMENT_IDS[field]).textContent = view[field];
  }

  document.querySelectorAll(".queryDebug").forEach((element) => element.classList.toggle("hidden", !debug));
}
