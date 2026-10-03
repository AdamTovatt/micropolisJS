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
    /// The unit snapshots the TypeScript reference records under <c>conformance/snapshots/</c>, as
    /// <c>index.json</c> lists them: each a call of a unit of work, with the saved state before and after it and the
    /// events it emitted.
    /// </summary>
    public static class UnitSnapshots
    {
        private const string Directory = "snapshots";

        public static IReadOnlyList<UnitSnapshot> Load()
        {
            return Parse(ConformanceFile.Read($"{Directory}/index.json"));
        }

        public static IReadOnlyList<UnitSnapshot> Parse(string json)
        {
            IReadOnlyList<UnitSnapshot> snapshots = ConformanceFile.Parse<SnapshotIndex>(json).Snapshots;
            ConformanceFile.NonEmpty("snapshots", snapshots);
            return snapshots;
        }

        /// <summary>
        /// The whole record the index entry lists, which must be the record it says. Each read decompresses the record's
        /// file anew, so a test run holds only the records its tests are running.
        /// </summary>
        internal static JsonObject ReadRecord(UnitSnapshot snapshot)
        {
            JsonArray records = ConformanceFile.ReadGzippedArray($"{Directory}/{snapshot.File}");

            if (snapshot.Record >= records.Count)
            {
                throw new InvalidDataException($"{snapshot.File} holds {records.Count} records, not record {snapshot.Record}.");
            }

            JsonObject record = records[snapshot.Record]!.AsObject();

            if ((string?)record["fixture"] != snapshot.Fixture || (string?)record["unit"] != snapshot.Unit ||
                (int?)record["step"] != snapshot.Step ||
                !JsonNode.DeepEquals(record["args"], new JsonArray(snapshot.Args.Select(arg => arg?.DeepClone()).ToArray())) ||
                !UnitSnapshotRunner.Strings(record["handlers"]).SequenceEqual(snapshot.Handlers))
            {
                throw new InvalidDataException($"Record {snapshot.Record} of {snapshot.File} is not the index's {snapshot}.");
            }

            return record;
        }

        private sealed record SnapshotIndex(IReadOnlyList<UnitSnapshot> Snapshots);
    }

    /// <summary>
    /// One unit snapshot as the index lists it: where its record is, and what it holds besides the states. A cycle
    /// unit's arguments are numbers, and <c>simulation.applyCommands</c>'s one argument is the commands it applies.
    /// </summary>
    public sealed record UnitSnapshot(
        string File, int Record, string Fixture, string Unit, string Speed, int Step, IReadOnlyList<JsonNode?> Args,
        IReadOnlyList<string> Handlers, IReadOnlyList<string> Reached, IReadOnlyList<string> Events)
    {
        public override string ToString()
        {
            string args = Args.Count == 0 ? "" :
                Args[0] is JsonArray commands ? $"({commands.Count} commands)" : $"({string.Join(", ", Args.Select(arg => arg!.ToJsonString()))})";
            string handlers = Handlers.SequenceEqual(Simulation.HandlerFamilies) ? "" :
                Handlers.Count == 0 ? " with no handlers" : $" with {string.Join(", ", Handlers)}";

            return $"{Fixture} at {Speed} speed, step {Step}: {Unit}{args}{handlers}";
        }
    }
}
