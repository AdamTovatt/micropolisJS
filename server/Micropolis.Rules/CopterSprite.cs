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

using System.Text.Json.Nodes;

namespace Micropolis.Rules
{
    /// <summary>
    /// The helicopter's move, as <c>src/copterSprite.js</c> brings the original's doCopterSprite.
    /// </summary>
    internal static class CopterSprite
    {
        private static readonly long[] DeltaX = [0, 0, 3, 5, 3, 0, -3, -5, -3];
        private static readonly long[] DeltaY = [0, -5, -3, 0, 3, 5, 3, 0, -3];

        public static void Move(SpriteManager manager, Sprite sprite, BlockMaps blockMaps)
        {
            if (sprite.SoundCount > 0)
            {
                sprite.SoundCount--;
            }

            if (sprite.Count > 0)
            {
                sprite.Count--;
            }

            if (sprite.Count == 0)
            {
                // Head towards a monster, or failing that a tornado, or failing that home
                Sprite? s = manager.GetSprite(SpriteType.Monster) ?? manager.GetSprite(SpriteType.Tornado);

                if (s is not null)
                {
                    sprite.DestX = s.X;
                    sprite.DestY = s.Y;
                }
                else
                {
                    sprite.DestX = sprite.OrigX;
                    sprite.DestY = sprite.OrigY;
                }

                // Near home, it lands
                manager.GetDir(sprite.X, sprite.Y, sprite.OrigX, sprite.OrigY);
                if (manager.AbsDist < 30)
                {
                    sprite.Frame = 0;
                    return;
                }
            }

            if (sprite.SoundCount == 0)
            {
                long x = SpriteManager.TruncatingPixToWorld(sprite.X + 48);
                long y = SpriteManager.TruncatingPixToWorld(sprite.Y);

                if (x >= 0 && x < manager.Map.Width && y >= 0 && y < manager.Map.Height)
                {
                    if (blockMaps.TrafficDensityMap.WorldGet((int)x, (int)y) > 170 && (manager.Random.GetRandom16() & 7) == 0)
                    {
                        manager.Events.Emit(Messages.HEAVY_TRAFFIC, new JsonObject { ["showable"] = true, ["x"] = x + 1, ["y"] = y + 1 });
                        sprite.SoundCount = 200;
                    }
                }
            }

            long frame = sprite.Frame;

            if ((manager.SpriteCycle & 3) == 0)
            {
                int dir = manager.GetDir(sprite.X, sprite.Y, sprite.DestX, sprite.DestY);
                frame = SpriteManager.TurnTo(frame, dir);
                sprite.Frame = frame;
            }

            sprite.X += DeltaX[frame];
            sprite.Y += DeltaY[frame];
        }
    }
}
