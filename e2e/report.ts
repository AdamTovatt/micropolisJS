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

import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

// The playthrough's report: one static page showing every stage in order, with its screenshot, so anyone can flip
// through it and see the game working. Each checkpoint's save sits beside it, and debug mode's "Load save file" opens
// it.

export interface Checkpoint {
  stage: string;
  // Steps the stage took, and steps since the city was founded, as the runner counted them
  steps: number;
  totalSteps: number;
  // Files in the report's directory, absent only when taking the checkpoint itself failed
  screenshot?: string;
  save?: string;
  error?: string;
}

// The browser's own driver, run after the stages: as many steps as wall time allowed, so a screenshot and no save
export interface DriverRun {
  screenshot?: string;
  error?: string;
}

export class Report {
  readonly checkpoints: Checkpoint[] = [];
  driverRun: DriverRun | null = null;
  buildId = "unknown";

  constructor(readonly directory: string, private readonly seed: number) {
    rmSync(directory, {recursive: true, force: true});
    mkdirSync(directory, {recursive: true});
  }

  // A stage's file name stem: its position, so the files sort in stage order, then its name
  fileStem(index: number, stage: string): string {
    const slug = stage.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `${String(index + 1).padStart(2, "0")}-${slug}`;
  }

  write(): void {
    writeFileSync(join(this.directory, "index.html"), this.html());
  }

  private html(): string {
    const stages = this.checkpoints.map((checkpoint, index) => `
      <section class="stage${checkpoint.error ? " failed" : ""}">
        <h2>${index + 1}. ${escapeHtml(checkpoint.stage)}</h2>
        <dl>
          <dt>Steps</dt><dd>${checkpoint.steps}</dd>
          <dt>Steps in all</dt><dd>${checkpoint.totalSteps}</dd>
          ${checkpoint.save ? `<dt>Save</dt><dd><a href="${checkpoint.save}">${checkpoint.save}</a></dd>` : ""}
        </dl>
        ${errorBlock(checkpoint.error)}
        ${screenshotBlock(checkpoint.screenshot, checkpoint.stage)}
      </section>`).join("");

    const driverRun = this.driverRun === null ? "" : `
      <section class="stage${this.driverRun.error ? " failed" : ""}">
        <h2>Then the browser's own driver runs the city</h2>
        <p>It took as many steps as wall time allowed, so its city is not reproducible and has no save.</p>
        ${errorBlock(this.driverRun.error)}
        ${screenshotBlock(this.driverRun.screenshot, "the browser's own driver ran it")}
      </section>`;

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Playthrough report</title>
<style>
  body { font-family: sans-serif; margin: 0 auto; max-width: 1480px; padding: 16px; }
  .stage { border-top: 1px solid #ccc; padding: 8px 0 24px; }
  .failed h2 { color: #b00020; }
  dl { display: grid; grid-template-columns: max-content auto; gap: 4px 16px; }
  dt { font-weight: bold; }
  dd { margin: 0; font-family: monospace; }
  img { max-width: 100%; border: 1px solid #ccc; }
  .error { background: #fdecea; padding: 8px; white-space: pre-wrap; }
</style>
</head>
<body>
<h1>Playthrough report</h1>
<p>Build ${escapeHtml(this.buildId)}, seed ${this.seed}. Open a stage's save in the game with <code>?debug=1</code> and
"Load save file".</p>
${stages}
${driverRun}
</body>
</html>
`;
  }
}

function errorBlock(error: string | undefined): string {
  return error ? `<pre class="error">${escapeHtml(error)}</pre>` : "";
}

function screenshotBlock(screenshot: string | undefined, after: string): string {
  return screenshot ? `<img src="${screenshot}" alt="The game after ${escapeHtml(after)}">` : "";
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
