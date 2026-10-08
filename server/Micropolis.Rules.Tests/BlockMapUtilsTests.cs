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

namespace Micropolis.Rules.Tests
{
    [TestClass]
    public sealed class BlockMapUtilsTests
    {
        // The cap of 300 on crime before the police shows only where the police then take it below 250, which no
        // fixture's city reaches, so no log's checkpoint can prove it.
        [TestMethod]
        public void CrimeScan_CrimePastItsCapUnderPolice_CapsItBeforeThePolice()
        {
            BlockMaps blockMaps = new BlockMaps(120, 100);
            blockMaps.LandValueMap.WorldSet(60, 48, 10);
            blockMaps.PopulationDensityMap.WorldSet(60, 48, 250);

            // Police cover of 100 everywhere, which smoothing leaves at 100 away from the map's edges
            for (int x = 0; x < blockMaps.PoliceStationMap.Width; x++)
            {
                for (int y = 0; y < blockMaps.PoliceStationMap.Height; y++)
                {
                    blockMaps.PoliceStationMap.Set(x, y, 100);
                }
            }

            BlockMapUtils.CrimeScan(new Census(), blockMaps);

            // 128 - 10 + 250 = 368, capped at 300, less the police
            Assert.AreEqual(200, blockMaps.CrimeRateMap.WorldGet(60, 48));
        }

        // The rail load each way eases as the traffic does, a tile at a time: light load clears, heavy load falls faster
        // than moderate, and the tile beside, in the same block of traffic, and the other way keep their own
        [TestMethod]
        [DataRow(true, 24, 0)]
        [DataRow(true, 25, 1)]
        [DataRow(true, 200, 176)]
        [DataRow(false, 201, 167)]
        [DataRow(false, Traffic.MaxRailLoad, Traffic.MaxRailLoad - 34)]
        public void NeutraliseTrafficMap_RailLoad_EasesEachTileEachWayAsTheTraffic(bool fromNorthOrWest, int load, int eased)
        {
            BlockMaps blockMaps = new BlockMaps(120, 100);
            blockMaps.RailLoad(fromNorthOrWest).WorldSet(60, 48, load);
            blockMaps.RailLoad(!fromNorthOrWest).WorldSet(60, 48, 100);
            blockMaps.TrafficDensityMap.WorldSet(60, 48, load);

            BlockMapUtils.NeutraliseTrafficMap(blockMaps);

            Assert.AreEqual((eased, 0, 76, eased),
                            (blockMaps.RailLoad(fromNorthOrWest).WorldGet(60, 48), blockMaps.RailLoad(fromNorthOrWest).WorldGet(61, 48),
                             blockMaps.RailLoad(!fromNorthOrWest).WorldGet(60, 48), blockMaps.TrafficDensityMap.WorldGet(60, 48)));
        }
    }
}
