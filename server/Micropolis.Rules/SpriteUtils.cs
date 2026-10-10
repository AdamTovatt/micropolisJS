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
    /// What the sprites' moves share, after the helpers of the original's sprite.cpp: converting between pixels and
    /// tiles, turning, colliding, and what a sprite does to the tile under it.
    /// </summary>
    internal static class SpriteUtils
    {
        /// <summary>
        /// The tile of a pixel, <c>p &gt;&gt; 4</c>, which rounds down: the pixels from -16 to -1 fall
        /// in tile -1.
        /// </summary>
        public static long PixToWorld(long p)
        {
            return p >> 4;
        }

        // The tile of a pixel by C's integer division, which truncates toward zero, as the original's p / 16: the
        // pixels from -15 to -1 fall in tile 0
        public static long TruncatingPixToWorld(long p)
        {
            return p < 0 ? -(-p >> 4) : p >> 4;
        }

        /// <summary>
        /// The pixel coordinate of a tile coordinate.
        /// </summary>
        public static long WorldToPix(int w)
        {
            return w << 4;
        }

        // Attempts to turn 45° towards the desired direction, either way, whichever gets there sooner
        public static long TurnTo(long presentDir, long desiredDir)
        {
            if (presentDir == desiredDir)
            {
                return presentDir;
            }

            if (presentDir < desiredDir)
            {
                presentDir += desiredDir - presentDir < 4 ? 1 : -1;
            }
            else
            {
                presentDir += presentDir - desiredDir < 4 ? -1 : 1;
            }

            if (presentDir > 8)
            {
                presentDir = 1;
            }

            if (presentDir < 1)
            {
                presentDir = 8;
            }

            return presentDir;
        }

        // The value of the tile under the pixel, or -1 off the map
        public static int GetTileValue(GameMap map, long x, long y)
        {
            long worldX = PixToWorld(x);
            long worldY = PixToWorld(y);

            if (worldX < 0 || worldX >= map.Width || worldY < 0 || worldY >= map.Height)
            {
                return -1;
            }

            return map.GetTileValue((int)worldX, (int)worldY);
        }

        /// <summary>
        /// The value of the tile under the sprite's hot spot, or -1 off the map.
        /// </summary>
        public static int GetHotSpotTileValue(GameMap map, Sprite sprite)
        {
            return GetTileValue(map, sprite.X + sprite.XHot, sprite.Y + sprite.YHot);
        }

        // What a monster or a tornado does to the tile under the pixel: a road becomes the river, a flammable
        // tile an explosion or, if it is wet, the river, setting a zone on fire, and blowing up any but a residential one
        public static void DestroyMapTile(SpriteManager manager, GameMap map, BlockMaps blockMaps, long ox, long oy)
        {
            int x = (int)PixToWorld(ox);
            int y = (int)PixToWorld(oy);

            if (!map.TestBounds(x, y))
            {
                return;
            }

            Tile tile = map.GetTile(x, y);
            int tileValue = tile.GetValue();

            if (tileValue < TileValues.TREEBASE)
            {
                return;
            }

            if (!tile.IsCombustible())
            {
                if (tileValue >= TileValues.ROADBASE && tileValue <= TileValues.LASTROAD)
                {
                    map.SetTile(x, y, TileValues.RIVER, TileFlags.NOFLAGS);
                    map.ClearUnusableWalkway(x, y);
                }

                return;
            }

            if (tile.IsZone())
            {
                ZoneUtils.FireZone(map, x, y, blockMaps);

                if (tileValue > TileValues.RZB)
                {
                    manager.MakeExplosionAt(ox, oy);
                }
            }

            if (Waterways.IsBuiltOverWater(tileValue))
            {
                map.SetTile(x, y, TileValues.RIVER, TileFlags.NOFLAGS);
                map.ClearUnusableWalkway(x, y);
            }
            else
            {
                map.SetTile(x, y, TileValues.TINYEXP, TileFlags.BULLBIT | TileFlags.ANIMBIT);
            }
        }

        // Whether two live sprites' hot spots are close enough to collide
        public static bool CheckSpriteCollision(Sprite s1, Sprite s2)
        {
            return s1.Frame != 0 && s2.Frame != 0 &&
                   Math.Abs(s1.X + s1.XHot - (s2.X + s2.XHot)) + Math.Abs(s1.Y + s1.YHot - (s2.Y + s2.YHot)) < 30;
        }
    }
}
