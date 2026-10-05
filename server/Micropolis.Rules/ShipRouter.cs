/* micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
 * Copyright (C) 2026 Adam Tovatt
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
    /// Breadth-first searches over the tiles a ship's route may cross (<see cref="Waterways.IsNavigable"/>), a step to
    /// each of the eight tiles around, a diagonal step only between two such tiles. Every search visits the tiles in
    /// one fixed order, its sources' and then the frames' from north clockwise, so ties always break the same way.
    /// </summary>
    /// <remarks>
    /// It holds no state between searches: its buffers are scratch, which each search starts afresh. A move is a
    /// sprite frame, 1 for north to 8 for north-west.
    /// </remarks>
    internal sealed class ShipRouter
    {
        /// <summary>
        /// The step across of each frame, 0 for none.
        /// </summary>
        public static readonly int[] FrameDeltaX = [0, 0, 1, 1, 1, 0, -1, -1, -1];

        /// <summary>
        /// The step down of each frame, 0 for none.
        /// </summary>
        public static readonly int[] FrameDeltaY = [0, -1, -1, 0, 1, 1, 1, 0, -1];

        private readonly GameMap _map;

        // The distance of each tile, by index x + y * width, valid where its mark is the search's
        private readonly int[] _distance;
        private readonly int[] _mark;
        private readonly int[] _queue;
        private int _search;

        // A tile counted as navigable whatever it holds: the one the ship is on
        private int _exempt = -1;

        public ShipRouter(GameMap map)
        {
            _map = map;
            _distance = new int[map.Width * map.Height];
            _mark = new int[map.Width * map.Height];
            _queue = new int[map.Width * map.Height];
        }

        /// <summary>
        /// The goal nearest the sources by path length, the first a search from them reaches, or <see langword="null"/>
        /// when none is reachable. A source that is a goal is the nearest.
        /// </summary>
        public Position? Nearest(IEnumerable<Position> sources, Func<int, int, bool> isGoal)
        {
            int head = 0;
            int tail = 0;
            Start(-1);

            foreach (Position source in sources)
            {
                if (Label(source.X, source.Y, 0, ref tail) && isGoal(source.X, source.Y))
                {
                    return source;
                }
            }

            while (head < tail)
            {
                int index = _queue[head++];
                int x = index % _map.Width;
                int y = index / _map.Width;

                for (int frame = 1; frame <= 8; frame++)
                {
                    int nextX = x + FrameDeltaX[frame];
                    int nextY = y + FrameDeltaY[frame];

                    if (CanMove(x, y, frame) && Label(nextX, nextY, _distance[index] + 1, ref tail) && isGoal(nextX, nextY))
                    {
                        return new Position(nextX, nextY);
                    }
                }
            }

            return null;
        }

        /// <summary>
        /// The path length to the ship's tile from the nearest of the goals, the search stopping once it reaches the
        /// ship, or -1 when none is reachable. The ship's own tile counts as navigable, whatever it holds. It leaves the
        /// distances <see cref="NextMove"/> reads.
        /// </summary>
        public int DistanceToNearest(IEnumerable<Position> goals, Position ship)
        {
            if (!_map.IsPositionInBounds(ship))
            {
                return -1;
            }

            int head = 0;
            int tail = 0;
            int shipIndex = ship.X + ship.Y * _map.Width;
            Start(shipIndex);

            foreach (Position goal in goals)
            {
                Label(goal.X, goal.Y, 0, ref tail);
            }

            if (IsLabelled(shipIndex))
            {
                return _distance[shipIndex];
            }

            while (head < tail)
            {
                int index = _queue[head++];
                int x = index % _map.Width;
                int y = index / _map.Width;

                for (int frame = 1; frame <= 8; frame++)
                {
                    if (CanMove(x, y, frame))
                    {
                        Label(x + FrameDeltaX[frame], y + FrameDeltaY[frame], _distance[index] + 1, ref tail);
                    }
                }

                if (IsLabelled(shipIndex))
                {
                    return _distance[shipIndex];
                }
            }

            return -1;
        }

        /// <summary>
        /// The ship's next move toward the goals of the last <see cref="DistanceToNearest"/>, which found it a positive
        /// distance away: one to a tile a step nearer, the preferred frame's if it is one, so a ship keeps its heading,
        /// and otherwise the first from north clockwise.
        /// </summary>
        public int NextMove(Position ship, long preferredFrame)
        {
            int shipIndex = ship.X + ship.Y * _map.Width;
            int nearer = _distance[shipIndex] - 1;

            if (preferredFrame is >= 1 and <= 8 && IsStepNearer(ship, (int)preferredFrame, nearer))
            {
                return (int)preferredFrame;
            }

            for (int frame = 1; frame <= 8; frame++)
            {
                if (IsStepNearer(ship, frame, nearer))
                {
                    return frame;
                }
            }

            throw new InvalidOperationException($"No move from {ship} reaches a tile at distance {nearer}.");
        }

        private bool IsStepNearer(Position ship, int frame, int nearer)
        {
            int x = ship.X + FrameDeltaX[frame];
            int y = ship.Y + FrameDeltaY[frame];

            return CanMove(ship.X, ship.Y, frame) && IsLabelled(x + y * _map.Width) && _distance[x + y * _map.Width] == nearer;
        }

        // Whether a ship may step from (x, y) by the frame: onto a navigable tile, and diagonally only between two
        private bool CanMove(int x, int y, int frame)
        {
            int dx = FrameDeltaX[frame];
            int dy = FrameDeltaY[frame];

            if (!IsNavigable(x + dx, y + dy))
            {
                return false;
            }

            return dx == 0 || dy == 0 || (IsNavigable(x + dx, y) && IsNavigable(x, y + dy));
        }

        private bool IsNavigable(int x, int y)
        {
            return _map.TestBounds(x, y) && (x + y * _map.Width == _exempt || Waterways.IsNavigable(_map, x, y));
        }

        // A new search, every tile unlabelled
        private void Start(int exempt)
        {
            if (_search == int.MaxValue)
            {
                Array.Clear(_mark);
                _search = 0;
            }

            _search++;
            _exempt = exempt;
        }

        private bool IsLabelled(int index)
        {
            return index >= 0 && index < _mark.Length && _mark[index] == _search;
        }

        // Labels and queues a tile of the map not yet labelled, and says whether it did
        private bool Label(int x, int y, int distance, ref int tail)
        {
            if (!_map.TestBounds(x, y))
            {
                return false;
            }

            int index = x + y * _map.Width;

            if (_mark[index] == _search)
            {
                return false;
            }

            _mark[index] = _search;
            _distance[index] = distance;
            _queue[tail++] = index;
            return true;
        }
    }
}
