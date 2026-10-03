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

namespace Micropolis.Rules
{
    /// <summary>
    /// The map-wide scans of <c>src/blockMapUtils.js</c>, which phases 10–15 run over the block maps.
    /// </summary>
    public static class BlockMapUtils
    {
        public static void CrimeScan(Census census, BlockMaps blockMaps)
        {
            throw new NotPortedException("blockMapUtils.crimeScan");
        }

        public static void FireAnalysis(BlockMaps blockMaps)
        {
            throw new NotPortedException("blockMapUtils.fireAnalysis");
        }

        public static void NeutraliseRateOfGrowthMap(BlockMaps blockMaps)
        {
            throw new NotPortedException("blockMapUtils.neutraliseRateOfGrowthMap");
        }

        public static void NeutraliseTrafficMap(BlockMaps blockMaps)
        {
            throw new NotPortedException("blockMapUtils.neutraliseTrafficMap");
        }

        public static void PollutionTerrainLandValueScan(GameMap map, Census census, BlockMaps blockMaps, RandomStream random)
        {
            throw new NotPortedException("blockMapUtils.pollutionTerrainLandValueScan");
        }

        public static void PopulationDensityScan(GameMap map, BlockMaps blockMaps)
        {
            throw new NotPortedException("blockMapUtils.populationDensityScan");
        }
    }
}
