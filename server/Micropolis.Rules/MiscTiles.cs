/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 * Modified in Adam Tovatt's continuation of micropolisJS. Copyright (C) 2026 Adam Tovatt
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
    /// Fire, radiation, flood and explosion tiles, as the original's <c>mapScan</c> in simulate.cpp spreads and clears
    /// them.
    /// </summary>
    public static class MiscTiles
    {
        private static readonly int[] XDelta = [-1, 0, 1, 0];
        private static readonly int[] YDelta = [0, -1, 0, 1];

        /// <summary>
        /// Counts a fire, may spread it to its neighbours, setting a zone whose centre catches on fire, and may burn it
        /// out to rubble, the likelier the better the fire department covers it.
        /// </summary>
        public static void FireFound(GameMap map, int x, int y, SimData simData)
        {
            simData.Census.FirePop += 1;

            if ((simData.Random.GetRandom16() & 3) != 0)
            {
                return;
            }

            // Try to set neighbouring tiles on fire as well
            for (int i = 0; i < 4; i++)
            {
                if (simData.Random.GetChance(7))
                {
                    int xTem = x + XDelta[i];
                    int yTem = y + YDelta[i];

                    if (map.TestBounds(xTem, yTem))
                    {
                        Tile tile = map.GetTile(xTem, yTem);
                        if (!tile.IsCombustible())
                        {
                            continue;
                        }

                        if (tile.IsZone())
                        {
                            // Neighbour is a zone and burnable
                            ZoneUtils.FireZone(map, xTem, yTem, simData.BlockMaps);

                            // Industrial zones etc really go boom
                            if (tile.GetValue() > TileValues.IZB)
                            {
                                simData.SpriteManager.MakeExplosion(xTem, yTem);
                            }
                        }

                        map.SetTo(xTem, yTem, TileUtils.RandomFire(simData.Random));
                    }
                }
            }

            // How likely the fire is to burn out: a bigger rate is a smaller chance
            int rate = 10;
            int cover = simData.BlockMaps.FireStationEffectMap.WorldGet(x, y);

            if (cover > 100)
            {
                rate = 1;
            }
            else if (cover > 20)
            {
                rate = 2;
            }
            else if (cover > 0)
            {
                rate = 3;
            }

            if (simData.Random.GetRandom(rate) == 0)
            {
                map.SetTo(x, y, TileUtils.RandomRubble(simData.Random));
            }
        }

        /// <summary>
        /// Decays a radiation tile to dirt, rarely.
        /// </summary>
        public static void RadiationFound(GameMap map, int x, int y, SimData simData)
        {
            if (simData.Random.GetChance(4095))
            {
                map.SetTile(x, y, TileValues.DIRT, TileFlags.NOFLAGS);
            }
        }

        /// <summary>
        /// Spreads or recedes a flood, as <see cref="DisasterManager.DoFlood"/> does.
        /// </summary>
        public static void FloodFound(GameMap map, int x, int y, SimData simData)
        {
            simData.DisasterManager.DoFlood(x, y, simData.BlockMaps);
        }

        /// <summary>
        /// Clears an explosion to rubble.
        /// </summary>
        /// <remarks>
        /// The original's scan clears explosions from their middle frames on, as its map tiles step through the
        /// animation. Here the map keeps the frame an explosion was placed with and only the renderer animates it, so
        /// the whole range is cleared.
        /// </remarks>
        public static void ExplosionFound(GameMap map, int x, int y, SimData simData)
        {
            map.SetTo(x, y, TileUtils.RandomRubble(simData.Random));
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
