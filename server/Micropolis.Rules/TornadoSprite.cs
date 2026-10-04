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
    /// The tornado's start and move, as <c>src/tornadoSprite.js</c> brings the original's doTornadoSprite.
    /// </summary>
    internal static class TornadoSprite
    {
        private static readonly long[] DeltaX = [2, 3, 2, 0, -2, -3];
        private static readonly long[] DeltaY = [-2, 0, 2, 3, 2, 0];

        // A new tornado blows for 200 passes
        public static void Init(Sprite sprite)
        {
            sprite.Frame = 1;
            sprite.Count = 200;
        }

        public static void Move(SpriteManager manager, Sprite sprite, BlockMaps blockMaps)
        {
            long frame = sprite.Frame;

            // The middle frame sways right or left, as the flag says; the first frame sets the flag
            if (frame == 2)
            {
                frame = sprite.Flag != 0 ? 3 : 1;
            }
            else
            {
                sprite.Flag = frame == 1 ? 1 : 0;
                frame = 2;
            }

            if (sprite.Count > 0)
            {
                sprite.Count--;
            }

            sprite.Frame = frame;

            manager.ExplodeVulnerableSprites(sprite);

            int step = manager.Random.GetRandom(5);
            sprite.X += DeltaX[step];
            sprite.Y += DeltaY[step];

            if (manager.SpriteNotInBounds(sprite))
            {
                sprite.Frame = 0;
            }

            if (sprite.Count != 0 && manager.Random.GetRandom(500) == 0)
            {
                sprite.Frame = 0;
            }

            SpriteUtils.DestroyMapTile(manager, manager.Map, blockMaps, sprite.X + 48, sprite.Y + 40);
        }
    }
}
