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
    /// The train's move, as <c>src/trainSprite.js</c> brings the original's doTrainSprite.
    /// </summary>
    internal static class TrainSprite
    {
        private static readonly long[] TileDeltaX = [0, 16, 0, -16];
        private static readonly long[] TileDeltaY = [-16, 0, 16, 0];
        private static readonly long[] DeltaX = [0, 4, 0, -4, 0];
        private static readonly long[] DeltaY = [-4, 0, 4, 0, 0];

        // The frame for each direction of travel: north, east, south, west, and none
        private static readonly long[] Pic2 = [1, 2, 1, 2, 5];

        private const long CantMove = 4;

        // Over 4 passes a train moves through a tile, so every fourth it looks for track to go on, from a random
        // direction but not back where it came from. Finding none, it may go back next time; finding none twice, it dies.
        public static void Move(SpriteManager manager, Sprite sprite)
        {
            if (sprite.Frame == 3 || sprite.Frame == 4)
            {
                sprite.Frame = Pic2[sprite.Dir];
            }

            sprite.X += DeltaX[sprite.Dir];
            sprite.Y += DeltaY[sprite.Dir];

            if ((manager.SpriteCycle & 3) != 0)
            {
                return;
            }

            int dir = manager.Random.GetRandom16() & 3;

            for (int i = dir; i < dir + 4; i++)
            {
                int dir2 = i & 3;

                if (sprite.Dir != CantMove && dir2 == ((sprite.Dir + 2) & 3))
                {
                    continue;
                }

                int tileValue = manager.GetChar(sprite.X + TileDeltaX[dir2] + 48, sprite.Y + TileDeltaY[dir2]);

                if ((tileValue >= TileValues.RAILBASE && tileValue <= TileValues.LASTRAIL) ||
                    tileValue == TileValues.RAILVPOWERH || tileValue == TileValues.RAILHPOWERV)
                {
                    if (sprite.Dir != dir2 && sprite.Dir != CantMove)
                    {
                        // A turn between north and west, or between east and south, shows one diagonal, the others the other
                        sprite.Frame = sprite.Dir + dir2 == 3 ? 3 : 4;
                    }
                    else
                    {
                        sprite.Frame = Pic2[dir2];
                    }

                    if (tileValue == TileValues.HRAIL || tileValue == TileValues.VRAIL)
                    {
                        sprite.Frame = 5;
                    }

                    sprite.Dir = dir2;
                    return;
                }
            }

            if (sprite.Dir == CantMove)
            {
                sprite.Frame = 0;
                return;
            }

            sprite.Dir = CantMove;
        }
    }
}
