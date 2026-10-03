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

using System.Text.Json.Nodes;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The city runs the TypeScript reference records under <c>conformance/runs/</c>, as <c>index.json</c> lists them:
    /// each a city stepped at one speed, with its state hash at each checkpoint and every event it emitted.
    /// </summary>
    public static class ConformanceRuns
    {
        private const string Directory = "runs";

        public static IReadOnlyList<ConformanceRun> Load()
        {
            return Parse(ConformanceFile.Read($"{Directory}/index.json"));
        }

        public static IReadOnlyList<ConformanceRun> Parse(string json)
        {
            IReadOnlyList<ConformanceRun> runs = ConformanceFile.Parse<RunIndex>(json).Runs;
            ConformanceFile.NonEmpty("runs", runs);

            foreach (ConformanceRun run in runs)
            {
                if ((run.Seed is null) == (run.Fixture is null))
                {
                    throw new InvalidDataException($"The run {run.File} must start from a seed or a fixture, not both or neither.");
                }

                if (run.Checkpoints.Count == 0 || run.Checkpoints[0].Step != 0 || run.Checkpoints[^1].Step != run.Steps)
                {
                    throw new InvalidDataException($"The run {run.File} must check its state at step 0 and at its last step.");
                }
            }

            return runs;
        }

        /// <summary>
        /// Every event the run emitted, in order, each with the step, counted from 0, during which it came, its name,
        /// and its payload unless it was emitted without one. Each read decompresses the run's file anew.
        /// </summary>
        internal static JsonArray ReadEvents(ConformanceRun run)
        {
            JsonArray events = ConformanceFile.ReadGzippedArray($"{Directory}/{run.File}");

            if (events.Count != run.Events)
            {
                throw new InvalidDataException($"{run.File} holds {events.Count} events, not the {run.Events} the index lists.");
            }

            return events;
        }

        private sealed record RunIndex(IReadOnlyList<ConformanceRun> Runs);
    }

    /// <summary>
    /// One city run as the index lists it: where its city starts, from a new city on a seed's map or from a fixture's
    /// city as built, the level its city is at, the speed and steps it runs, how many events it emitted, and its
    /// checkpoints.
    /// </summary>
    public sealed record ConformanceRun(
        string File, uint? Seed, string? Fixture, string Level, string Speed, int Steps, int Events,
        IReadOnlyList<RunCheckpoint> Checkpoints)
    {
        public Rules.Speed RunningSpeed => Enum.Parse<Rules.Speed>(Speed, ignoreCase: true);

        public Rules.Level GameLevel => Enum.Parse<Rules.Level>(Level, ignoreCase: true);

        public override string ToString()
        {
            return $"{Fixture ?? $"seed {Seed}"} at {Speed} speed, {Steps} steps";
        }
    }

    /// <summary>
    /// The state hash after a number of steps.
    /// </summary>
    public sealed record RunCheckpoint(int Step, string Hash);
}
