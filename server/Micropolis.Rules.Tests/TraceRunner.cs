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
    /// The traces <c>conformance/traces.ts</c> records under <c>conformance/traces/</c>, replayed: each a fixture's
    /// saved city, with the changes and tiles the trace names, then its calls, each followed by the state hash and the events the
    /// TypeScript's call left.
    /// </summary>
    internal static class TraceRunner
    {
        private const string TraceDirectory = "traces";

        // The hex digits of the state hash a call keeps, TRACE_HASH_DIGITS in conformance/traces.ts
        private const int HashDigits = 12;

        /// <summary>
        /// The name of every trace, from its file.
        /// </summary>
        public static IReadOnlyList<string> Names()
        {
            return Directory.GetFiles(RepositoryFiles.GetPath($"conformance/{TraceDirectory}"), "*.json.gz")
                .Select(file => Path.GetFileName(file)[..^".json.gz".Length])
                .Order(StringComparer.Ordinal)
                .ToList();
        }

        public static JsonObject Read(string name)
        {
            return ConformanceFile.ReadGzipped($"{TraceDirectory}/{name}.json.gz").AsObject();
        }

        /// <summary>
        /// Replays the trace, and names the first call after which the state hash or the events differ from the
        /// TypeScript's, or answers <see langword="null"/> when none does. Every call's hash is compared: a state may
        /// differ for one call only, such as the frame a train shows on a bend.
        /// </summary>
        public static string? Run(JsonObject trace)
        {
            JsonArray calls = trace["calls"]!.AsArray();

            if (calls.Count == 0)
            {
                throw new InvalidDataException($"The trace {trace["name"]} makes no call, so proves nothing.");
            }

            JsonObject changes = trace["changes"]!.AsObject();
            JsonArray tiles = trace["tiles"]!.AsArray();
            Simulation city = FixtureCities.City((string)trace["fixture"]!, (string)trace["point"]!, save =>
            {
                Change(save, changes);
                SetTiles(save, tiles);
            });
            JsonArray events = new JsonArray();
            city.Events.Observer = (name, payload) => events.Add(RecordedEvents.Of(name, payload));

            for (int i = 0; i < calls.Count; i++)
            {
                JsonObject call = calls[i]!.AsObject();
                string unit = (string)call["unit"]!;
                IReadOnlyList<int> args = call["args"]!.AsArray().Select(arg => (int)arg!).ToList();
                string expectedHash = (string)call["hash"]!;

                if (expectedHash.Length != HashDigits)
                {
                    throw new InvalidDataException(
                        $"Call {i} of the trace {trace["name"]} keeps a hash of {expectedHash.Length} digits, not {HashDigits}.");
                }

                events.Clear();
                Invoke(city, unit, args);

                string hash = StateHash.HashSavedState(city.Save())[..HashDigits];
                string? difference = hash != expectedHash
                    ? $"the state hash begins {hash}, but the TypeScript's {expectedHash}"
                    : SnapshotComparison.EventDifference(call["events"]!, events);

                if (difference is not null)
                {
                    return $"Call {i} of the trace {trace["name"]}, {unit}({string.Join(", ", args)}), the first to differ: {difference}";
                }
            }

            return null;
        }

        // Sets each change's dotted path in the save
        private static void Change(JsonObject save, JsonObject changes)
        {
            foreach ((string path, JsonNode? value) in changes)
            {
                (JsonObject owner, string key) = SavePaths.Locate(save, path);

                if (!owner.ContainsKey(key))
                {
                    throw new InvalidDataException($"A trace changes {path}, which the save doesn't hold.");
                }

                owner[key] = value?.DeepClone();
            }
        }

        // Sets each tile of the saved map to its raw value
        private static void SetTiles(JsonObject save, JsonArray tiles)
        {
            JsonObject map = save["map"]!.AsObject();
            int width = (int)map["width"]!;
            int height = (int)map["height"]!;
            JsonArray mapTiles = map["tiles"]!.AsArray();

            foreach (JsonNode? node in tiles)
            {
                int x = (int)node!["x"]!;
                int y = (int)node["y"]!;

                if (x < 0 || y < 0 || x >= width || y >= height)
                {
                    throw new InvalidDataException($"A trace sets the tile ({x}, {y}), which is off the map.");
                }

                mapTiles[y * width + x] = (int)node["value"]!;
            }
        }

        // The calls a trace may make, as UNITS in conformance/traces.ts names them
        private static void Invoke(Simulation city, string unit, IReadOnlyList<int> args)
        {
            switch (unit)
            {
                case "spriteManager.moveObjects":
                    city.SpriteManager.MoveObjects(city.ConstructSimData());
                    break;

                case "spriteManager.makeMonster":
                    city.SpriteManager.MakeMonster();
                    break;

                case "spriteManager.makeMonsterAt":
                    city.SpriteManager.MakeMonsterAt(args[0], args[1]);
                    break;

                case "spriteManager.makeTornado":
                    city.SpriteManager.MakeTornado();
                    break;

                case "spriteManager.makeExplosion":
                    city.SpriteManager.MakeExplosion(args[0], args[1]);
                    break;

                case "disasterManager.doDisasters":
                    city.DisasterManager.DoDisasters((Level)args[0], city.Census);
                    break;

                case "disasterManager.setFire":
                    city.DisasterManager.SetFire();
                    break;

                case "disasterManager.makeFire":
                    city.DisasterManager.MakeFire();
                    break;

                case "disasterManager.makeFlood":
                    city.DisasterManager.MakeFlood();
                    break;

                case "disasterManager.makeCrash":
                    city.DisasterManager.MakeCrash();
                    break;

                case "disasterManager.makeMeltdown":
                    city.DisasterManager.MakeMeltdown();
                    break;

                case "disasterManager.makeEarthquake":
                    city.DisasterManager.MakeEarthquake();
                    break;

                case "transport.railFound":
                    Transport.RailFound(city.Map, args[0], args[1], city.ConstructSimData());
                    break;

                case "transport.portFound":
                    Transport.PortFound(city.Map, args[0], args[1], city.ConstructSimData());
                    break;

                case "transport.airportFound":
                    Transport.AirportFound(city.Map, args[0], args[1], city.ConstructSimData());
                    break;

                default:
                    throw new InvalidDataException($"A trace calls {unit}, which the runner has no case for.");
            }
        }
    }
}
