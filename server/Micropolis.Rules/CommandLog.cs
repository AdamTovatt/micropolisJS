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

using System.Text.Json;
using System.Text.Json.Nodes;

namespace Micropolis.Rules
{
    /// <summary>
    /// Where a log's city starts: a new city on the map a game seed generates, at a level and at medium speed, as a new
    /// game starts, or a saved state.
    /// </summary>
    public abstract record LogStart;

    public sealed record SeedStart(uint Seed, Level Level) : LogStart;

    /// <summary>
    /// A saved state, as <see cref="Simulation.Save"/> writes one, in the save format version it was written in, which
    /// a replay brings up to date before it loads it (<see cref="SavedGame.UpgradeState"/>).
    /// </summary>
    public sealed record SaveStart(JsonObject Save, int SaveVersion) : LogStart
    {
        /// <summary>
        /// The start of a log from a city as it is now, saved in the current save format version.
        /// </summary>
        public static SaveStart Of(Simulation city)
        {
            return new SaveStart(city.Save(), SavedGame.CurrentVersion);
        }
    }

    /// <summary>
    /// A logged command: the step it preceded, the player who sent it, and the command as it arrived, any JSON.
    /// </summary>
    public sealed record LoggedCommand(long Step, string Player, JsonNode? Command);

    /// <summary>
    /// The city's state hash at a step: after that many steps, and after every command stamped with that step.
    /// </summary>
    public sealed record Checkpoint(long Step, string Hash);

