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
    /// Stadiums, as <c>src/stadia.js</c> fills and empties them for games.
    /// </summary>
    public static class Stadia
    {
        public static void EmptyStadiumFound(GameMap map, int x, int y, SimData simData)
        {
            throw new NotPortedException("stadia.emptyStadiumFound");
        }

        public static void FullStadiumFound(GameMap map, int x, int y, SimData simData)
        {
            throw new NotPortedException("stadia.fullStadiumFound");
        }

        public static void RegisterHandlers(MapScanner mapScanner, RepairManager repairManager)
        {
            mapScanner.AddAction(TileValues.STADIUM, EmptyStadiumFound);
            mapScanner.AddAction(TileValues.FULLSTADIUM, FullStadiumFound);
            repairManager.AddAction(TileValues.STADIUM, 15, 4);
        }
    }
}
