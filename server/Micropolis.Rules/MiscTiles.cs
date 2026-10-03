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
    /// Fire, radiation, flood and explosion tiles, as <c>src/miscTiles.js</c> spreads and clears them.
    /// </summary>
    public static class MiscTiles
    {
        public static void FireFound(GameMap map, int x, int y, SimData simData)
        {
            throw new NotPortedException("miscTiles.fireFound");
        }

        public static void RadiationFound(GameMap map, int x, int y, SimData simData)
        {
            throw new NotPortedException("miscTiles.radiationFound");
        }

        public static void FloodFound(GameMap map, int x, int y, SimData simData)
        {
            throw new NotPortedException("miscTiles.floodFound");
        }

        public static void ExplosionFound(GameMap map, int x, int y, SimData simData)
        {
            throw new NotPortedException("miscTiles.explosionFound");
        }

        public static void RegisterHandlers(MapScanner mapScanner, RepairManager repairManager)
        {
            mapScanner.AddAction(TileUtils.IsFire, FireFound);
            mapScanner.AddAction(TileValues.RADTILE, RadiationFound);
            mapScanner.AddAction(TileUtils.IsFlood, FloodFound);
            mapScanner.AddAction(TileUtils.IsManualExplosion, ExplosionFound);
        }
    }
}
