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

using System.Text.Json.Nodes;
using Micropolis.SourceTree;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The command logs under <c>conformance/logs/</c> (<c>docs/command-log.md</c>), read by <see cref="CommandLog"/>,
    /// as the C# headless runner reads one. On top of it the reader is stricter, as the readers of the other
    /// conformance files are: it refuses a key the format doesn't define, a level beside a save and a saveVersion
    /// beside a seed, which <see cref="CommandLog"/> ignores, a save without its saveVersion, and a log with no
    /// checkpoint.
    /// </summary>
    public static class ConformanceLogs
    {
        private const string Directory = "logs";

        /// <summary>
        /// The name of each log's file, in order.
        /// </summary>
        public static IReadOnlyList<string> Files()
        {
            return System.IO.Directory.GetFiles(RepositoryFiles.GetPath($"conformance/{Directory}"), $"*{CommandLog.FileExtension}")
                .Select(path => Path.GetFileName(path))
                .Order(StringComparer.Ordinal)
                .ToList();
        }

        /// <summary>
        /// The text of the log in the file of that name.
        /// </summary>
        public static string Read(string file)
        {
            return ConformanceFile.Read($"{Directory}/{file}");
        }

        public static IReadOnlyList<ConformanceLog> Load()
        {
            List<ConformanceLog> logs = Files().Select(file => Parse(file[..^CommandLog.FileExtension.Length], Read(file))).ToList();

            ConformanceFile.NonEmpty(Directory, logs);
            return logs;
        }

        public static ConformanceLog Parse(string name, string json)
        {
            JsonNode? node = JsonText.Parse(json);

            // What the shared reader leaves alone: a key the format doesn't define, a level beside a save and a
            // saveVersion beside a seed
            JsonObject log = Members(node, $"The log {name}", ["formatVersion", "entries", "checkpoints"],
                                     ["description", "seed", "level", "save", "saveVersion"]);

            if (log.ContainsKey("level") != log.ContainsKey("seed"))
            {
                throw Broken($"The log {name} has a level with a seed, and only then.");
            }

            if (log.ContainsKey("saveVersion") != log.ContainsKey("save"))
            {
                throw Broken($"The log {name} has a saveVersion with a save, and only then.");
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
                parsed = CommandLog.Read(node);
            }
            catch (InvalidDataException exception)
            {
                throw Broken($"The log {name}: {exception.Message}");
            }

            ConformanceFile.NonEmpty("checkpoints", parsed.Checkpoints);
            return new ConformanceLog(name, parsed);
        }

        // An object that holds every required key, and otherwise only optional ones
        private static JsonObject Members(JsonNode? node, string what, string[] required, string[]? optional = null)
        {
            if (node is not JsonObject value)
            {
                throw Broken($"{what} is not an object");
            }

            string? unknown = value.Select(member => member.Key)
                .FirstOrDefault(key => !required.Contains(key) && !(optional ?? []).Contains(key));
            string? missing = required.FirstOrDefault(key => !value.ContainsKey(key));

            if (unknown is not null || missing is not null)
            {
                throw Broken(unknown is not null ? $"{what} has an unknown member {unknown}" : $"{what} lacks {missing}");
            }

            return value;
        }

        private static InvalidDataException Broken(string problem)
        {
            return new InvalidDataException(problem);
        }
    }

    /// <summary>
    /// A command log under its file's name.
    /// </summary>
    public sealed record ConformanceLog(string Name, CommandLog Log)
    {
        public override string ToString()
        {
            return Name;
        }
    }
}