    /// <summary>
    /// A command log, read as <c>docs/command-log.md</c> specifies it, and written as the conformance files lay one
    /// out: a line to each entry and each checkpoint, so a diff shows which moved, and the
    /// save it starts from, if any, on one line.
    /// </summary>
    public sealed record CommandLog(string? Description, LogStart Start, IReadOnlyList<LoggedCommand> Entries,
                                     IReadOnlyList<Checkpoint> Checkpoints)
    {
        public const int FormatVersion = 2;

        /// <summary>
        /// The save format version of the save a version 1 log starts from, which a version 1 log doesn't say: the
        /// version current when logs began to say it. It is history, and never moves with
        /// <see cref="SavedGame.CurrentVersion"/>. A version 1 log written while an older version was current holds
        /// a save of that version, which this misreads, so its replay differs or fails to load.
        /// </summary>
        public const int VersionOneSaveVersion = 10;

        /// <summary>
        /// A recorder's checkpoint every this many steps, a minute of play, as <c>docs/command-log.md</c> specifies.
        /// </summary>
        public const int CheckpointInterval = 3600;

        /// <summary>
        /// The last step a log can name: 2^53 - 1, JavaScript's largest safe integer, past which two whole numbers in
        /// the text can parse to the same double.
        /// </summary>
        public const long MaxStep = (1L << 53) - 1;

        /// <summary>
        /// How a command log's file name ends.
        /// </summary>
        public const string FileExtension = ".log.json";

        /// <summary>
        /// The step a replay ends at: its last entry's or its last checkpoint's, whichever is later.
        /// </summary>
        public long LastStep => Math.Max(Entries.Count == 0 ? 0 : Entries[^1].Step, Checkpoints.Count == 0 ? 0 : Checkpoints[^1].Step);

        /// <summary>
        /// A log read from a file's text, checked as <c>parseLog</c> checks it, or an <see cref="InvalidDataException"/>
        /// naming the first thing wrong. The commands themselves are not checked: the simulation validates each one
        /// as it applies it, as it does a command from a player.
        /// </summary>
        public static CommandLog Parse(string text)
        {
            JsonNode? parsed;

            try
            {
                parsed = JsonText.Parse(text);
            }
            catch (JsonException exception)
            {
                throw new InvalidDataException($"A command log is JSON: {exception.Message}");
            }

            return Read(parsed);
        }

        /// <summary>
        /// A log already read as JSON, such as one another file holds, checked as <see cref="Parse"/> checks it.
        /// </summary>
        public static CommandLog Read(JsonNode? parsed)
        {
            if (parsed is not JsonObject log)
            {
                throw new InvalidDataException("A command log is a JSON object");
            }

            if (!Validation.TryGetWholeNumberIn(log["formatVersion"], 1, FormatVersion, out long version))
            {
                string written = log["formatVersion"] is JsonNode node ? CanonicalJson.Stringify(node) : "undefined";
                throw new InvalidDataException($"This is a version {written} command log: only versions 1 to {FormatVersion} can be replayed");
            }

            if (log.ContainsKey("seed") == log.ContainsKey("save"))
            {
                throw new InvalidDataException("A command log starts from exactly one of seed or save");
            }

            LogStart start;

            if (log.ContainsKey("seed"))
            {
                if (!Validation.TryGetWholeNumberIn(log["seed"], 0, uint.MaxValue, out long seed) ||
                    !Validation.TryGetWholeNumberIn(log["level"], (long)Level.Easy, (long)Level.Hard, out long level))
                {
                    throw new InvalidDataException("A command log from a seed gives the seed, a uint32, and the level, 0 to 2");
                }

                start = new SeedStart((uint)seed, (Level)level);
            }
            else
            {
                JsonObject save = log["save"] as JsonObject ?? throw new InvalidDataException("A command log's save is an object");
                start = new SaveStart(save, version == 1 ? VersionOneSaveVersion : SaveVersion(log["saveVersion"]));
            }

            string? description = null;

            if (log.ContainsKey("description") && !Validation.TryGetString(log["description"], out description))
            {
                throw new InvalidDataException("A command log's description is a string");
            }

            List<LoggedCommand> entries = ReadEntries(log["entries"]);
            List<Checkpoint> checkpoints = ReadCheckpoints(log["checkpoints"]);
            return new CommandLog(description, start, entries, checkpoints);
        }

        /// <summary>
        /// The log as a JSON object, its members in the order a log lays them out, as the server sends a session log
        /// and <see cref="Write"/> writes one.
        /// </summary>
        public JsonObject ToJson()
        {
            JsonObject log = new JsonObject { ["formatVersion"] = FormatVersion };

            if (Description != null)
            {
                log["description"] = Description;
            }

            switch (Start)
            {
                case SeedStart seed:
                    log["seed"] = seed.Seed;
                    log["level"] = (int)seed.Level;
                    break;
                case SaveStart save:
                    log["saveVersion"] = save.SaveVersion;
                    log["save"] = save.Save.DeepClone();
                    break;
                default:
                    throw new InvalidOperationException($"No log start {Start.GetType().Name}.");
            }

            log["entries"] = new JsonArray(Entries.Select(entry => (JsonNode?)new JsonObject
            {
                ["step"] = entry.Step,
                ["player"] = entry.Player,
                ["command"] = entry.Command?.DeepClone(),
            }).ToArray());

            log["checkpoints"] = new JsonArray(Checkpoints.Select(checkpoint => (JsonNode?)new JsonObject
            {
                ["step"] = checkpoint.Step,
                ["hash"] = checkpoint.Hash,
            }).ToArray());

            return log;
        }

        /// <summary>
        /// The log's text, ending in a newline: <see cref="ToJson"/> laid out by <see cref="JsonLines"/>, a line to each
        /// member, and to each value of a list.
        /// </summary>
        public string Write()
        {
            JsonObject log = ToJson();
            List<string> lines = ["{"];
            int member = 0;

            foreach ((string key, JsonNode? value) in log)
            {
                bool last = ++member == log.Count;

                if (value is JsonArray list)
                {
                    lines.AddRange(JsonLines.ListMember(key, list.ToList(), last));
                }
                else
                {
                    lines.Add(JsonLines.Member(key, value, last));
                }
            }

            lines.Add("}");
            return JsonLines.FileOf(lines);
        }

        private static List<LoggedCommand> ReadEntries(JsonNode? node)
        {
            if (node is not JsonArray list)
            {
                throw new InvalidDataException("A command log's entries are a list");
            }

            List<LoggedCommand> entries = new List<LoggedCommand>();

            for (int i = 0; i < list.Count; i++)
            {
                if (list[i] is not JsonObject entry || !TryGetStep(entry["step"], out long step) ||
                    !Validation.TryGetString(entry["player"], out string? player) || !entry.ContainsKey("command"))
                {
                    throw new InvalidDataException($"Entry {i} of the command log is not a {{step, player, command}}");
                }

                if (entries.Count > 0 && step < entries[^1].Step)
                {
                    throw new InvalidDataException($"Entry {i} of the command log, at step {step}, comes before the entry above it");
                }

                entries.Add(new LoggedCommand(step, player!, entry["command"]));
            }

            return entries;
        }

        private static List<Checkpoint> ReadCheckpoints(JsonNode? node)
        {
            if (node is not JsonArray list)
            {
                throw new InvalidDataException("A command log's checkpoints are a list");
            }

            List<Checkpoint> checkpoints = new List<Checkpoint>();

            for (int i = 0; i < list.Count; i++)
            {
                if (list[i] is not JsonObject checkpoint || !TryGetStep(checkpoint["step"], out long step) ||
                    !Validation.TryGetString(checkpoint["hash"], out string? hash) || !IsSha256Hex(hash!))
                {
                    throw new InvalidDataException($"Checkpoint {i} of the command log is not a {{step, hash}}");
                }

                if (checkpoints.Count > 0 && step <= checkpoints[^1].Step)
                {
                    throw new InvalidDataException($"Checkpoint {i} of the command log, at step {step}, is not after the one above it");
                }

                checkpoints.Add(new Checkpoint(step, hash!));
            }

            return checkpoints;
        }

        // The save format version a version 2 log names for its save: one SavedGame upgrades from
        private static int SaveVersion(JsonNode? node)
        {
            if (!Validation.TryGetWholeNumberIn(node, SavedGame.OldestVersion, SavedGame.CurrentVersion, out long saveVersion))
            {
                throw new InvalidDataException(
                    $"A command log's save has a saveVersion, a save format version from {SavedGame.OldestVersion} to {SavedGame.CurrentVersion}");
            }

            return (int)saveVersion;
        }

        // A step: a whole number from 0 to MaxStep
        private static bool TryGetStep(JsonNode? node, out long step)
        {
            return Validation.TryGetWholeNumberIn(node, 0, MaxStep, out step);
        }

        // A SHA-256 in lower-case hex, as /^[0-9a-f]{64}$/ matches one
        private static bool IsSha256Hex(string text)
        {
            return text.Length == 64 && text.All(digit => digit is >= '0' and <= '9' or >= 'a' and <= 'f');
        }
    }
}
