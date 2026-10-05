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
    /// The helicopter's start and move, after the original's doCopterSprite in sprite.cpp.
    /// </summary>
    internal static class CopterSprite
    {
        private static readonly long[] DeltaX = [0, 0, 3, 5, 3, 0, -3, -5, -3];
        private static readonly long[] DeltaY = [0, -5, -3, 0, 3, 5, 3, 0, -3];

        // A new helicopter heads for a random pixel of the map, and will come home to just west of where it started
        public static void Init(SpriteManager manager, Sprite sprite)
        {
            sprite.Frame = 5;
            sprite.Count = 1500;
            sprite.DestX = manager.Random.GetRandom((int)SpriteUtils.WorldToPix(manager.Map.Width) - 1);
            sprite.DestY = manager.Random.GetRandom((int)SpriteUtils.WorldToPix(manager.Map.Height) - 1);
            sprite.OrigX = sprite.X - 30;
            sprite.OrigY = sprite.Y;
        }

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
                long x = SpriteUtils.TruncatingPixToWorld(sprite.X + 48);
                long y = SpriteUtils.TruncatingPixToWorld(sprite.Y);

                if (x >= 0 && x < manager.Map.Width && y >= 0 && y < manager.Map.Height)
                {
                    if (blockMaps.TrafficDensityMap.WorldGet((int)x, (int)y) > 170 && (manager.Random.GetRandom16() & 7) == 0)
                    {
                        manager.Events.Emit(RulesEvents.HeavyTraffic, NewsPlaces.Showable(x + 1, y + 1));
                        sprite.SoundCount = 200;
                    }
                }
            }

            long frame = sprite.Frame;

            if ((manager.SpriteCycle & 3) == 0)
            {
                int dir = manager.GetDir(sprite.X, sprite.Y, sprite.DestX, sprite.DestY);
                frame = SpriteUtils.TurnTo(frame, dir);
                sprite.Frame = frame;
            }

            sprite.X += DeltaX[frame];
            sprite.Y += DeltaY[frame];
        }
    }
}
