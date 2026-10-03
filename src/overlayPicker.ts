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

import { appendElement } from "./domElements";
import { OVERLAY_UPDATED } from "./messages";
import { layerName, legendView, OverlayView } from "./overlayRenderer";
import { OVERLAY_LAYERS, OverlayLayer, Query, QueryAnswer } from "./protocol";
import { Text } from "./text.js";

// The player's choice of map overlay: asks the simulation for the chosen layer, asks again each time the simulation
// announces it recomputed, and shows each answer.

// Where the overlay's data comes from: the simulation in the page, or a server
export interface OverlaySource {
  // Calls the listener with a layer's name each time the simulation has recomputed that layer
  onLayerUpdated(listener: (layer: OverlayLayer) => void): void;
  // Sends a query, and hands its answer to reply when it comes, which may be at once
  ask(query: Query, reply: (answer: QueryAnswer) => void): void;
}

// The parts of the simulation in the page that answer an overlay
export interface PageSimulation {
  addEventListener(event: string, listener: (data: {layer: OverlayLayer}) => void): void;
  answerQuery(query: unknown): QueryAnswer;
}

// The simulation in the page as an overlay source: it announces a recomputed layer with OVERLAY_UPDATED, and answers
// a query at once
export function pageOverlaySource(simulation: PageSimulation): OverlaySource {
  return {
    onLayerUpdated: (listener) => simulation.addEventListener(OVERLAY_UPDATED, ({layer}) => listener(layer)),
    ask: (query, reply) => reply(simulation.answerQuery(query)),
  };
}

// Where the overlay is drawn
export interface OverlayCanvas {
  setOverlay(view: OverlayView | null): void;
}

// Every decision about which answer shows is made here, so it is tested under node. OverlayPicker only builds the
// picker and legend in the DOM.
export class OverlaySelection {
  private layer: OverlayLayer | null = null;

  constructor(private readonly source: OverlaySource, private readonly show: (view: OverlayView | null) => void) {
    source.onLayerUpdated((layer) => {
      if (layer === this.layer) {
        this.ask(layer);
      }
    });
  }

  // Shows the layer once its answer comes, or no overlay at once
  select(layer: OverlayLayer | null): void {
    this.layer = layer;

    if (layer === null) {
      this.show(null);
    } else {
      this.ask(layer);
    }
  }

  private ask(layer: OverlayLayer): void {
    this.source.ask({type: "overlay", layer}, (answer) => this.receive(answer));
  }

  // An answer for a layer no longer chosen arrives after the player chose another, and is dropped. The picker only
  // asks for the layers the simulation answers, so a rejection, or any other answer, is a defect.
  private receive(answer: QueryAnswer): void {
    if (answer.type === "rejected") {
      throw new Error(`The simulation rejected an overlay query: ${answer.reason}`);
    }

    if (answer.type !== "overlay") {
      throw new Error(`The simulation answered an overlay query with an answer of type ${answer.type}`);
    }

    if (answer.layer === this.layer) {
      this.show(new OverlayView(answer));
    }
  }
}

// The picker the player chooses a layer with, and the legend of the layer showing, in the container
export class OverlayPicker {
  private readonly selection: OverlaySelection;
  private readonly legend: HTMLElement;
  private readonly legendTitle: HTMLElement;
  private readonly legendBar: HTMLElement;
  private readonly legendLow: HTMLElement;
  private readonly legendHigh: HTMLElement;

  constructor(elementId: string, source: OverlaySource, canvas: OverlayCanvas) {
    const container = document.getElementById(elementId);
    if (container === null) {
      throw new Error(`Node ${elementId} not found`);
    }

    const label = appendElement(container, "label", "overlayLabel");
    label.textContent = Text.overlays.label;
    const select = document.createElement("select");
    select.id = `${elementId}Select`;
    label.htmlFor = select.id;
    select.appendChild(option("", Text.overlays.none));
    for (const layer of OVERLAY_LAYERS) {
      select.appendChild(option(layer, layerName(layer)));
    }
    container.appendChild(select);

    this.legend = appendElement(container, "div", "overlayLegend");
    this.legendTitle = appendElement(this.legend, "div", "overlayLegendTitle");
    this.legendBar = appendElement(this.legend, "div", "overlayLegendBar");
    const ends = appendElement(this.legend, "div", "overlayLegendEnds");
    this.legendLow = appendElement(ends, "span", "overlayLegendLow");
    this.legendHigh = appendElement(ends, "span", "overlayLegendHigh");
    this.legend.hidden = true;

    this.selection = new OverlaySelection(source, (view) => {
      canvas.setOverlay(view);
      this.renderLegend(view);
    });

    select.addEventListener("change", () => {
      this.selection.select(select.value === "" ? null : select.value as OverlayLayer);
      // The arrow keys scroll the map, so the picker gives the keyboard back once the player has chosen
      select.blur();
    });
  }

  private renderLegend(view: OverlayView | null): void {
    this.legend.hidden = view === null;
    if (view === null) {
      return;
    }

    const legend = legendView(view.answer);
    this.legendTitle.textContent = legend.title;
    this.legendBar.style.background = legend.gradient;
    this.legendLow.textContent = legend.lowLabel;
    this.legendHigh.textContent = legend.highLabel;
  }
}

function option(value: string, text: string): HTMLOptionElement {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = text;
  return element;
}
