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
using static Micropolis.Rules.TileFlags;
using static Micropolis.Rules.TileValues;

namespace Micropolis.Rules.Tests
{
    [TestClass]
    public sealed class GameMapTests
    {
        [TestMethod]
        public void Constructor_Size_FillsWithDirtAndCentresThePositions()
        {
            GameMap map = new GameMap(5, 3);

            Assert.AreEqual(DIRT, map.GetTileValue(4, 2));
            Assert.AreEqual(2, map.CityCentreX);
            Assert.AreEqual(1, map.CityCentreY);
            Assert.AreEqual(2, map.PollutionMaxX);
            Assert.AreEqual(1, map.PollutionMaxY);
        }

        [TestMethod]
        [DataRow(0, 3)]
        [DataRow(5, 0)]
        public void Constructor_EmptySize_Throws(int width, int height)
        {
            Assert.Throws<ArgumentException>(() => new GameMap(width, height));
        }

        [TestMethod]
        [DataRow(-1, 0)]
        [DataRow(0, -1)]
        [DataRow(5, 0)]
        [DataRow(0, 3)]
        public void TestBounds_OutsideTheMap_IsFalse(int x, int y)
        {
            Assert.IsFalse(new GameMap(5, 3).TestBounds(x, y));
        }

        [TestMethod]
        [DataRow(0, 0)]
        [DataRow(4, 2)]
        public void TestBounds_CornerOfTheMap_IsTrue(int x, int y)
        {
            Assert.IsTrue(new GameMap(5, 3).TestBounds(x, y));
        }

        [TestMethod]
        public void SetTile_OutsideTheMap_Throws()
        {
            GameMap map = new GameMap(5, 3);

            Assert.Throws<ArgumentOutOfRangeException>(() => map.SetTile(5, 0, RIVER, 0));
        }

        [TestMethod]
        public void SetTileValue_ValueWithoutFlagBits_KeepsTheTileFlags()
        {
            GameMap map = new GameMap(5, 3);
            map.SetTile(new Position(1, 1), WOODS, BLBNBIT);

            map.SetTileValue(new Position(1, 1), DIRT);

            Assert.AreEqual(DIRT, map.GetTileValue(1, 1));
            Assert.AreEqual(BLBNBIT, map.GetTileFlags(new Position(1, 1)));
        }

        [TestMethod]
        public void AddTileFlags_FlagsSetOrNot_SetsThemAndKeepsTheRest()
        {
            GameMap map = new GameMap(5, 3);
            map.SetTile(1, 1, WOODS, BLBNBIT);

            map.AddTileFlags(1, 1, BULLBIT | POWERBIT);

            Assert.AreEqual(WOODS, map.GetTileValue(1, 1));
            Assert.AreEqual(BLBNBIT | POWERBIT, map.GetTileFlags(1, 1));
        }

        [TestMethod]
        public void RemoveTileFlags_FlagsSetOrNot_ClearsThemAndKeepsTheRest()
        {
            GameMap map = new GameMap(5, 3);
            map.SetTile(1, 1, WOODS, BLBNBIT);

            map.RemoveTileFlags(1, 1, BURNBIT | POWERBIT);

            Assert.AreEqual(WOODS, map.GetTileValue(1, 1));
            Assert.AreEqual(BULLBIT, map.GetTileFlags(1, 1));
        }

        [TestMethod]
        public void AddTileFlags_OutsideTheMap_Throws()
        {
            GameMap map = new GameMap(5, 3);

            Assert.Throws<ArgumentOutOfRangeException>(() => map.AddTileFlags(0, 3, POWERBIT));
            Assert.Throws<ArgumentOutOfRangeException>(() => map.RemoveTileFlags(-1, 0, POWERBIT));
        }

        [TestMethod]
        [DataRow(FREEZ, 3)]
        [DataRow(POWERPLANT, 4)]
        public void PutZone_OnTheMap_CountsTheValuesUpFromTheUpperLeftWithTheCentreAZone(int centreTile, int size)
        {
            GameMap map = new GameMap(6, 6);

            map.PutZone(2, 2, centreTile, size);

            for (int i = 0; i < size * size; i++)
            {
                int x = 1 + (i % size);
                int y = 1 + (i / size);
                int flags = x == 2 && y == 2 ? BNCNBIT | ZONEBIT : BNCNBIT;
                Assert.AreEqual(centreTile - 1 - size + i, map.GetTileValue(x, y), $"({x}, {y})");
                Assert.AreEqual(flags, map.GetTileFlags(x, y), $"({x}, {y})");
            }

            int laid = Enumerable.Range(0, 36).Count(i => map.GetTileValue(i % 6, i / 6) != DIRT);
            Assert.AreEqual(size * size, laid);
        }

        [TestMethod]
        [DataRow(4, 2)]
        [DataRow(2, 4)]
        public void PutZone_CentreOnTheMapFarCornerOff_ThrowsBeforeLayingATile(int centreX, int centreY)
        {
            GameMap map = new GameMap(5, 5);

            Assert.Throws<ArgumentOutOfRangeException>(() => map.PutZone(centreX, centreY, FREEZ, 3));
            AssertAllDirt(map);
        }

        [TestMethod]
        [DataRow(0, 2)]
        [DataRow(2, 0)]
        public void PutZone_CentreOnTheMapNearCornerOff_ThrowsBeforeLayingATile(int centreX, int centreY)
        {
            GameMap map = new GameMap(5, 5);

            Assert.Throws<ArgumentOutOfRangeException>(() => map.PutZone(centreX, centreY, FREEZ, 3));
            AssertAllDirt(map);
        }

        [TestMethod]
        public void Save_Map_WritesItsFieldsAndRawTilesRowByRow()
        {
            GameMap map = new GameMap(3, 2);
            map.SetTile(2, 0, RIVER, 0);
            map.SetTile(0, 1, WOODS, BLBNBIT);
            map.CityCentreX = 1;
            map.PollutionMaxY = 0;

            JsonObject saveData = new JsonObject();
            map.Save(saveData);

            Assert.AreEqual(
                $"{{\"map\":{{\"cityCentreX\":1,\"cityCentreY\":1,\"height\":2,\"pollutionMaxX\":1,\"pollutionMaxY\":0,\"tiles\":[0,0,{RIVER},{WOODS | BLBNBIT},0,0],\"width\":3}}}}",
                CanonicalJson.Write(saveData));
        }

        private static void AssertAllDirt(GameMap map)
        {
            for (int y = 0; y < map.Height; y++)
            {
                for (int x = 0; x < map.Width; x++)
                {
                    Assert.AreEqual(DIRT, map.GetTileValue(x, y), $"({x}, {y})");
                }
            }
        }
    }
}
