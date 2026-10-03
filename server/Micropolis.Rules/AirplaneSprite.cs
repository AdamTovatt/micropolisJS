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
    /// The plane's move, as <c>src/airplaneSprite.js</c> brings the original's doAirplaneSprite.
    /// </summary>
    internal static class AirplaneSprite
    {
        private static readonly long[] DeltaX = [0, 0, 6, 8, 6, 0, -6, -8, -6, 8, 8, 8];
        private static readonly long[] DeltaY = [0, -8, -6, 0, 6, 8, 6, 0, -6, 0, 0, 0];

        public static void Move(SpriteManager manager, Sprite sprite, bool disastersEnabled)
        {
            long frame = sprite.Frame;

            if (manager.SpriteCycle % 5 == 0)
            {
                // Frames past 8 are a plane taking off, always to the east
                if (frame > 8)
                {
                    frame--;
                    if (frame < 9)
                    {
                        frame = 3;
                    }

                    sprite.Frame = frame;
                }
                else
                {
                    int dir = manager.GetDir(sprite.X, sprite.Y, sprite.DestX, sprite.DestY);
                    frame = SpriteManager.TurnTo(frame, dir);
                    sprite.Frame = frame;
                }
            }

            // The distance getDir last found, which is the plane's own only on a step that turned it
            if (manager.AbsDist < 50)
            {
                // At the destination: pick another, anywhere up to 50 pixels off the map
                sprite.DestX = manager.Random.GetRandom((int)SpriteManager.WorldToPix(manager.Map.Width) + 100) - 50;
                sprite.DestY = manager.Random.GetRandom((int)SpriteManager.WorldToPix(manager.Map.Height) + 100) - 50;
            }

            if (disastersEnabled)
            {
                bool explode = false;

                foreach (Sprite s in manager.SpriteList.ToList())
                {
                    if (s.Frame == 0 || s == sprite)
                    {
                        continue;
                    }

                    if ((s.Type == SpriteType.Helicopter || s.Type == SpriteType.Airplane) &&
                        SpriteManager.CheckSpriteCollision(sprite, s))
                    {
                        manager.ExplodeSprite(s);
                        explode = true;
                    }
                }

                if (explode)
                {
                    manager.ExplodeSprite(sprite);
                }
            }

            sprite.X += DeltaX[frame];
            sprite.Y += DeltaY[frame];

            if (manager.SpriteNotInBounds(sprite))
            {
                sprite.Frame = 0;
            }
        }
    }
}
