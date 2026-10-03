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
    /// One of the eight compass directions, as the original's <c>Direction2</c>, and the step it makes on the map. The
    /// directions run clockwise from north, and the random choices draw an index into that order, so the order is
    /// part of the game rules.
    /// </summary>
    public sealed class Direction
    {
        public static readonly Direction North = new Direction("NORTH", 0, 0, -1);
        public static readonly Direction NorthEast = new Direction("NORTHEAST", 1, 1, -1);
        public static readonly Direction East = new Direction("EAST", 2, 1, 0);
        public static readonly Direction SouthEast = new Direction("SOUTHEAST", 3, 1, 1);
        public static readonly Direction South = new Direction("SOUTH", 4, 0, 1);
        public static readonly Direction SouthWest = new Direction("SOUTHWEST", 5, -1, 1);
        public static readonly Direction West = new Direction("WEST", 6, -1, 0);
        public static readonly Direction NorthWest = new Direction("NORTHWEST", 7, -1, -1);

        private static readonly Direction[] AllDirections = [North, NorthEast, East, SouthEast, South, SouthWest, West, NorthWest];

        private static readonly Direction[] CardinalDirections = [North, East, South, West];

        private readonly string _name;
        private readonly int _index;

        private Direction(string name, int index, int xDelta, int yDelta)
        {
            _name = name;
            _index = index;
            XDelta = xDelta;
            YDelta = yDelta;
        }

        /// <summary>
        /// The change in x of one step this way: east is positive.
        /// </summary>
        public int XDelta { get; }

        /// <summary>
        /// The change in y of one step this way: south is positive.
        /// </summary>
        public int YDelta { get; }

        public Direction OppositeDirection()
        {
            return Transform(4);
        }

        public Direction RotateClockwise()
        {
            return Transform(1);
        }

        public Direction RotateCounterClockwise()
        {
            return Transform(AllDirections.Length - 1);
        }

        public override string ToString()
        {
            return _name;
        }

        public static Direction GetRandomCardinalDirection(RandomStream random)
        {
            return GetRandomDirectionFrom(CardinalDirections, random);
        }

        public static Direction GetRandomDirection(RandomStream random)
        {
            return GetRandomDirectionFrom(AllDirections, random);
        }

        private Direction Transform(int delta)
        {
            return AllDirections[(_index + delta) % AllDirections.Length];
        }

        private static Direction GetRandomDirectionFrom(Direction[] directions, RandomStream random)
        {
            int maxIndex = directions.Length - 1;
            int index = random.GetRandom(maxIndex);
            return directions[index];
        }
    }
}
