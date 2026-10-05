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
import { basename, join } from "path";

import { CheckpointCheck } from "./goldenPlaythrough";

// The playthrough's report: one static page showing every stage in order, with its screenshot, so anyone can flip
// through it and see the game working. Each checkpoint's save sits beside it, and the splash screen's Load starts it on
// the game server as a new city. So does the run's command log, which the headless runner replays:
// `dotnet run --project server/Micropolis.Headless -- --log <file>`.

// What a stage came to, and its checkpoint
export interface StageResult {
  stage: string;
  // Steps the stage took, and steps since the city was founded, as the runner counted them
  steps: number;
  totalSteps: number;
  // Commands applied since the city was founded: the entries of the run's log before the checkpoint
  commands?: number;
  // Files in the report's directory, absent only when taking the checkpoint itself failed
  screenshot?: string;
  save?: string;
  // The state hash of the save, and how the checkpoint compares with its golden one: absent when the run writes the
  // golden playthrough rather than checking against it
  hash?: string;
  goldenCheck?: CheckpointCheck;
  error?: string;
}

// The server's own driver, run after the stages: as many steps as wall time allowed, so a screenshot and no save
export interface DriverRun {
  screenshot?: string;
  error?: string;
}

export class Report {
  readonly stages: StageResult[] = [];
  driverRun: DriverRun | null = null;
  buildId = "unknown";
  // Why the run failed, as the test reports it, the first stage that diverged included
  failures: string[] = [];
  // The run's command log, a file in the report's directory, absent when the run ended before it was taken
  log: string | null = null;

  // The directory is in the repository root
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
    const stages = this.stages.map((result, index) => {
      const check = result.goldenCheck;
      const expected = check?.expected ?? null;
      const hashDiffers = expected !== null && result.hash !== expected.hash;
      // A figure, and the golden one where that differs
      const figure = (actual: number | string, golden: number | string | undefined) =>
        `${actual}${golden !== undefined && actual !== golden ? ` (expected ${golden})` : ""}`;

      return `
      <section class="stage${result.error || check?.diverged ? " failed" : ""}">
        <h2>${index + 1}. ${escapeHtml(result.stage)}</h2>
        <dl>
          <dt>Steps</dt><dd>${result.steps}</dd>
          <dt>Steps in all</dt><dd>${figure(result.totalSteps, expected?.step)}</dd>
          ${result.commands !== undefined ?
            `<dt>Commands in all</dt><dd>${figure(result.commands, expected?.commands)}</dd>` : ""}
          ${check ? `<dt>Expected hash</dt><dd>${expected?.hash ?? "none pinned"}</dd>` : ""}
          ${result.hash ? `<dt>State hash</dt><dd>${result.hash}${hashDiffers ? " (differs)" : ""}</dd>` : ""}
          ${result.save ? `<dt>Save</dt><dd><a href="${result.save}">${result.save}</a></dd>` : ""}
        </dl>
        ${errorBlock(result.error)}
        ${screenshotBlock(result.screenshot, result.stage)}
      </section>`;
    }).join("");

    const driverRun = this.driverRun === null ? "" : `
      <section class="stage${this.driverRun.error ? " failed" : ""}">
        <h2>Then the server's own driver runs the city</h2>
        <p>It took as many steps as wall time allowed, so its city is not reproducible and has no save.</p>
        ${errorBlock(this.driverRun.error)}
        ${screenshotBlock(this.driverRun.screenshot, "the server's own driver ran it")}
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
  .failed h2, h2.failed { color: #b00020; }
  dl { display: grid; grid-template-columns: max-content auto; gap: 4px 16px; }
  dt { font-weight: bold; }
  dd { margin: 0; font-family: monospace; }
  img { max-width: 100%; border: 1px solid #ccc; }
  .error { background: #fdecea; padding: 8px; white-space: pre-wrap; }
</style>
</head>
<body>
<h1>Playthrough report</h1>
<p>Build ${escapeHtml(this.buildId)}, seed ${this.seed}. Play a stage's save again with the splash screen's
"Load game", which starts it on the game server as a new city.</p>
${this.log === null ? "" : `<p>The run's <a href="${this.log}">command log</a> replays headless with
<code>dotnet run --project server/Micropolis.Headless -- --log ${basename(this.directory)}/${this.log}</code>, from the repository root.</p>`}
${this.failures.length > 0 ? `<h2 class="failed">The run failed</h2>\n${errorBlock(this.failures.join("\n"))}` : ""}
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
