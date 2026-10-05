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
using Micropolis.Rules;
using static Micropolis.Headless.ConformanceText;

namespace Micropolis.Headless
{
    /// <summary>
    /// <c>conformance/maps.json</c>: the hash of the map object each of a few seeds generates, with the land the
    /// generator laid and the lakes it drew, and every tile of the first map of each kind of land laid out differently,
    /// so a mismatch can be located. The seeds are those from 0 up whose map some sort still wants, and the largest
    /// seed.
    /// </summary>
    internal static class MapsFile
    {
        public const string FileName = "maps.json";

        private const int SearchedSeeds = 10000;

        // The maps the seeds cover: how many of each sort, and how to tell one
        private static readonly IReadOnlyList<(string Name, int Count, Func<SeedMap, bool> Matches)> Wanted =
        [
            ("an island", 3, map => map.Generated.Land == MapLand.Island),
            ("a naked island with rivers", 3, map => map.Generated.Land == MapLand.NakedIsland),
            ("land", 3, map => map.Generated.Land == MapLand.Land),
            ("land after the island draw", 3, map => map.Generated.Land == MapLand.LandAfterIslandDraw),
            ("rivers and no lakes", 1, map => map.Generated.Land != MapLand.Island && map.Generated.Lakes == 0),
            ("the most lakes", 1, map => map.Generated.Lakes == 10),
        ];

        // Every tile of the first map of each of these lands is listed
        private static readonly IReadOnlyList<MapLand> ListedLands = [MapLand.Island, MapLand.NakedIsland, MapLand.Land];

        /// <summary>
        /// The file's text.
        /// </summary>
        public static string Write()
        {
            List<SeedMap> chosen = ChooseMaps();
            List<JsonNode?> seeds = chosen.Select(map => (JsonNode?)new JsonObject
            {
                ["seed"] = map.Seed,
                ["kind"] = LandName(map.Generated.Land),
                ["lakes"] = map.Generated.Lakes,
                ["hash"] = StateHash.HashSavedState(map.Generated.Map.SavedObject()),
            }).ToList();
            List<SeedMap> listed = ListedLands.Select(land => chosen.First(map => map.Generated.Land == land)).ToList();

            return JsonLines.FileOf([
                "{",
                .. JsonLines.ListMember("seeds", seeds, false),
                "  \"maps\": [",
                .. listed.SelectMany((map, i) => ListedMapLines(map, i == listed.Count - 1)),
                "  ]",
                "}",
            ]);
        }

        // Counting from zero, each seed whose map some sort still wants, then the largest seed
        private static List<SeedMap> ChooseMaps()
        {
            List<SeedMap> chosen = new List<SeedMap>();

            List<(string Name, int Count, Func<SeedMap, bool> Matches)> Wanting()
            {
                return Wanted.Where(want => chosen.Count(want.Matches) < want.Count).ToList();
            }

            for (uint seed = 0; seed < SearchedSeeds && Wanting().Count > 0; seed++)
            {
                SeedMap generated = Generate(seed);

                if (Wanting().Any(want => want.Matches(generated)))
                {
                    chosen.Add(generated);
                }
            }

            foreach ((string name, int _, Func<SeedMap, bool> _) in Wanting())
            {
                EnsureCovers(false, $"{name} in the first {SearchedSeeds} seeds");
            }

            chosen.Add(Generate(uint.MaxValue));
            return chosen;
        }

        private static SeedMap Generate(uint seed)
        {
            return new SeedMap(seed, MapGenerator.Lay(RandomStream.MapStream(seed)));
        }

        private static string LandName(MapLand land)
        {
            return land switch
            {
                MapLand.Island => "island",
                MapLand.NakedIsland => "nakedIsland",
                MapLand.Land => "land",
                MapLand.LandAfterIslandDraw => "landAfterIslandDraw",
                _ => throw new ArgumentOutOfRangeException(nameof(land), land, "No such land."),
            };
        }

        // A map object with its tiles one row to a line
        private static IEnumerable<string> ListedMapLines(SeedMap listed, bool last)
        {
            GameMap map = listed.Generated.Map;
            string fields = string.Concat(map.SavedObject().Where(member => member.Key != "tiles")
                .Select(member => $"{Stringify(member.Key)}:{Stringify(member.Value)},"));
            int[] tiles = map.RawValues();
            List<string> lines = [$"    {{\"seed\":{listed.Seed},\"map\":{{{fields}\"tiles\":["];

            for (int y = 0; y < map.Height; y++)
            {
                string row = string.Join(",", tiles.Skip(y * map.Width).Take(map.Width));
                lines.Add($"        {row}{(y < map.Height - 1 ? "," : "")}");
            }

            lines.Add($"    ]}}}}{(last ? "" : ",")}");
            return lines;
        }

        private sealed record SeedMap(uint Seed, GeneratedMap Generated);
    }
}
