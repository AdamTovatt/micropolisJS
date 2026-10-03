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
    /// The C# generator against the TypeScript reference, through <c>conformance/maps.json</c>.
    /// </summary>
    [TestClass]
    public sealed class MapGeneratorTests
    {
        private static readonly ConformanceMaps Maps = ConformanceMaps.Load();

        public static IEnumerable<object[]> Seeds => Maps.Seeds.Select(seed => new object[] { seed });

        public static IEnumerable<object[]> ListedMaps => Maps.Maps.Select(map => new object[] { map });

        [TestMethod]
        [DynamicData(nameof(Seeds))]
        public void Generate_ConformanceSeed_HashesAsTypeScriptMap(MapSeed seed)
        {
            Assert.AreEqual(seed.Hash, StateHash.HashSavedState(SavedMapObject(seed.Seed)));
        }

        [TestMethod]
        [DynamicData(nameof(ListedMaps))]
        public void Generate_ListedSeed_LaysEveryTileAsTypeScript(ListedMap listed)
        {
            JsonObject map = SavedMapObject(listed.Seed);

            Assert.AreEqual(listed.Map.Width, map["width"]!.GetValue<int>());
            Assert.AreEqual(listed.Map.Height, map["height"]!.GetValue<int>());

            JsonArray tiles = map["tiles"]!.AsArray();

            for (int y = 0; y < listed.Map.Height; y++)
            {
                for (int x = 0; x < listed.Map.Width; x++)
                {
                    int index = x + y * listed.Map.Width;
                    Assert.AreEqual(listed.Map.Tiles[index], tiles[index]!.GetValue<int>(), $"The tile at ({x}, {y}) differs.");
                }
            }

            Assert.AreEqual(listed.Map.CityCentreX, map["cityCentreX"]!.GetValue<int>());
            Assert.AreEqual(listed.Map.CityCentreY, map["cityCentreY"]!.GetValue<int>());
            Assert.AreEqual(listed.Map.PollutionMaxX, map["pollutionMaxX"]!.GetValue<int>());
            Assert.AreEqual(listed.Map.PollutionMaxY, map["pollutionMaxY"]!.GetValue<int>());
        }

        [TestMethod]
        public void Generate_SameStreamState_GeneratesSameMap()
        {
            Assert.AreEqual(CanonicalJson.Write(SavedMapObject(1234)), CanonicalJson.Write(SavedMapObject(1234)));
        }

        [TestMethod]
        public void Generate_DifferentSeed_GeneratesDifferentMap()
        {
            Assert.AreNotEqual(CanonicalJson.Write(SavedMapObject(1234)), CanonicalJson.Write(SavedMapObject(1235)));
        }

        private static JsonObject SavedMapObject(uint seed)
        {
            JsonObject saveData = new JsonObject();
            MapGenerator.Generate(RandomStream.MapStream(seed)).Save(saveData);
            return saveData["map"]!.AsObject();
        }
    }
}
