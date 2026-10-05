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
using Micropolis.Conformance;
using Micropolis.Rules;
using static Micropolis.Headless.ConformanceText;

namespace Micropolis.Headless
{
    /// <summary>
    /// <c>conformance/helpers.json</c>: what the helpers the tile handlers share answer, which a state hash shows only
    /// where a fixture happens to reach them. Every tile value's answer from each predicate of <see cref="TileUtils"/>
    /// that reads a value, and each that reads a zone's centre, given the zone flag, as a character per value, 1
    /// where it holds; every value's <see cref="ZoneUtils.CheckZoneSize"/> and <see cref="ZoneUtils.CheckBigZone"/>;
    /// each zone centre of the fixtures' saves, with the population its own kind of zone counts, the road on its
    /// perimeter a drive starts from (<see cref="Traffic.FindPerimeterRoad"/>) and its land value less its pollution as
    /// a category (<see cref="ZoneUtils.GetLandPollutionValue"/>); and a ship's distance from tiles near and far
    /// (<see cref="SpriteManager.GetBoatDistance"/>).
    /// </summary>
    internal static class HelpersFile
    {
        public const string FileName = "helpers.json";

        private static readonly IReadOnlyList<(string Name, Func<int, bool> Holds)> ValuePredicates =
        [
            ("canBulldoze", TileUtils.CanBulldoze), ("isCommercial", TileUtils.IsCommercial), ("isDriveable", TileUtils.IsDriveable),
            ("isFire", TileUtils.IsFire), ("isFlood", TileUtils.IsFlood), ("isIndustrial", TileUtils.IsIndustrial),
            ("isManualExplosion", TileUtils.IsManualExplosion), ("isRail", TileUtils.IsRail), ("isResidential", TileUtils.IsResidential),
            ("isRoad", TileUtils.IsRoad),
        ];

        private static readonly IReadOnlyList<(string Name, Func<Tile, bool> Holds)> ZonePredicates =
        [
            ("isCommercialZone", TileUtils.IsCommercialZone), ("isIndustrialZone", TileUtils.IsIndustrialZone),
            ("isResidentialZone", TileUtils.IsResidentialZone),
        ];

        // Each kind of zone, the test of its centre, and the population it counts
        private static readonly IReadOnlyList<(string Kind, Func<Tile, bool> Is, Func<GameMap, int, int, int, int> Population)> ZoneKinds =
        [
            ("residential", TileUtils.IsResidentialZone, Residential.GetZonePopulation),
            ("commercial", TileUtils.IsCommercialZone, Commercial.GetZonePopulation),
            ("industrial", TileUtils.IsIndustrialZone, Industrial.GetZonePopulation),
        ];

        // A ship added to the town after its run, which has none, and the tiles its distance is taken from: the map's
        // corners, a tile beside the ship, and one in the middle distance
        private const string ShipFixture = "town";
        private static readonly IReadOnlyList<(int X, int Y)> BoatTiles = [(0, 0), (1, 1), (37, 31), (56, 12), (119, 99)];

        private static JsonObject Ship => new JsonObject
        {
            ["count"] = 0, ["destX"] = 609, ["destY"] = 1295, ["dir"] = 0, ["flag"] = 0, ["frame"] = 3, ["newDir"] = 0,
            ["origX"] = 0, ["origY"] = 0, ["reachedLand"] = false, ["soundCount"] = 0, ["step"] = 0, ["type"] = (int)SpriteType.Ship, ["x"] = 600, ["y"] = 500,
            ["mission"] = new JsonObject { ["dockCount"] = 0, ["phase"] = (int)ShipPhase.SailingIn, ["port"] = null },
        };

