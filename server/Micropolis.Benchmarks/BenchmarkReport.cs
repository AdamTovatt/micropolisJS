/* micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
 * Copyright (C) 2026 Adam Tovatt
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

using System.Globalization;

namespace Micropolis.Benchmarks
{
    /// <summary>
    /// One case's figures: its timing, and its state-message bytes per step.
    /// </summary>
    internal sealed record BenchmarkRow(BenchmarkCase Case, StepTiming Timing, double BytesPerStep);

    /// <summary>
    /// The report as Markdown, with Unix line endings on every platform: what was measured and on what, then a row per
    /// case.
    /// </summary>
    internal static class BenchmarkReport
    {
        public static string Write(RunEnvironment environment, BenchmarkSettings settings, IReadOnlyList<BenchmarkRow> rows)
        {
            List<string> withDisasters = rows.Select(row => row.Case).OfType<FixtureCase>()
                .Where(fixture => fixture.DisastersEnabled)
                .Select(fixture => fixture.Name)
                .ToList();
            string disasters = withDisasters.Count == 0
                ? "random disasters are off"
                : $"random disasters are on for {string.Join(" and ", withDisasters)}";
            List<string> lines =
            [
                "# Benchmarks",
                "",
                "How fast the C# simulation steps a city, and how many bytes of state messages each player in a city on " +
                "the server receives per step, on the committed fixtures and on new cities. `npm run benchmark` writes this file, with " +
                "`server/Micropolis.Benchmarks`.",
                "",
                $"- Commit: {environment.Commit}",
                $"- Machine: {environment.Machine}",
                $"- Load average over 1, 5 and 15 minutes: {environment.Load}",
                $"- Runtime: {environment.Runtime}",
                $"- Each fixture's city is its save after its golden run, at its saved speed; {disasters}. A new city is " +
                "the seed's map at the easy level.",
                $"- Steps/s and ms/step: the city is loaded, steps {settings.Warmup} times to warm up, then " +
                $"{settings.Steps} steps are timed; the median of {settings.Repeats} " +
                $"{(settings.Repeats == 1 ? "repeat" : "repeats")}, each from a fresh load.",
                $"- Bytes/step: {MessageBytes.Source}, over the same steps as the timing.",
                "",
                "| Fixture | Speed | Steps/s | ms/step | Bytes/step |",
                "|---------|-------|--------:|--------:|-----------:|",
            ];

            foreach (BenchmarkRow row in rows)
            {
                lines.Add($"| {row.Case.Name} | {row.Case.SpeedName} | {Format(row.Timing.StepsPerSecond, "N0")} | " +
                          $"{Format(row.Timing.MillisecondsPerStep, "N4")} | {Format(row.BytesPerStep, "N1")} |");
            }

            return string.Join("\n", lines) + "\n";
        }

        private static string Format(double value, string format)
        {
            return value.ToString(format, CultureInfo.InvariantCulture);
        }
    }
}
