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
    /// Industrial zones, as <c>src/industrial.js</c> grows and declines them.
    /// </summary>
    public static class Industrial
    {
        /// <summary>
        /// The population level, 0–4, of the industrial zone whose centre has the tile value.
        /// </summary>
        public static int GetZonePopulation(GameMap map, int x, int y, int tileValue)
        {
            if (tileValue == TileValues.INDCLR)
            {
                return 0;
            }

            return JsMath.FloorDiv(tileValue - TileValues.IZB, 9) % 4 + 1;
        }

        public static void IndustrialFound(GameMap map, int x, int y, SimData simData)
        {
            throw new NotPortedException("industrial.industrialFound");
        }

        public static void RegisterHandlers(MapScanner mapScanner, RepairManager repairManager)
        {
            mapScanner.AddAction(TileUtils.IsIndustrialZone, IndustrialFound);
        }
    }
}
