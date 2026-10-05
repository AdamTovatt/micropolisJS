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
    }
}
