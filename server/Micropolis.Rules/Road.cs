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

using static Micropolis.Rules.TileFlags;
using static Micropolis.Rules.TileValues;

namespace Micropolis.Rules
{
    /// <summary>
    /// Roads and bridges, as the original's <c>doRoad</c> and <c>doBridge</c> in simulate.cpp wear them down, show
    /// their traffic, and open and close the drawbridges.
    /// </summary>
    public static class Road
    {
        // The drawbridges' seven tiles, relative to the bridge tile scanned, closed and open: raw values, flags and all
        private static readonly int[] VerticalDeltaX = [0, 1, 0, 0, 0, 0, 1];
        private static readonly int[] VerticalDeltaY = [-2, -2, -1, 0, 1, 2, 2];

        private static readonly int[] OpenVertical =
        [
            VBRDG0 | BULLBIT, VBRDG1 | BULLBIT, RIVER, BRWV | BULLBIT, RIVER, VBRDG2 | BULLBIT, VBRDG3 | BULLBIT,
        ];

        private static readonly int[] CloseVertical =
        [
            VBRIDGE | BULLBIT, RIVER, VBRIDGE | BULLBIT, VBRIDGE | BULLBIT, VBRIDGE | BULLBIT, VBRIDGE | BULLBIT, RIVER,
        ];

        private static readonly int[] HorizontalDeltaX = [-2, 2, -2, -1, 0, 1, 2];
        private static readonly int[] HorizontalDeltaY = [-1, -1, 0, 0, 0, 0, 0];

        private static readonly int[] OpenHorizontal =
        [
            HBRDG1 | BULLBIT, HBRDG3 | BULLBIT, HBRDG0 | BULLBIT, RIVER, BRWH | BULLBIT, RIVER, HBRDG2 | BULLBIT,
        ];

        private static readonly int[] CloseHorizontal =
        [
            RIVER, RIVER, HBRIDGE | BULLBIT, HBRIDGE | BULLBIT, HBRIDGE | BULLBIT, HBRIDGE | BULLBIT, HBRIDGE | BULLBIT,
        ];

        // The first tile of each traffic density: none, light and heavy
        private static readonly int[] DensityTable = [ROADBASE, LTRFBASE, HTRFBASE];

        /// <summary>
        /// Counts a road or bridge tile, may wear it away while the roads are underfunded, opens or closes a
        /// drawbridge, and shows the traffic the last traffic scan left on it.
        /// </summary>
        public static void RoadFound(GameMap map, int x, int y, SimData simData)
        {
            simData.Census.RoadTotal += 1;

            Tile currentTile = map.GetTile(x, y);
            int tileValue = currentTile.GetValue();

            if (simData.Budget.ShouldDegradeRoad())
            {
                if (simData.Random.GetChance(511))
                {
                    // Don't degrade tiles with power lines
                    if (!currentTile.IsConductive())
                    {
                        if (simData.Budget.RoadEffect < (simData.Random.GetRandom16() & 31))
                        {
                            // Replace bridge tiles with water, otherwise rubble
                            if ((tileValue & 15) < 2 || (tileValue & 15) == 15)
                            {
                                map.SetTile(x, y, RIVER, NOFLAGS);
                            }
                            else
                            {
                                map.SetTo(x, y, TileUtils.RandomRubble(simData.Random));
                            }

                            return;
                        }
                    }
                }
            }

            // Bridges are not combustible
            if (!currentTile.IsCombustible())
            {
                // With the one above, a bridge counts as five road tiles
                simData.Census.RoadTotal += 4;
                if (DoBridge(map, x, y, tileValue, simData))
                {
                    return;
                }
            }

            // The traffic density the tile shows
            int density;
            if (tileValue < LTRFBASE)
            {
                density = 0;
            }
            else if (tileValue < HTRFBASE)
            {
                density = 1;
            }
            else
            {
                // Heavy traffic counts as two tiles of upkeep
                simData.Census.RoadTotal += 1;
                density = 2;
            }

            // The density the last traffic scan left, 0–2: the traffic density map is capped at 240
            int currentDensity = simData.BlockMaps.TrafficDensityMap.WorldGet(x, y) >> 6;
            if (currentDensity > 1)
            {
                currentDensity -= 1;
            }

            if (currentDensity == density)
            {
                return;
            }

            int newValue = ((tileValue - ROADBASE) & 15) + DensityTable[currentDensity];

            // Every flag but the animation is kept
            int newFlags = currentTile.GetFlags() & ~ANIMBIT;
            if (currentDensity > 0)
            {
                newFlags |= ANIMBIT;
            }

            map.SetTile(x, y, newValue, newFlags);
        }

