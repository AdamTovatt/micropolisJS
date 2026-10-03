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
using System.Text.RegularExpressions;
using static Micropolis.Rules.Tests.ConformanceJson;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The command logs under <c>conformance/logs/</c> (<c>docs/command-log.md</c>), read with <see cref="JsonText"/>,
    /// since a logged command is any JSON. It checks what <c>parseLog</c> in <c>src/commandLog.ts</c> checks, and is
    /// stricter, as the readers of the other conformance files are: it refuses a key the format doesn't define, and a
    /// level beside a save, which <c>parseLog</c> ignores.
    /// </summary>
    public static partial class ConformanceLogs
    {
        private const string Directory = "logs";

        private const string Extension = ".log.json";

        private const int FormatVersion = 1;

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
            JsonObject log = Members(JsonText.Parse(json), $"The log {name}", ["formatVersion", "entries", "checkpoints"],
                                     ["description", "seed", "level", "save"]);

            if (WholeNumber(log["formatVersion"], "formatVersion", 0, long.MaxValue) != FormatVersion)
            {
                throw Broken($"The log {name} is not a version {FormatVersion} command log.");
            }

            // Replay ignores the description, so it is only checked to be one
            if (log.ContainsKey("description"))
            {
                String(log["description"], "description");
            }

            uint? seed = null;
            Level? level = null;
            JsonObject? save = null;

            if (log.ContainsKey("seed") == log.ContainsKey("save"))
            {
                throw Broken($"The log {name} starts from a seed or from a save: exactly one.");
            }

            if (log.ContainsKey("level") != log.ContainsKey("seed"))
            {
                throw Broken($"The log {name} has a level with a seed, and only then.");
            }

            if (log.ContainsKey("seed"))
            {
                seed = (uint)WholeNumber(log["seed"], "seed", 0, uint.MaxValue);
                level = (Level)WholeNumber(log["level"], "level", (long)Level.Easy, (long)Level.Hard);
            }
            else
            {
                save = log["save"] as JsonObject ?? throw Broken($"The log {name}'s save is not an object.");
            }

            List<LogEntry> entries = List(log["entries"], "entries").Select(ReadEntry).ToList();
            List<RunCheckpoint> checkpoints = List(log["checkpoints"], "checkpoints").Select(ReadCheckpoint).ToList();
            ConformanceFile.NonEmpty("checkpoints", checkpoints);

            for (int i = 1; i < entries.Count; i++)
            {
                if (entries[i].Step < entries[i - 1].Step)
                {
                    throw Broken($"Entry {i} of the log {name}, at step {entries[i].Step}, comes before the entry above it.");
                }
            }

            for (int i = 1; i < checkpoints.Count; i++)
            {
                if (checkpoints[i].Step <= checkpoints[i - 1].Step)
                {
                    throw Broken($"Checkpoint {i} of the log {name}, at step {checkpoints[i].Step}, is not after the one above it.");
                }
            }

            return new ConformanceLog(name, seed, level, save, entries, checkpoints);
        }

        private static LogEntry ReadEntry(JsonNode? node)
        {
            JsonObject entry = Members(node, "an entry", ["step", "player", "command"]);

            return new LogEntry(Step(entry["step"]), String(entry["player"], "player"), entry["command"]);
        }

        private static RunCheckpoint ReadCheckpoint(JsonNode? node)
        {
            JsonObject checkpoint = Members(node, "a checkpoint", ["step", "hash"]);
            string hash = String(checkpoint["hash"], "hash");

            if (!Sha256Hex().IsMatch(hash))
            {
                throw Broken($"A checkpoint's hash, {hash}, is not a SHA-256 in hex.");
            }

            return new RunCheckpoint(Step(checkpoint["step"]), hash);
        }

        private static int Step(JsonNode? node)
        {
            return (int)WholeNumber(node, "step", 0, int.MaxValue);
        }

        [GeneratedRegex("^[0-9a-f]{64}$")]
        private static partial Regex Sha256Hex();
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
