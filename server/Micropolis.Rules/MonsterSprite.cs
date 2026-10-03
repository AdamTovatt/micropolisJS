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
    /// The monster's move, as <c>src/monsterSprite.js</c> brings the original's doMonsterSprite.
    /// </summary>
    internal static class MonsterSprite
    {
        private static readonly long[] DeltaX = [2, 2, -2, -2, 0];
        private static readonly long[] DeltaY = [-2, 2, 2, -2, 0];
        private static readonly long[] Cardinals1 = [0, 1, 2, 3];
        private static readonly long[] Cardinals2 = [1, 2, 3, 0];
        private static readonly long[] Diagonals1 = [2, 5, 8, 11];
        private static readonly long[] Diagonals2 = [11, 2, 5, 8];

        // Frames 1 to 12 are the diagonals, three for each direction, and 13 to 16 the cardinal directions
        public static void Move(SpriteManager manager, Sprite sprite, BlockMaps blockMaps)
        {
            RandomStream random = manager.Random;

            if (sprite.SoundCount > 0)
            {
                sprite.SoundCount--;
            }

            long currentDir = (sprite.Frame - 1) / 3;
            long frame;

            if (currentDir < 4)
            {
                // Walking a diagonal: the next of its three steps
                frame = (sprite.Frame - 1) % 3;

                if (frame == 2)
                {
                    sprite.Step = 0;
                }

                if (frame == 0)
                {
                    sprite.Step = 1;
                }

                frame += sprite.Step != 0 ? 1 : -1;

                manager.GetDir(sprite.X, sprite.Y, sprite.DestX, sprite.DestY);

                if (manager.AbsDist < 60)
                {
                    if (sprite.Flag == 0)
                    {
                        sprite.Flag = 1;
                        sprite.DestX = sprite.OrigX;
                        sprite.DestY = sprite.OrigY;
                    }
                    else
                    {
                        sprite.Frame = 0;
                        return;
                    }
                }

                // Perhaps switch to a cardinal direction
                long dir = (manager.GetDir(sprite.X, sprite.Y, sprite.DestX, sprite.DestY) - 1) / 2;

                if (dir != currentDir && random.GetRandom(10) == 0)
                {
                    frame = (random.GetRandom16() & 1) != 0 ? Cardinals1[currentDir] : Cardinals2[currentDir];
                    currentDir = 4;

                    if (sprite.SoundCount == 0)
                    {
                        sprite.SoundCount = 50 + random.GetRandom(100);
                    }
                }
            }
            else
            {
                // Walking a cardinal direction: perhaps switch to a diagonal
                currentDir = 4;
                frame = (sprite.Frame - 13) & 3;

                if ((random.GetRandom16() & 3) == 0)
                {
                    frame = (random.GetRandom16() & 1) != 0 ? Diagonals1[frame] : Diagonals2[frame];

                    currentDir = (frame - 1) / 3;
                    frame = (frame - 1) % 3;
                }
            }

            frame = currentDir * 3 + frame + 1;
            if (frame > 16)
            {
                frame = 16;
            }

            sprite.Frame = frame;

            sprite.X += DeltaX[currentDir];
            sprite.Y += DeltaY[currentDir];

            if (sprite.Count > 0)
            {
                sprite.Count--;
            }

            // Off the map, or back in the river before its time is up, it dies
            int tileValue = manager.GetChar(sprite.X + sprite.XHot, sprite.Y + sprite.YHot);

            if (tileValue == -1 || (tileValue == TileValues.RIVER && sprite.Count != 0))
            {
                sprite.Frame = 0;
            }

            manager.ExplodeVulnerableSprites(sprite);
            manager.DestroyMapTile(blockMaps, sprite.X + 48, sprite.Y + 16);
        }
    }
}
