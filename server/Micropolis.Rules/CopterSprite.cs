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
    /// The helicopter, which takes off from an airport, flies straight to the densest traffic, reports it, and flies
    /// straight back to land where it took off. A rule change from the original's doCopterSprite in sprite.cpp, whose
    /// helicopter heads for a random point, reports heavy traffic it happens to fly over, and after 1500 steps chases
    /// a monster or a tornado, or flies home.
    /// </summary>
    internal static class CopterSprite
    {
        /// <summary>
        /// The traffic density a block's has to pass for the helicopter to report it as heavy.
        /// </summary>
        public const int HeavyTraffic = 170;

        // The pixels, across and down, from a place within which a helicopter has reached it: the original's distance
        // for landing home
        private const long ArrivalDistance = 30;

        private static readonly long[] DeltaX = [0, 0, 3, 5, 3, 0, -3, -5, -3];
        private static readonly long[] DeltaY = [0, -5, -3, 0, 3, 5, 3, 0, -3];

        // A new helicopter faces south, and lands back where it took off. Its flight is its maker's to give, as the traffic
        // it takes off for (SpriteManager.GenerateCopter).
        public static void Init(Sprite sprite)
        {
            sprite.Frame = 5;
            sprite.OrigX = sprite.X;
            sprite.OrigY = sprite.Y;
        }

        /// <summary>
        /// The top-left tile of the block whose traffic density is highest, the first row by row of those that share
        /// it, or <see langword="null"/> while no block's passes <see cref="HeavyTraffic"/>.
        /// </summary>
        public static Position? DensestTraffic(BlockMap trafficDensity)
        {
            Position? densest = null;
            int highest = HeavyTraffic;

            for (int y = 0; y < trafficDensity.Height; y++)
            {
                for (int x = 0; x < trafficDensity.Width; x++)
                {
                    if (trafficDensity.Get(x, y) > highest)
                    {
                        highest = trafficDensity.Get(x, y);
                        densest = new Position(x * trafficDensity.BlockSize, y * trafficDensity.BlockSize);
                    }
                }
            }

            return densest;
        }

        public static void Move(SpriteManager manager, Sprite sprite, BlockMaps blockMaps)
        {
            (long destX, long destY) = Destination(sprite, blockMaps.TrafficDensityMap.BlockSize);
            if (SpriteManager.Distance(sprite.X, sprite.Y, destX, destY) < ArrivalDistance)
            {
                if (sprite.CopterFlight!.Block is not Position block)
                {
                    // Back where it took off, whether or not its airport stands: it lands
                    sprite.Frame = 0;
                    return;
                }

                // Over the traffic: it reports it once, if it is still heavy, and turns for home
                if (blockMaps.TrafficDensityMap.WorldGet(block.X, block.Y) > HeavyTraffic)
                {
                    manager.Events.Emit(RulesEvents.HeavyTraffic, NewsPlaces.Showable(block.X, block.Y));
                }

                sprite.CopterFlight = CopterFlight.Returning;
                (destX, destY) = (sprite.OrigX, sprite.OrigY);
            }

            long frame = sprite.Frame;

            if ((manager.SpriteCycle & 3) == 0)
            {
                int dir = SpriteManager.GetDir(sprite.X, sprite.Y, destX, destY);
                frame = SpriteUtils.TurnTo(frame, dir);
                sprite.Frame = frame;
            }

            sprite.X += DeltaX[frame];
            sprite.Y += DeltaY[frame];
        }

        // The position the helicopter flies to: the one that puts its hot spot over the middle of the block of traffic
        // it flies to, or where it took off
        private static (long X, long Y) Destination(Sprite sprite, int blockSize)
        {
            if (sprite.CopterFlight!.Block is Position block)
            {
                long middle = SpriteUtils.WorldToPix(blockSize) / 2;
                return (SpriteUtils.WorldToPix(block.X) + middle - sprite.XHot, SpriteUtils.WorldToPix(block.Y) + middle - sprite.YHot);
            }

            return (sprite.OrigX, sprite.OrigY);
        }
    }
}
