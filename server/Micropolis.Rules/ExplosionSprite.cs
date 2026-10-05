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
    /// The explosion's start and move, after the original's doExplosionSprite in sprite.cpp.
    /// </summary>
    internal static class ExplosionSprite
    {
        public static void Init(Sprite sprite)
        {
            sprite.Frame = 1;
        }

        public static void Move(SpriteManager manager, Sprite sprite)
        {
            if ((manager.SpriteCycle & 1) == 0)
            {
                if (sprite.Frame == 1)
                {
                    // The original reports the explosion without a picture, so the monster TV is left as it is
                    manager.Events.Emit(RulesEvents.ExplosionReported, new NewsPlace((sprite.X >> 4) + 3, sprite.Y >> 4));
                }

                sprite.Frame++;
            }

            // Burnt out: fire under the hot spot, and on the four tiles diagonally around it
            if (sprite.Frame > 6)
            {
                sprite.Frame = 0;

                StartFire(manager, sprite.X + 48 - 8, sprite.Y + 16);
                StartFire(manager, sprite.X + 48 - 24, sprite.Y);
                StartFire(manager, sprite.X + 48 + 8, sprite.Y);
                StartFire(manager, sprite.X + 48 - 24, sprite.Y + 32);
                StartFire(manager, sprite.X + 48 + 8, sprite.Y + 32);
            }
        }

        // Fire on the tile under the pixel, if it burns or is bare dirt, and isn't a zone's centre
        private static void StartFire(SpriteManager manager, long px, long py)
        {
            GameMap map = manager.Map;
            int x = (int)SpriteUtils.PixToWorld(px);
            int y = (int)SpriteUtils.PixToWorld(py);

            if (!map.TestBounds(x, y))
            {
                return;
            }

            Tile tile = map.GetTile(x, y);

            if (!tile.IsCombustible() && tile.GetValue() != TileValues.DIRT)
            {
                return;
            }

            if (tile.IsZone())
            {
                return;
            }

            map.SetTo(x, y, TileUtils.RandomFire(manager.Random));
        }
    }
}