        /// <summary>
        /// The file's text, about the fixtures' <paramref name="saves"/>, in their order.
        /// </summary>
        public static string Write(IReadOnlyList<FixtureSave> saves)
        {
            List<JsonNode?> zones = saves.SelectMany(Zones).ToList();

            EnsureCovers(zones.Any(zone => (int)zone!["value"]! == TileValues.FREEZ), "an empty residential zone");
            EnsureCovers(zones.Any(zone => (string?)zone!["kind"] == "commercial") && zones.Any(zone => (string?)zone!["kind"] == "industrial"),
                         "a commercial and an industrial zone");
            EnsureCovers(zones.Any(zone => zone!["perimeterRoad"] is null), "a zone with no road on its perimeter");
            foreach (int category in new[] { 0, 1, 2, 3 })
            {
                EnsureCovers(zones.Any(zone => (int)zone!["landPollutionValue"]! == category), $"a zone of land pollution value {category}");
            }

            IEnumerable<int> values = Enumerable.Range(0, TileValues.TILE_COUNT);

            return JsonLines.FileOf([
                "{",
                .. PredicateLines("valuePredicates", ValuePredicates.Select(predicate => (predicate.Name, TruthLine(predicate.Holds))).ToList()),
                .. PredicateLines("zonePredicates",
                                  ZonePredicates.Select(predicate => (predicate.Name, TruthLine(value => predicate.Holds(new Tile(value, TileFlags.ZONEBIT))))).ToList()),
                JsonLines.Member("checkZoneSize", new JsonArray(values.Select(value => (JsonNode?)ZoneUtils.CheckZoneSize(value)).ToArray()), false),
                JsonLines.Member("checkBigZone", new JsonArray(values.Select(value =>
                {
                    BigZone zone = ZoneUtils.CheckBigZone(value);
                    return (JsonNode?)new JsonArray(zone.ZoneSize, zone.DeltaX, zone.DeltaY);
                }).ToArray()), false),
                .. JsonLines.ListMember("zones", zones, false),
                JsonLines.Member("boatDistances", BoatDistances(saves), true),
                "}",
            ]);
        }

        // One character per tile value, 1 where the predicate holds
        private static string TruthLine(Func<int, bool> holds)
        {
            return string.Concat(Enumerable.Range(0, TileValues.TILE_COUNT).Select(value => holds(value) ? '1' : '0'));
        }

        // An object of a line to each predicate
        private static IEnumerable<string> PredicateLines(string key, IReadOnlyList<(string Name, string Line)> predicates)
        {
            return [
                $"  {CanonicalJson.Stringify(key)}: {{",
                .. predicates.Select((predicate, i) => $"    {CanonicalJson.Stringify(predicate.Name)}: {CanonicalJson.Stringify(predicate.Line)}{(i < predicates.Count - 1 ? "," : "")}"),
                "  },",
            ];
        }

        private static IEnumerable<JsonNode?> Zones(FixtureSave save)
        {
            Simulation city = Simulation.FromSave(save.Text);
            GameMap map = city.Map;

            for (int y = 0; y < map.Height; y++)
            {
                for (int x = 0; x < map.Width; x++)
                {
                    Tile tile = map.GetTile(x, y);
                    if (!tile.IsZone())
                    {
                        continue;
                    }

                    int kind = ZoneKinds.ToList().FindIndex(each => each.Is(tile));
                    Position? road = city.TrafficManager.FindPerimeterRoad(new Position(x, y));

                    yield return new JsonObject
                    {
                        ["fixture"] = save.At.Fixture,
                        ["point"] = save.At.Point,
                        ["x"] = x,
                        ["y"] = y,
                        ["value"] = tile.GetValue(),
                        ["kind"] = kind < 0 ? null : ZoneKinds[kind].Kind,
                        ["population"] = kind < 0 ? null : ZoneKinds[kind].Population(map, x, y, tile.GetValue()),
                        ["perimeterRoad"] = road is Position found ? new JsonObject { ["x"] = found.X, ["y"] = found.Y } : null,
                        ["landPollutionValue"] = ZoneUtils.GetLandPollutionValue(city.BlockMaps, x, y),
                    };
                }
            }
        }

        // The ship's distance from each tile, in the town after its run with the ship added
        private static JsonObject BoatDistances(IReadOnlyList<FixtureSave> saves)
        {
            JsonObject save = JsonNode.Parse(FixtureSaves.TextOf(saves, ShipFixture, FixtureSaves.Run))!.AsObject();
            JsonArray list = save["sprites"]!["list"]!.AsArray();
            EnsureCovers(list.All(sprite => (int)sprite!["type"]! != (int)SpriteType.Ship), $"a ship added to {ShipFixture}, whose list holds none");
            list.Add(Ship);

            SpriteManager sprites = Simulation.FromSave(CanonicalJson.Write(save)).SpriteManager;

            return new JsonObject
            {
                ["fixture"] = ShipFixture,
                ["point"] = FixtureSaves.Run,
                ["ship"] = Ship,
                ["distances"] = new JsonArray(BoatTiles.Select(tile => (JsonNode?)new JsonObject
                {
                    ["x"] = tile.X, ["y"] = tile.Y, ["distance"] = sprites.GetBoatDistance(tile.X, tile.Y),
                }).ToArray()),
            };
        }
    }
}
