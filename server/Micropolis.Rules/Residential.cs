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
    /// Residential zones and hospitals, as <c>src/residential.js</c> grows and declines them.
    /// </summary>
    public static class Residential
    {
        /// <summary>
        /// The houses in the 8 tiles around an empty residential zone's centre.
        /// </summary>
        private static int GetFreeZonePopulation(GameMap map, int x, int y)
        {
            int count = 0;
            for (int xx = x - 1; xx <= x + 1; xx++)
            {
                for (int yy = y - 1; yy <= y + 1; yy++)
                {
                    if (xx == x && yy == y)
                    {
                        continue;
                    }

                    int tileValue = map.GetTileValue(xx, yy);
                    if (tileValue >= TileValues.LHTHR && tileValue <= TileValues.HHTHR)
                    {
                        count += 1;
                    }
                }
            }

            return count;
        }

        /// <summary>
        /// The population of the residential zone centred at (x, y), whose centre has the tile value: its houses when
        /// it is empty, and when it is built up, as getResZonePop in the original, 16, 24, 32 or 40 by its density.
        /// </summary>
        public static int GetZonePopulation(GameMap map, int x, int y, int tileValue)
        {
            if (tileValue == TileValues.FREEZ)
            {
                return GetFreeZonePopulation(map, x, y);
            }

            int density = JsMath.FloorDiv(tileValue - TileValues.RZB, 9) % 4;
            return density * 8 + 16;
        }

        public static void ResidentialFound(GameMap map, int x, int y, SimData simData)
        {
            throw new NotPortedException("residential.residentialFound");
        }

        public static void HospitalFound(GameMap map, int x, int y, SimData simData)
        {
            throw new NotPortedException("residential.hospitalFound");
        }

        public static void RegisterHandlers(MapScanner mapScanner, RepairManager repairManager)
        {
            mapScanner.AddAction(TileUtils.IsResidentialZone, ResidentialFound);
            mapScanner.AddAction(TileValues.HOSPITAL, HospitalFound);
            repairManager.AddAction(TileValues.HOSPITAL, 15, 3);
        }
    }
}
