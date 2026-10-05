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

using System.Text.Json;
using System.Text.Json.Nodes;
using Micropolis.Rules;

namespace Micropolis.Headless
{
    /// <summary>
    /// A stage's checkpoint in the end-to-end playthrough: the steps the run had taken and the commands it had applied
    /// when the stage ended, which are the log's entries before it, and the state hash of the city then, as
    /// <c>StageCheckpoint</c> in <c>e2e/goldenPlaythrough.ts</c>.
    /// </summary>
    internal sealed record StageCheckpoint(string Stage, int Step, int Commands, string Hash);

    /// <summary>
    /// The golden playthrough, <c>e2e/goldenPlaythrough.json</c>: each stage's checkpoint, in stage order, and the run's
    /// command log, as <c>readGoldenRun</c> in <c>e2e/goldenPlaythrough.ts</c> reads it.
    /// </summary>
    internal sealed record GoldenPlaythrough(IReadOnlyList<StageCheckpoint> Checkpoints, CommandLog Log)
    {
        /// <summary>
        /// The golden playthrough in the file at <paramref name="path"/>. An <see cref="InvalidDataException"/> names the
        /// file when it is not JSON, holds no log, or holds no stage checkpoints.
        /// </summary>
        public static GoldenPlaythrough Read(string path)
        {
            JsonNode? golden;

            try
            {
                golden = JsonText.Parse(File.ReadAllText(path));
            }
            catch (JsonException exception)
            {
                throw new InvalidDataException($"The golden playthrough {path} is not JSON: {exception.Message}");
            }

            CommandLog log;

            try
            {
                log = CommandLog.Read(golden?["log"]);
            }
            catch (InvalidDataException exception)
            {
                throw new InvalidDataException($"The golden playthrough {path} holds no log: {exception.Message}");
            }

            if (golden?["checkpoints"] is not JsonArray checkpoints)
            {
                throw new InvalidDataException($"The golden playthrough {path} holds no stage checkpoints: they are a JSON array");
            }

            return new GoldenPlaythrough(checkpoints.Select(checkpoint => ReadStage(path, checkpoint)).ToList(), log);
        }

        private static StageCheckpoint ReadStage(string path, JsonNode? checkpoint)
        {
            if (checkpoint is JsonObject stage &&
                stage["stage"] is JsonValue name && name.TryGetValue(out string? named) &&
                TryGetCount(stage["step"], out int step) &&
                TryGetCount(stage["commands"], out int commands) &&
                stage["hash"] is JsonValue hash && hash.TryGetValue(out string? hashed))
            {
                return new StageCheckpoint(named, step, commands, hashed);
            }

            throw new InvalidDataException(
                $"The golden playthrough {path} holds a stage checkpoint that isn't one: a stage's name, its step and commands, counts from 0, and its hash");
        }

        // A whole number from 0, which JsonText reads as a double, as JavaScript does
        private static bool TryGetCount(JsonNode? value, out int count)
        {
            count = 0;

            if (value is not JsonValue number || !number.TryGetValue(out double read) || read < 0 || read > int.MaxValue ||
                read != Math.Floor(read))
            {
                return false;
            }

            count = (int)read;
            return true;
        }
    }
}
