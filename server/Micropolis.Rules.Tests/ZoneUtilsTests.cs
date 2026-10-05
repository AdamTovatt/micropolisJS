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

using static Micropolis.Rules.TileFlags;
using static Micropolis.Rules.TileValues;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// A burning zone: the tiles it makes bulldozable, as far as the original's fireZone sweeps, and the fire's fall in
    /// the rate of growth stopping at its floor.
    /// </summary>
    [TestClass]
    public sealed class ZoneUtilsTests
    {
        // A 3x3 residential zone around (50, 50), on a map whose top row is dirt
        private const int CentreX = 50;
        private const int CentreY = 50;

        [TestMethod]
        public void FireZone_ResidentialZone_MakesEveryTileOfTheZoneBulldozable()
        {
            GameMap map = ResidentialZone();

            Burn(map, CentreX, CentreY);

            for (int dy = -1; dy <= 1; dy++)
            {
                for (int dx = -1; dx <= 1; dx++)
                {
                    Assert.AreEqual(BULLBIT, map.GetTileFlags(CentreX + dx, CentreY + dy) & BULLBIT, $"({dx}, {dy})");
                }
            }
        }

        [TestMethod]
        public void FireZone_TileBelowTheRoads_LeavesItAloneWhateverLiesInTheTopRow()
        {
            GameMap map = ResidentialZone();
            map.SetTile(CentreX - 1, CentreY - 1, WOODS, BNCNBIT);
            map.SetTile(CentreX - 1, 0, RIVER, 0);

            Burn(map, CentreX, CentreY);

            Assert.AreEqual(0, map.GetTileFlags(CentreX - 1, CentreY - 1) & BULLBIT);
        }

        // As in the original's fireZone, every zone from PORTBASE up but the airport is swept from -1 to 3 around its
        // centre, so a 4x4 zone's sweep reaches one column and one row past it
        [TestMethod]
        public void FireZone_ZoneFromTheSeaportUp_MakesRoadsInTheRowAndColumnPastItBulldozable()
        {
            GameMap map = new GameMap(120, 100);
            map.SetTile(50, 50, POWERPLANT, BNCNBIT | ZONEBIT);
            map.SetTile(53, 51, ROADS, 0);
            map.SetTile(51, 53, ROADS, 0);

            Burn(map, 50, 50);

            Assert.AreEqual(BULLBIT, map.GetTileFlags(53, 51) & BULLBIT);
            Assert.AreEqual(BULLBIT, map.GetTileFlags(51, 53) & BULLBIT);
        }

        [TestMethod]
        [DataRow("a 4x4 zone", POWERPLANT, 53)]
        [DataRow("the airport", AIRPORT, 54)]
        public void FireZone_ZoneFromTheSeaportUp_SweepsAsFarAsTheOriginalAndNoFurther(string description, int centre, int lastSwept)
        {
            GameMap map = new GameMap(120, 100);
            map.SetTile(50, 50, centre, BNCNBIT | ZONEBIT);
            map.SetTile(lastSwept, 51, ROADS, 0);
            map.SetTile(lastSwept + 1, 51, ROADS, 0);
            map.SetTile(51, lastSwept + 1, ROADS, 0);

            Burn(map, 50, 50);

            Assert.AreEqual(BULLBIT, map.GetTileFlags(lastSwept, 51) & BULLBIT, description);
            Assert.AreEqual(0, map.GetTileFlags(lastSwept + 1, 51) & BULLBIT, description);
            Assert.AreEqual(0, map.GetTileFlags(51, lastSwept + 1) & BULLBIT, description);
        }

        [TestMethod]
        [DataRow(-150, -170)]
        [DataRow(-185, -200)]
        [DataRow(-200, -200)]
        public void FireZone_RateOfGrowth_FallsByTwentyToNoLowerThanMinus200(int start, int expected)
        {
            GameMap map = ResidentialZone();
            BlockMaps blockMaps = new BlockMaps(120, 100);
            blockMaps.RateOfGrowthMap.WorldSet(CentreX, CentreY, start);

            ZoneUtils.FireZone(map, CentreX, CentreY, blockMaps);

            Assert.AreEqual(expected, blockMaps.RateOfGrowthMap.WorldGet(CentreX, CentreY));
        }

        private static GameMap ResidentialZone()
        {
            GameMap map = new GameMap(120, 100);

            for (int dy = -1; dy <= 1; dy++)
            {
                for (int dx = -1; dx <= 1; dx++)
                {
                    bool isCentre = dx == 0 && dy == 0;
                    map.SetTile(CentreX + dx, CentreY + dy, RZB + dx + 3 * dy, BNCNBIT | (isCentre ? ZONEBIT : 0));
                }
            }

            return map;
        }

        private static void Burn(GameMap map, int x, int y)
        {
            ZoneUtils.FireZone(map, x, y, new BlockMaps(120, 100));
        }
    }
}
