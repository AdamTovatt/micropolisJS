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
    /// Stadiums, as the original's <c>doSpecialZone</c> in zone.cpp fills and empties them for games.
    /// </summary>
    public static class Stadia
    {
        /// <summary>
        /// Counts an empty stadium and, when it is powered, starts a game on one cycle in 32.
        /// </summary>
        public static void EmptyStadiumFound(GameMap map, int x, int y, SimData simData)
        {
            simData.Census.StadiumPop += 1;

            if (map.GetTile(x, y).IsPowered())
            {
                // Occasionally start the big game. The city time's low bits are an int32's, as JavaScript's & takes them.
                if (((simData.CityTime + x + y) & 31) == 0)
                {
                    map.PutZone(x, y, TileValues.FULLSTADIUM, 4);
                    map.AddTileFlags(x, y, TileFlags.POWERBIT);
                    map.SetTile(x + 1, y, TileValues.FOOTBALLGAME1, TileFlags.ANIMBIT);
                    map.SetTile(x + 1, y + 1, TileValues.FOOTBALLGAME2, TileFlags.ANIMBIT);
                }
            }
        }

        /// <summary>
        /// Counts a stadium playing a game, and ends the game on one cycle in eight.
        /// </summary>
        public static void FullStadiumFound(GameMap map, int x, int y, SimData simData)
        {
            simData.Census.StadiumPop += 1;

            // As drawStadium in the original does, the centre is marked powered whether or not it was: the next scan of
            // its tile sets the power from the grid
            if (((simData.CityTime + x + y) & 7) == 0)
            {
                map.PutZone(x, y, TileValues.STADIUM, 4);
                map.AddTileFlags(x, y, TileFlags.POWERBIT);
            }
        }

        public static void RegisterHandlers(MapScanner mapScanner, RepairManager repairManager)
        {
            mapScanner.AddAction(TileValues.STADIUM, EmptyStadiumFound);
            mapScanner.AddAction(TileValues.FULLSTADIUM, FullStadiumFound);
            repairManager.AddAction(TileValues.STADIUM, 15, 4);
        }
    }
}
