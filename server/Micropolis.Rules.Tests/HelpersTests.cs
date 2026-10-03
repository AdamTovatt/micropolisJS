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
using static Micropolis.Rules.Tests.FixtureCities;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The helpers the tile handlers share, against what the TypeScript answered in <c>conformance/helpers.json</c>.
    /// </summary>
    [TestClass]
    public sealed class HelpersTests
    {
        private static readonly ConformanceHelpers Helpers = ConformanceHelpers.Load();

        private static readonly IReadOnlyDictionary<string, Func<int, bool>> ValuePredicates = new Dictionary<string, Func<int, bool>>
        {
            ["canBulldoze"] = TileUtils.CanBulldoze,
            ["isCommercial"] = TileUtils.IsCommercial,
            ["isDriveable"] = TileUtils.IsDriveable,
            ["isFire"] = TileUtils.IsFire,
            ["isFlood"] = TileUtils.IsFlood,
            ["isIndustrial"] = TileUtils.IsIndustrial,
            ["isManualExplosion"] = TileUtils.IsManualExplosion,
            ["isRail"] = TileUtils.IsRail,
            ["isResidential"] = TileUtils.IsResidential,
            ["isRoad"] = TileUtils.IsRoad,
        };

        private static readonly IReadOnlyDictionary<string, Func<Tile, bool>> ZonePredicates = new Dictionary<string, Func<Tile, bool>>
        {
            ["isCommercialZone"] = TileUtils.IsCommercialZone,
            ["isIndustrialZone"] = TileUtils.IsIndustrialZone,
            ["isResidentialZone"] = TileUtils.IsResidentialZone,
        };

        private static readonly IReadOnlyDictionary<string, Func<GameMap, int, int, int, int>> Populations = new Dictionary<string, Func<GameMap, int, int, int, int>>
        {
            ["residential"] = Residential.GetZonePopulation,
            ["commercial"] = Commercial.GetZonePopulation,
            ["industrial"] = Industrial.GetZonePopulation,
        };

        public static IEnumerable<object[]> ValuePredicateNames => Helpers.ValuePredicates.Keys.Select(name => new object[] { name });

        public static IEnumerable<object[]> ZonePredicateNames => Helpers.ZonePredicates.Keys.Select(name => new object[] { name });

        [TestMethod]
        public void TileUtils_PredicatesComparedWithTheFile_AreTheSame()
        {
            CollectionAssert.AreEquivalent(ValuePredicates.Keys.ToList(), Helpers.ValuePredicates.Keys.ToList());
            CollectionAssert.AreEquivalent(ZonePredicates.Keys.ToList(), Helpers.ZonePredicates.Keys.ToList());
        }

        [TestMethod]
        [DynamicData(nameof(ValuePredicateNames))]
        public void ValuePredicate_EveryTileValue_AnswersAsTypeScript(string name)
        {
            string line = Helpers.ValuePredicates[name];

            for (int value = 0; value < TileValues.TILE_COUNT; value++)
            {
                Assert.AreEqual(line[value] == '1', ValuePredicates[name](value), $"{name}({value})");
                Assert.AreEqual(line[value] == '1', OfTile(name, new Tile(value)), $"{name} of a tile of {value}");
            }
        }

        [TestMethod]
        [DynamicData(nameof(ZonePredicateNames))]
        public void ZonePredicate_EveryTileValue_AnswersAsTypeScriptForAZoneCentreAndNoForAnyOtherTile(string name)
        {
            string line = Helpers.ZonePredicates[name];

            for (int value = 0; value < TileValues.TILE_COUNT; value++)
            {
                Assert.AreEqual(line[value] == '1', ZonePredicates[name](new Tile(value, TileFlags.ZONEBIT)), $"{name}({value}, zone)");
                Assert.IsFalse(ZonePredicates[name](new Tile(value)), $"{name}({value}, not a zone)");
            }
        }

        [TestMethod]
        public void GetZonePopulation_FixtureZones_CountAsTypeScript()
        {
            List<HelperZone> counted = Helpers.Zones.Where(zone => zone.Kind is not null).ToList();

            Assert.IsNotEmpty(counted);
            foreach (IGrouping<(string, string), HelperZone> save in counted.GroupBy(zone => (zone.Fixture, zone.Point)))
            {
                GameMap map = City(save.Key.Item1, save.Key.Item2).Map;

                foreach (HelperZone zone in save)
                {
                    Assert.AreEqual(zone.Population, Populations[zone.Kind!](map, zone.X, zone.Y, zone.Value), zone.ToString());
                }
            }
        }

        [TestMethod]
        public void FindPerimeterRoad_FixtureZones_FindsTheRoadTypeScriptFound()
        {
            foreach (IGrouping<(string, string), HelperZone> save in Helpers.Zones.GroupBy(zone => (zone.Fixture, zone.Point)))
            {
                Simulation city = City(save.Key.Item1, save.Key.Item2);

                foreach (HelperZone zone in save)
                {
                    Position? road = city.TrafficManager.FindPerimeterRoad(new Position(zone.X, zone.Y));

                    Assert.AreEqual(zone.PerimeterRoad, road is Position found ? new HelperPosition(found.X, found.Y) : null, zone.ToString());
                }
            }
        }

        [TestMethod]
        public void CheckTile_DamagedFixtureZones_RepairsAsTypeScript()
        {
            foreach (HelperRepair repair in Helpers.Repairs)
            {
                Simulation city = City(Helpers.RepairFixture, "built");
                foreach (RepairDamage damage in Helpers.RepairDamage)
                {
                    city.Map.SetTile(repair.X + damage.Dx, repair.Y + damage.Dy, damage.Value, TileFlags.NOFLAGS);
                }

                city.RepairManager.CheckTile(repair.X, repair.Y, repair.CityTime);

                List<int> area = Enumerable.Range(0, 36)
                    .Select(i => city.Map.GetTile(repair.X - 1 + (i % 6), repair.Y - 1 + (i / 6)).GetRawValue())
                    .ToList();
                CollectionAssert.AreEqual(repair.Area.ToList(), area, $"The zone at ({repair.X}, {repair.Y}) at city time {repair.CityTime}");
            }
        }

        [TestMethod]
        public void GetSprite_SpritesAdded_FindsTheSpriteTypeScriptFound()
        {
            SpriteManager sprites = SpriteCity().SpriteManager;

            foreach (FirstOfType expected in Helpers.Sprites.FirstOfType)
            {
                Sprite? sprite = sprites.GetSprite((SpriteType)expected.Type);
                int? index = sprite is null ? null : sprites.SpriteList.ToList().IndexOf(sprite);

                Assert.AreEqual(expected.Index, index, $"The first sprite of type {expected.Type}");
            }
        }

        [TestMethod]
        public void GetBoatDistance_SpritesAdded_MeasuresAsTypeScript()
        {
            SpriteManager sprites = SpriteCity().SpriteManager;

            foreach (BoatDistance expected in Helpers.Sprites.BoatDistances)
            {
                Assert.AreEqual(expected.Distance, sprites.GetBoatDistance(expected.X, expected.Y), $"From ({expected.X}, {expected.Y})");
            }
        }

        // A value predicate given a tile, which reads the tile's value
        private static bool OfTile(string name, Tile tile)
        {
            return name switch
            {
                "canBulldoze" => TileUtils.CanBulldoze(tile),
                "isCommercial" => TileUtils.IsCommercial(tile),
                "isDriveable" => TileUtils.IsDriveable(tile),
                "isFire" => TileUtils.IsFire(tile),
                "isFlood" => TileUtils.IsFlood(tile),
                "isIndustrial" => TileUtils.IsIndustrial(tile),
                "isManualExplosion" => TileUtils.IsManualExplosion(tile),
                "isRail" => TileUtils.IsRail(tile),
                "isResidential" => TileUtils.IsResidential(tile),
                "isRoad" => TileUtils.IsRoad(tile),
                _ => throw new ArgumentException($"No predicate named {name}.", nameof(name)),
            };
        }

        // The sprites' fixture, with the sprites the file adds at the end of its list
        private static Simulation SpriteCity()
        {
            return City(Helpers.Sprites.Fixture, Helpers.Sprites.Point, save =>
            {
                JsonArray list = save["sprites"]!["list"]!.AsArray();

                foreach (JsonNode? sprite in Helpers.Sprites.Added)
                {
                    list.Add(sprite!.DeepClone());
                }
            });
        }
    }
}