        public static void RegisterHandlers(MapScanner mapScanner, RepairManager repairManager)
        {
            mapScanner.AddAction(TileUtils.IsRoad, RoadFound);
        }

        private static bool DoBridge(GameMap map, int x, int y, int tileValue, SimData simData)
        {
            if (tileValue == BRWV)
            {
                // An open vertical bridge: possibly close it
                if (simData.Random.GetChance(3) && simData.SpriteManager.GetBoatDistance(x, y) > 340)
                {
                    CloseBridge(map, x, y, VerticalDeltaX, VerticalDeltaY, OpenVertical, CloseVertical);
                }

                return true;
            }

            if (tileValue == BRWH)
            {
                // An open horizontal bridge: possibly close it
                if (simData.Random.GetChance(3) && simData.SpriteManager.GetBoatDistance(x, y) > 340)
                {
                    CloseBridge(map, x, y, HorizontalDeltaX, HorizontalDeltaY, OpenHorizontal, CloseHorizontal);
                }

                return true;
            }

            if (simData.SpriteManager.GetBoatDistance(x, y) < 300 || simData.Random.GetChance(7))
            {
                if ((tileValue & 1) != 0)
                {
                    if (x < map.Width - 1)
                    {
                        if (map.GetTileValue(x + 1, y) == CHANNEL)
                        {
                            // A closed vertical bridge: open it
                            OpenBridge(map, x, y, VerticalDeltaX, VerticalDeltaY, CloseVertical, OpenVertical);
                            return true;
                        }
                    }

                    return false;
                }

                if (y > 0)
                {
                    if (map.GetTileValue(x, y - 1) == CHANNEL)
                    {
                        // A closed horizontal bridge: open it
                        OpenBridge(map, x, y, HorizontalDeltaX, HorizontalDeltaY, CloseHorizontal, OpenHorizontal);
                        return true;
                    }
                }
            }

            return false;
        }

        // Opening takes any tile of the closed bridge's shape, traffic included, or the channel, and writes each tile
        // whole, as doBridge in the original does
        private static void OpenBridge(GameMap map, int origX, int origY, int[] xDelta, int[] yDelta, int[] oldTiles, int[] newTiles)
        {
            for (int i = 0; i < 7; i++)
            {
                int x = origX + xDelta[i];
                int y = origY + yDelta[i];

                if (map.TestBounds(x, y))
                {
                    int tileValue = map.GetTileValue(x, y);
                    if (tileValue == CHANNEL || (tileValue & 15) == (oldTiles[i] & 15))
                    {
                        map.GetTile(x, y).SetRawValue(newTiles[i]);
                    }
                }
            }
        }

        // Closing takes only the open bridge's own tiles
        private static void CloseBridge(GameMap map, int origX, int origY, int[] xDelta, int[] yDelta, int[] oldTiles, int[] newTiles)
        {
            for (int i = 0; i < 7; i++)
            {
                int x = origX + xDelta[i];
                int y = origY + yDelta[i];

                if (map.TestBounds(x, y))
                {
                    if (map.GetTileValue(x, y) == (oldTiles[i] & BIT_MASK))
                    {
                        map.GetTile(x, y).SetRawValue(newTiles[i]);
                    }
                }
            }
        }
    }
}
