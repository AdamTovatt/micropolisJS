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
    /// The ship's start and move, as <c>src/boatSprite.js</c> brings the original's doShipSprite.
    /// </summary>
    internal static class ShipSprite
    {
        private static readonly int[] TileDeltaX = [0, 0, 1, 1, 1, 0, -1, -1, -1];
        private static readonly int[] TileDeltaY = [0, -1, -1, 0, 1, 1, 1, 0, -1];
        private static readonly long[] DeltaX = [0, 0, 2, 2, 2, 0, -2, -2, -2];
        private static readonly long[] DeltaY = [0, -2, -2, 0, 2, 2, 2, 0, -2];

        // The tiles a ship may be on without wrecking
        private static readonly int[] Waters =
        [
            TileValues.RIVER, TileValues.CHANNEL, TileValues.POWERBASE, TileValues.POWERBASE + 1, TileValues.RAILBASE,
            TileValues.RAILBASE + 1, TileValues.BRWH, TileValues.BRWV,
        ];

        private const long CantMove = 10;

        // A new ship faces away from the edge it starts by, and looks for a way on at its first move
        public static void Init(SpriteManager manager, Sprite sprite)
        {
            GameMap map = manager.Map;

            if (sprite.X < SpriteUtils.WorldToPix(4))
            {
                sprite.Frame = 3;
            }
            else if (sprite.X >= SpriteUtils.WorldToPix(map.Width - 4))
            {
                sprite.Frame = 7;
            }
            else if (sprite.Y < SpriteUtils.WorldToPix(4))
            {
                sprite.Frame = 5;
            }
            else if (sprite.Y >= SpriteUtils.WorldToPix(map.Height - 4))
            {
                sprite.Frame = 1;
            }
            else
            {
                sprite.Frame = 3;
            }

            sprite.NewDir = sprite.Frame;
            sprite.Dir = CantMove;
            sprite.Count = 1;
        }

        public static void Move(SpriteManager manager, Sprite sprite, BlockMaps blockMaps)
        {
            GameMap map = manager.Map;
            int tile = TileValues.RIVER;

            if (sprite.SoundCount > 0)
            {
                sprite.SoundCount--;
            }

            if (sprite.SoundCount == 0)
            {
                // The draw decides whether the ship sounds its horn
                manager.Random.GetRandom16();
                sprite.SoundCount = 200;
            }

            if (sprite.Count > 0)
            {
                sprite.Count--;
            }

            if (sprite.Count == 0)
            {
                // Ships turn slowly: only 45° every 9 passes
                sprite.Count = 9;

                if (sprite.Frame != sprite.NewDir)
                {
                    sprite.Frame = SpriteUtils.TurnTo(sprite.Frame, sprite.NewDir);
                    return;
                }

                // A new direction, searched from a random one
                int startDir = manager.Random.GetRandom16() & 7;
                int dir;

                for (dir = startDir; dir < startDir + 8; dir++)
                {
                    int frame = (dir & 7) + 1;

                    if (frame == sprite.Dir)
                    {
                        continue;
                    }

                    int x = (int)SpriteUtils.PixToWorld(sprite.X + 47) + TileDeltaX[frame];
                    int y = (int)SpriteUtils.PixToWorld(sprite.Y) + TileDeltaY[frame];

                    if (map.TestBounds(x, y))
                    {
                        tile = map.GetTileValue(x, y);

                        if (tile == TileValues.CHANNEL || tile == TileValues.BRWH || tile == TileValues.BRWV ||
                            OppositeAndUnderwater(tile, sprite.Dir, frame))
                        {
                            sprite.NewDir = frame;
                            sprite.Frame = SpriteUtils.TurnTo(sprite.Frame, sprite.NewDir);
                            sprite.Dir = frame + 4;

                            if (sprite.Dir > 8)
                            {
                                sprite.Dir -= 8;
                            }

                            break;
                        }
                    }
                }

                if (dir == startDir + 8)
                {
                    sprite.Dir = CantMove;
                    sprite.NewDir = (manager.Random.GetRandom16() & 7) + 1;
                }
            }
            else if (sprite.Frame == sprite.NewDir)
            {
                sprite.X += DeltaX[sprite.Frame];
                sprite.Y += DeltaY[sprite.Frame];
            }

            if (manager.SpriteNotInBounds(sprite))
            {
                sprite.Frame = 0;
                return;
            }

            // On the last tile it looked at, unless that is water, it wrecks
            if (!Waters.Contains(tile))
            {
                manager.ExplodeSprite(sprite);
                SpriteUtils.DestroyMapTile(manager, map, blockMaps, sprite.X + 48, sprite.Y);
            }
        }

        // Whether newDir is opposite oldDir, and the tile is underwater rail or wire
        private static bool OppositeAndUnderwater(int tileValue, long oldDir, long newDir)
        {
            long opposite = oldDir + 4;

            if (opposite > 8)
            {
                opposite -= 8;
            }

            if (newDir != opposite)
            {
                return false;
            }

            return tileValue == TileValues.POWERBASE || tileValue == TileValues.POWERBASE + 1 ||
                   tileValue == TileValues.RAILBASE || tileValue == TileValues.RAILBASE + 1;
        }
    }
}
