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

namespace Micropolis.Headless
{
    /// <summary>
    /// <c>conformance/stationCover.json</c>: the fire cover a station alone on a map gives each block, as the fire
    /// analysis spreads it (<see cref="BlockMapUtils.FireAnalysis"/>), at the fire effect its funding gives it. The
    /// end-to-end runner works out the cover to choose where to build a station, and its tests hold it to these.
    /// </summary>
    internal static class StationCoverFile
    {
        public const string FileName = "stationCover.json";

        // A small map, with stations in its middle, in a corner, and in the far corner underfunded
        private const int MapWidth = 48;
        private const int MapHeight = 32;
        private static readonly IReadOnlyList<(int X, int Y, int FireEffect)> Stations = [(20, 12, 1000), (0, 0, 1000), (47, 31, 777)];

        public static string Write()
        {
            List<JsonNode?> cases = Stations.Select(station =>
            {
                BlockMaps maps = new BlockMaps(MapWidth, MapHeight);
                maps.FireStationMap.WorldSet(station.X, station.Y, station.FireEffect);
                BlockMapUtils.FireAnalysis(maps);
                BlockMap cover = maps.FireStationEffectMap;

                return (JsonNode?)new JsonObject
                {
                    ["centre"] = new JsonObject { ["x"] = station.X, ["y"] = station.Y },
                    ["fireEffect"] = station.FireEffect,
                    ["cover"] = new JsonArray(Enumerable.Range(0, cover.Height)
                        .Select(y => (JsonNode?)new JsonArray(Enumerable.Range(0, cover.Width).Select(x => (JsonNode?)cover.Get(x, y)).ToArray()))
                        .ToArray()),
                };
            }).ToList();

            return JsonLines.FileOf([
                "{",
                JsonLines.Member("mapWidth", MapWidth, false),
                JsonLines.Member("mapHeight", MapHeight, false),
                .. JsonLines.ListMember("cases", cases, true),
                "}",
            ]);
        }
    }
}
