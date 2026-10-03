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
    /// The explosion's move, as <c>src/explosionSprite.js</c> brings the original's doExplosionSprite.
    /// </summary>
    internal static class ExplosionSprite
    {
        public static void Move(SpriteManager manager, Sprite sprite)
        {
            if ((manager.SpriteCycle & 1) == 0)
            {
                sprite.Frame++;
            }

            // Burnt out: fire under the hot spot, and on the four tiles diagonally around it
            if (sprite.Frame > 6)
            {
                sprite.Frame = 0;

                manager.StartFire(sprite.X + 48 - 8, sprite.Y + 16);
                manager.StartFire(sprite.X + 48 - 24, sprite.Y);
                manager.StartFire(sprite.X + 48 + 8, sprite.Y);
                manager.StartFire(sprite.X + 48 - 24, sprite.Y + 32);
                manager.StartFire(sprite.X + 48 + 8, sprite.Y + 32);
            }
        }
    }
}
