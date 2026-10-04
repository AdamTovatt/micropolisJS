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
using Micropolis.SourceTree;
using static Micropolis.Rules.Tests.ConformanceJson;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The command logs under <c>conformance/logs/</c> (<c>docs/command-log.md</c>), read by <see cref="CommandLog"/>,
    /// as the C# headless runner reads one, which checks what <c>parseLog</c> in <c>src/commandLog.ts</c> checks. On
    /// top of it the reader is stricter, as the readers of the other conformance files are: it refuses a key the format
    /// doesn't define, a level beside a save, which <c>parseLog</c> ignores, and a log with no checkpoint.
    /// </summary>
    public static class ConformanceLogs
    {
        private const string Directory = "logs";

        private const string Extension = ".log.json";

        public static IReadOnlyList<ConformanceLog> Load()
        {
            List<ConformanceLog> logs = System.IO.Directory.GetFiles(RepositoryFiles.GetPath($"conformance/{Directory}"), $"*{Extension}")
                .Select(Path.GetFileName)
                .Order(StringComparer.Ordinal)
                .Select(file => Parse(file![..^Extension.Length], ConformanceFile.Read($"{Directory}/{file}")))
                .ToList();

            ConformanceFile.NonEmpty(Directory, logs);
            return logs;
        }

        public static ConformanceLog Parse(string name, string json)
        {
            // What the shared reader leaves alone: a key the format doesn't define, and a level beside a save
            JsonObject log = Members(JsonText.Parse(json), $"The log {name}", ["formatVersion", "entries", "checkpoints"],
                                     ["description", "seed", "level", "save"]);

            if (log.ContainsKey("level") != log.ContainsKey("seed"))
            {
                throw Broken($"The log {name} has a level with a seed, and only then.");
            }

            foreach (JsonNode? entry in log["entries"] as JsonArray ?? [])
            {
                Members(entry, "an entry", ["step", "player", "command"]);
            }

            foreach (JsonNode? checkpoint in log["checkpoints"] as JsonArray ?? [])
            {
                Members(checkpoint, "a checkpoint", ["step", "hash"]);
            }

            CommandLog parsed;

            try
            {
                parsed = CommandLog.Parse(json);
            }
            catch (InvalidDataException exception)
            {
                throw Broken($"The log {name}: {exception.Message}");
            }

            ConformanceFile.NonEmpty("checkpoints", parsed.Checkpoints);

            return new ConformanceLog(name, (parsed.Start as SeedStart)?.Seed, (parsed.Start as SeedStart)?.Level, (parsed.Start as SaveStart)?.Save,
                                      parsed.Entries.Select(entry => new LogEntry(entry.Step, entry.Player, entry.Command)).ToList(),
                                      parsed.Checkpoints.Select(checkpoint => new RunCheckpoint(checkpoint.Step, checkpoint.Hash)).ToList());
        }
    }

    /// <summary>
    /// A command log: the city it starts from, a new city on a seed's map at a level or a saved state, the commands it
    /// was sent, each stamped with the step it preceded, and the state hashes it reached.
    /// </summary>
    public sealed record ConformanceLog(
        string Name, uint? Seed, Level? GameLevel, JsonObject? Save, IReadOnlyList<LogEntry> Entries,
        IReadOnlyList<RunCheckpoint> Checkpoints)
    {
        /// <summary>
        /// The step a replay ends at: its last entry's or its last checkpoint's, whichever is later.
        /// </summary>
        public int LastStep => Math.Max(Entries.Count == 0 ? 0 : Entries[^1].Step, Checkpoints[^1].Step);

        public override string ToString()
        {
            return Name;
        }
    }

    /// <summary>
    /// A logged command: the step it preceded, the player who sent it, and the command as it arrived.
    /// </summary>
    public sealed record LogEntry(int Step, string Player, JsonNode? Command);
}
