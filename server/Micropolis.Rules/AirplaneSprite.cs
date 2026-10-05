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
    /// The plane, which departs from an airport and flies straight off the map, or enters at the map's edge and flies
    /// straight along an airport's runway row to land there. A rule change from the original's doAirplaneSprite in
    /// sprite.cpp, whose plane takes off as a departing one does here and then wanders, picking a new random point
    /// each time it reaches one, until it happens to leave the map.
    /// </summary>
    internal static class AirplaneSprite
    {
        private static readonly long[] DeltaX = [0, 0, 6, 8, 6, 0, -6, -8, -6, 8, 8, 8];
        private static readonly long[] DeltaY = [0, -8, -6, 0, 6, 8, 6, 0, -6, 0, 0, 0];

        // The frames of a plane flying east and west
        private const long East = 3;
        private const long West = 7;

        // The first of the frames of a plane taking off east, which counts down through them to East
        private const long TakeOff = 11;

        // The pixels west of its place a plane taking off west starts its roll
        private const long WestRollShift = 148;

        /// <summary>
        /// The pixel x where a plane from the airport centred in column x starts its take-off roll east, as the original
        /// places a new plane.
        /// </summary>
        public static long PixelX(int x)
        {
            return SpriteUtils.WorldToPix(x) + 48;
        }

        /// <summary>
        /// The pixel y of a plane on the runway row of the airport centred in row y.
        /// </summary>
        public static long PixelY(int y)
        {
            return SpriteUtils.WorldToPix(y) + 12;
        }

        // A new plane departs east through the take-off frames, or, where a roll east would start within 20 tiles of the
        // map's east edge, west, from a roll that starts further west, with no take-off frames
        public static void Init(SpriteManager manager, Sprite sprite)
        {
            sprite.PlaneFlight = PlaneFlight.Departing;

            if (TakesOffWest(manager.Map, sprite.X))
            {
                sprite.X -= WestRollShift;
                sprite.Frame = West;
            }
            else
            {
                sprite.Frame = TakeOff;
            }
        }

        /// <summary>
        /// Turns the plane into one arriving at the airport: it enters at the map's edge on the runway's row, on the side
        /// that has it land heading the way a departure from that airport takes off, its hot spot on the edge's pixel.
        /// </summary>
        public static void Arrive(SpriteManager manager, Sprite sprite, Position airport)
        {
            sprite.PlaneFlight = PlaneFlight.Arriving(airport);
            sprite.Y = PixelY(airport.Y);

            if (TakesOffWest(manager.Map, PixelX(airport.X)))
            {
                sprite.X = SpriteUtils.WorldToPix(manager.Map.Width) - 1 - sprite.XHot;
                sprite.Frame = West;
            }
            else
            {
                sprite.X = -sprite.XHot;
                sprite.Frame = East;
            }
        }

        public static void Move(SpriteManager manager, Sprite sprite, bool disastersEnabled)
        {
            if (sprite.PlaneFlight!.Airport is Position airport && manager.Map.GetTileValue(airport) != TileValues.AIRPORT)
            {
                // Its airport is gone before it landed: it flies on along the row and leaves the map
                sprite.PlaneFlight = PlaneFlight.Departing;
            }

            long frame = sprite.Frame;

            // Frames past 8 are a plane taking off, always to the east; every other plane holds its heading
            if (manager.SpriteCycle % 5 == 0 && frame > 8)
            {
                frame--;
                if (frame < 9)
                {
                    frame = East;
                }

                sprite.Frame = frame;
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
                        SpriteUtils.CheckSpriteCollision(sprite, s))
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

            if (sprite.PlaneFlight.Airport is Position landing && HasLanded(manager.Map, sprite, landing))
            {
                // It disappears on the runway where a departure starts its take-off roll
                sprite.Frame = 0;
            }

            if (manager.SpriteNotInBounds(sprite))
            {
                sprite.Frame = 0;
            }
        }

        // Whether a plane whose roll east would start at the pixel x takes off west instead: where that pixel is within
        // 20 tiles of the map's east edge
        private static bool TakesOffWest(GameMap map, long x)
        {
            return x > SpriteUtils.WorldToPix(map.Width - 20);
        }

        // Whether an arriving plane has reached or passed the point on the runway where a departure from its airport
        // starts its take-off roll
        private static bool HasLanded(GameMap map, Sprite sprite, Position airport)
        {
            long rollX = PixelX(airport.X);

            if (TakesOffWest(map, rollX))
            {
                return sprite.X <= rollX - WestRollShift;
            }

            return sprite.X >= rollX;
        }
    }
}
