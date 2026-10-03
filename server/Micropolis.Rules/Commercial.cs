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
    /// Commercial zones, as <c>src/commercial.js</c> grows and declines them.
    /// </summary>
    public static class Commercial
    {
        /// <summary>
        /// The population level, 0–5, of the commercial zone whose centre has the tile value.
        /// </summary>
        public static int GetZonePopulation(GameMap map, int x, int y, int tileValue)
        {
            if (tileValue == TileValues.COMCLR)
            {
                return 0;
            }

            return JsMath.FloorDiv(tileValue - TileValues.CZB, 9) % 5 + 1;
        }

        public static void CommercialFound(GameMap map, int x, int y, SimData simData)
        {
            throw new NotPortedException("commercial.commercialFound");
        }

        public static void RegisterHandlers(MapScanner mapScanner, RepairManager repairManager)
        {
            mapScanner.AddAction(TileUtils.IsCommercialZone, CommercialFound);
        }
    }
}
