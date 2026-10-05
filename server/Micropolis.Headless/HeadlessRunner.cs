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
using Micropolis.Conformance;
using Micropolis.Rules;

namespace Micropolis.Headless
{
    /// <summary>
    /// What a run printed: the lines to print, and why it fails although it ran to its end, or <see langword="null"/>
    /// when it passes.
    /// </summary>
    internal sealed record RunReport(IReadOnlyList<string> Lines, string? Failure);

    /// <summary>
    /// Where the files a run reads and writes beside a log it is given are: the conformance directories, whose logs a
    /// fixture that starts from a save reads it from, and which the fixture tool writes, reading the sample saves of
    /// their <c>saveVersions/</c>; and the golden playthrough, which the tool copies the playthrough's log from.
    /// </summary>
    internal sealed record HeadlessFiles(ConformanceDirectories Conformance, string GoldenPlaythrough)
    {
        /// <summary>
        /// The repository's own files, as the command line runs on them.
        /// </summary>
        public static HeadlessFiles Committed => new HeadlessFiles(ConformanceDirectories.Committed, FixtureLogs.CommittedGoldenPlaythrough);
    }

    /// <summary>
    /// Starts a city from a seed, a fixture or a command log and advances it step by step, or writes every fixture's
    /// log. A run never stalls silently: it fails when the city is paused, or doesn't advance city time as far as the
    /// step count implies.
    /// </summary>
    internal static class HeadlessRunner
    {
        /// <summary>
        /// Runs the command on <paramref name="files"/>. A replay fails at a checkpoint that doesn't match; one whose
        /// log has no checkpoints runs to its end but fails, since it verified nothing.
        /// </summary>
        public static RunReport Run(HeadlessCommand command, HeadlessFiles files)
        {
            switch (command)
            {
                case WriteFixtures:
                    return new RunReport(FixtureTool.WriteAll(files).Select(path => $"wrote {path}").ToList(), null);
                case ReplayLog replayLog:
                    CommandLog log = CommandLog.Parse(File.ReadAllText(replayLog.Path));
                    Replay replay = LogReplay.Verify(log);

                    return log.Checkpoints.Count == 0
                        ? new RunReport([OutcomeCounts(replay.Results), .. CityLines(replay.City)], "The log has no checkpoints, so its replay verified nothing")
                        : new RunReport([OutcomeCounts(replay.Results), $"{log.Checkpoints.Count} checkpoints match", .. CityLines(replay.City)], null);
                case RunCity run:
                    Simulation city = StartCity(run.Start, files.Conformance);
                    Advance(city, run.Steps);
                    return new RunReport(CityLines(city), null);
                default:
                    throw new InvalidOperationException($"No command {command.GetType().Name}.");
            }
        }

        /// <summary>
        /// The city a run starts from, a fixture that starts from a save reading it from its log in
        /// <paramref name="directories"/>. A fixture's city is loaded from the save its log builds, so a fixture always
        /// goes through the load path.
        /// </summary>
        public static Simulation StartCity(RunStart start, ConformanceDirectories directories)
        {
            if (start.Seed.HasValue == (start.Fixture != null))
            {
                throw new ArgumentException("A run starts from either a seed or a fixture");
            }

            if (start.Seed is uint seed)
            {
                if (start.Reseed.HasValue)
                {
                    throw new ArgumentException("Reseeding replaces a fixture's stream: a city from a seed already has the stream of its seed");
                }

                return Simulation.NewCity(seed, Level.Easy, start.Speed ?? Speed.Medium);
            }

            Fixture fixture = Fixtures.Named(start.Fixture!);
            JsonObject save = LogReplay.Run(fixture.Start(directories), fixture.Entries, [], 0).City.Save();
            return StartFromSave(save, start.Reseed, start.Speed);
        }

        /// <summary>
        /// The city a save holds, with its stream replaced by the simulation stream of <paramref name="reseed"/>, and
        /// its speed by <paramref name="speed"/>; a city saved paused needs a speed to run.
        /// </summary>
        public static Simulation StartFromSave(JsonObject save, uint? reseed, Speed? speed)
        {
            JsonObject simulation = save["simulation"]!.AsObject();

            if (reseed is uint seed)
            {
                simulation["seed"] = seed;
                simulation["randomState"] = new JsonArray(RandomStream.SimulationStream(seed).GetState().Select(word => (JsonNode?)word).ToArray());
            }

            if (speed is Speed running)
            {
                simulation["speed"] = (int)running;
            }
            else if ((int)simulation["speed"]! == (int)Speed.Paused)
            {
                throw new ArgumentException("The city is saved paused: give a speed to run it");
            }

            return LogReplay.StartCity(new SaveStart(save));
        }

        /// <summary>
        /// Never steps a paused city, and fails rather than stalling, when city time doesn't advance as far as the step
        /// count implies.
        /// </summary>
        public static void Advance(Simulation city, long steps)
        {
            if (city.IsPaused)
            {
                throw new StepsFailedException("The simulation is paused: a run never steps a paused simulation");
            }

            CityTimeModel.TakeSteps(city, steps, city.Step);
        }

        // The city's state hash, then its year, population and funds
        private static List<string> CityLines(Simulation city)
        {
            return [StateHash.HashSavedState(city.Save()), $"year {city.Date.Year}, population {city.Evaluation.CityPop}, funds {city.Budget.TotalFunds}"];
        }

        /// <summary>
        /// The outcomes of a log's commands, counted in the order each first came up, such as "12 commands: 11 ok, 1
        /// rejected".
        /// </summary>
        public static string OutcomeCounts(IReadOnlyList<CommandResult> results)
        {
            IEnumerable<string> parts = results.GroupBy(result => result.Outcome)
                .Select(outcome => $"{outcome.Count()} {ProtocolJson.Name(outcome.Key)}");

            return $"{results.Count} commands" + (results.Count == 0 ? "" : $": {string.Join(", ", parts)}");
        }
    }
}
