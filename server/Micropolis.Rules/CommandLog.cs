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

using System.Text;
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

    public sealed record SaveStart(JsonObject Save) : LogStart;

    /// <summary>
    /// A logged command: the step it preceded, the player who sent it, and the command as it arrived, any JSON.
    /// </summary>
    public sealed record LoggedCommand(int Step, string Player, JsonNode? Command);

    /// <summary>
    /// The city's state hash at a step: after that many steps, and after every command stamped with that step.
    /// </summary>
    public sealed record Checkpoint(int Step, string Hash);

    /// <summary>
    /// A command log (<c>docs/command-log.md</c>), as <c>src/commandLog.ts</c> reads it, and written as the
    /// conformance files lay one out: a line to each entry and each checkpoint, so a diff shows which moved, and the
    /// save it starts from, if any, on one line.
    /// </summary>
    public sealed record CommandLog(string? Description, LogStart Start, IReadOnlyList<LoggedCommand> Entries,
                                     IReadOnlyList<Checkpoint> Checkpoints)
    {
        public const int FormatVersion = 1;

        /// <summary>
        /// A recorder's checkpoint every this many steps, a minute of play, as <c>CHECKPOINT_INTERVAL</c> in
        /// <c>src/commandLog.ts</c>.
        /// </summary>
        public const int CheckpointInterval = 3600;

        /// <summary>
        /// How a command log's file name ends.
        /// </summary>
        public const string FileExtension = ".log.json";

        /// <summary>
        /// The step a replay ends at: its last entry's or its last checkpoint's, whichever is later.
        /// </summary>
        public int LastStep => Math.Max(Entries.Count == 0 ? 0 : Entries[^1].Step, Checkpoints.Count == 0 ? 0 : Checkpoints[^1].Step);

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

            if (!Validation.TryGetWholeNumber(log["formatVersion"], out double version) || version != FormatVersion)
            {
                string written = log["formatVersion"] is JsonNode node ? CanonicalJson.Stringify(node) : "undefined";
                throw new InvalidDataException($"This is a version {written} command log: only version {FormatVersion} can be replayed");
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
                start = new SaveStart(log["save"] as JsonObject ?? throw new InvalidDataException("A command log's save is an object"));
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
        /// The log's text, ending in a newline.
        /// </summary>
        public string Write()
        {
            List<string> lines = ["{", Member("formatVersion", FormatVersion)];

            if (Description != null)
            {
                lines.Add(Member("description", Description));
            }

            switch (Start)
            {
                case SeedStart seed:
                    lines.Add(Member("seed", seed.Seed));
                    lines.Add(Member("level", (int)seed.Level));
                    break;
                case SaveStart save:
                    lines.Add(Member("save", save.Save));
                    break;
                default:
                    throw new InvalidOperationException($"No log start {Start.GetType().Name}.");
            }

            lines.AddRange(ListLines("entries", Entries.Select(entry => new JsonObject
            {
                ["step"] = entry.Step,
                ["player"] = entry.Player,
                ["command"] = entry.Command?.DeepClone(),
            }).ToList(), false));

            lines.AddRange(ListLines("checkpoints", Checkpoints.Select(checkpoint => new JsonObject
            {
                ["step"] = checkpoint.Step,
                ["hash"] = checkpoint.Hash,
            }).ToList(), true));

            lines.Add("}");

            StringBuilder text = new StringBuilder();
            foreach (string line in lines)
            {
                text.Append(line).Append('\n');
            }

            return text.ToString();
        }

        private static string Member(string key, JsonNode? value)
        {
            return $"  {CanonicalJson.Stringify(key)}: {CanonicalJson.Stringify(value)},";
        }

        // One JSON value per line, in a list
        private static List<string> ListLines(string key, IReadOnlyList<JsonObject> values, bool last)
        {
            string end = last ? "" : ",";

            if (values.Count == 0)
            {
                return [$"  {CanonicalJson.Stringify(key)}: []{end}"];
            }

            List<string> lines = [$"  {CanonicalJson.Stringify(key)}: ["];

            for (int i = 0; i < values.Count; i++)
            {
                lines.Add($"    {CanonicalJson.Stringify(values[i])}{(i < values.Count - 1 ? "," : "")}");
            }

            lines.Add($"  ]{end}");
            return lines;
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
                if (list[i] is not JsonObject entry || !TryGetStep(entry["step"], out int step) ||
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
                if (list[i] is not JsonObject checkpoint || !TryGetStep(checkpoint["step"], out int step) ||
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

        // A step the replay can count to: a whole number from 0, which a log the game wrote never takes past int
        private static bool TryGetStep(JsonNode? node, out int step)
        {
            bool isStep = Validation.TryGetWholeNumberIn(node, 0, int.MaxValue, out long value);
            step = (int)value;
            return isStep;
        }

        // A SHA-256 in lower-case hex, as /^[0-9a-f]{64}$/ matches one
        private static bool IsSha256Hex(string text)
        {
            return text.Length == 64 && text.All(digit => digit is >= '0' and <= '9' or >= 'a' and <= 'f');
        }
    }
}
