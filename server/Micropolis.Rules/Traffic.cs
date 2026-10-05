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
    /// What a zone's drive came to, as the original's <c>makeTraffic</c> in traffic.cpp numbers it.
    /// </summary>
    public enum TrafficResult
    {
        NoRoadFound = -1,
        NoRouteFound = 0,
        RouteFound = 1,
    }

    /// <summary>
    /// The tiles a drive ends beside, from the lowest tile value to the highest, as driveDone in the original has them:
    /// not the kind of zone each is named for. No drive ends beside an empty residential zone, whose tiles lie below
    /// <see cref="TileValues.LHTHR"/>.
    /// </summary>
    public sealed record TrafficDestination(int Low, int High)
    {
        /// <summary>
        /// Commercial, industry, the seaport, the airport, the coal plant, the fire and police stations, the stadium,
        /// and the nuclear plant up to its centre tile: a residential zone's drive.
        /// </summary>
        public static readonly TrafficDestination Commercial = new TrafficDestination(TileValues.COMBASE, TileValues.NUCLEAR);

        /// <summary>
        /// A house, a built residential zone, a hospital, a church, commercial, industry, and the seaport up to its
        /// centre tile: a commercial zone's drive.
        /// </summary>
        public static readonly TrafficDestination Industrial = new TrafficDestination(TileValues.LHTHR, TileValues.PORT);

        /// <summary>
        /// A house, a built residential zone, a hospital, a church, and commercial's first tile: an industrial zone's
        /// drive.
        /// </summary>
        public static readonly TrafficDestination Residential = new TrafficDestination(TileValues.LHTHR, TileValues.COMBASE);

        public bool Contains(int tileValue)
        {
            return tileValue >= Low && tileValue <= High;
        }
    }

    /// <summary>
    /// The traffic a zone generates, as the original's traffic.cpp drives it from the zone to a destination along the
    /// roads.
    /// </summary>
    public sealed class Traffic
    {
        // The perimeter of a 3×3 zone, relative to its centre, clockwise from the north-west corner's north
        private static readonly int[] PerimX = [-1, 0, 1, 2, 2, 2, 1, 0, -1, -2, -2, -2];
        private static readonly int[] PerimY = [-2, -2, -2, -1, 0, 1, 2, 2, 2, 1, 0, -1];

        private const int MaxTrafficDistance = 30;

        // The heaviest traffic a block holds, and the traffic one arriving drive adds to each block it passes
        internal const int MaxTrafficDensity = 240;
        internal const int TripTraffic = 50;

        private readonly GameMap _map;
        private readonly SpriteManager _spriteManager;
        private readonly RandomStream _random;
        private readonly Trips _trips;

        // Every other position of the drive, which the traffic density map counts once the drive arrives
        private readonly List<Position> _stack = new List<Position>();

        // Every position of the drive, in order, from the road it started on: the trip it is, once it arrives
        private readonly List<Position> _route = new List<Position>();

        /// <param name="trips">Takes the route of each drive that arrives, which nothing in the rules reads.</param>
        public Traffic(GameMap map, SpriteManager spriteManager, RandomStream random, Trips trips)
        {
            _map = map;
            _spriteManager = spriteManager;
            _random = random;
            _trips = trips;
        }

        /// <summary>
        /// Drives from the zone centred at (<paramref name="x"/>, <paramref name="y"/>) to the destination along the
        /// roads, and counts the drive in the traffic density map if it arrives.
        /// </summary>
        public TrafficResult MakeTraffic(int x, int y, BlockMaps blockMaps, TrafficDestination destination)
        {
            _stack.Clear();
            _route.Clear();

            Position? roadPos = FindPerimeterRoad(new Position(x, y));

            if (roadPos is Position start)
            {
                if (TryDrive(start, destination))
                {
                    _trips.Arrived(_route);
                    AddToTrafficDensityMap(blockMaps);
                    return TrafficResult.RouteFound;
                }

                return TrafficResult.NoRouteFound;
            }
            else
            {
                return TrafficResult.NoRoadFound;
            }
        }

        private void AddToTrafficDensityMap(BlockMaps blockMaps)
        {
            BlockMap trafficDensityMap = blockMaps.TrafficDensityMap;

            while (_stack.Count > 0)
            {
                Position pos = _stack[^1];
                _stack.RemoveAt(_stack.Count - 1);

                // Could this happen?!?
                if (!_map.TestBounds(pos.X, pos.Y))
                {
                    continue;
                }

                int tileValue = _map.GetTileValue(pos.X, pos.Y);

                if (tileValue >= TileValues.ROADBASE && tileValue < TileValues.POWERBASE)
                {
                    // Update traffic density.
                    int traffic = trafficDensityMap.WorldGet(pos.X, pos.Y);
                    traffic += TripTraffic;
                    traffic = Math.Min(traffic, MaxTrafficDensity);
                    trafficDensityMap.WorldSet(pos.X, pos.Y, traffic);

                    // Attract traffic copter to the traffic
                    if (traffic >= MaxTrafficDensity && _random.GetRandom(5) == 0)
                    {
                        Sprite? sprite = _spriteManager.GetSprite(SpriteType.Helicopter);
                        if (sprite is not null)
                        {
                            sprite.DestX = SpriteUtils.WorldToPix(pos.X);
                            sprite.DestY = SpriteUtils.WorldToPix(pos.Y);
                        }
                    }
                }
            }
        }

        /// <summary>
        /// A road or rail on the perimeter of the zone centred at <paramref name="position"/>, the first clockwise, or
        /// <see langword="null"/> if there is none.
        /// </summary>
        public Position? FindPerimeterRoad(Position position)
        {
            for (int i = 0; i < 12; i++)
            {
                int xx = position.X + PerimX[i];
                int yy = position.Y + PerimY[i];

                if (_map.TestBounds(xx, yy))
                {
                    if (TileUtils.IsDriveable(_map.GetTileValue(xx, yy)))
                    {
                        return new Position(xx, yy);
                    }
                }
            }

            return null;
        }

        /// <summary>
        /// The tiles on the perimeter of the zone centred at <paramref name="position"/> that are on the map, in the
        /// order <see cref="FindPerimeterRoad"/> searches them for a road.
        /// </summary>
        public static IReadOnlyList<Position> Perimeter(GameMap map, Position position)
        {
            List<Position> perimeter = new List<Position>();

            for (int i = 0; i < PerimX.Length; i++)
            {
                int xx = position.X + PerimX[i];
                int yy = position.Y + PerimY[i];

                if (map.TestBounds(xx, yy))
                {
                    perimeter.Add(new Position(xx, yy));
                }
            }

            return perimeter;
        }

        private bool TryDrive(Position startPos, TrafficDestination destination)
        {
            Direction? dirLast = null;
            Position drivePos = startPos;
            _route.Add(drivePos);

            // Maximum distance to try
            for (int dist = 0; dist < MaxTrafficDistance; dist++)
            {
                Direction? dir = TryGo(drivePos, dirLast);
                if (dir is not null)
                {
                    drivePos = Position.Move(drivePos, dir);
                    dirLast = dir.OppositeDirection();
                    _route.Add(drivePos);

                    if ((dist & 1) != 0)
                    {
                        _stack.Add(drivePos);
                    }

                    if (DriveDone(drivePos, destination))
                    {
                        return true;
                    }
                }
                else
                {
                    // A dead end: back up, forgetting the last position saved, though the drive goes on from here.
                    // It stands where it stood, so the route takes nothing, and with the same ways open it finds the
                    // same dead end until it gives up: a drive that arrives never met one
                    if (_stack.Count > 0)
                    {
                        _stack.RemoveAt(_stack.Count - 1);
                        dist += 3;
                    }
                    else
                    {
                        return false;
                    }
                }
            }

            return false;
        }

        // As tryGo in the original: the four directions clockwise from north, each null where there is no road or it is
        // the way back. With more than one way open, a draw picks one of the four, and a closed one gives way to the
        // next open one clockwise.
        private Direction? TryGo(Position pos, Direction? dirLast)
        {
            IReadOnlyList<Direction> cardinals = Direction.CardinalDirections;
            Direction?[] directions = new Direction?[cardinals.Count];

            // Find connections from current position.
            int count = 0;

            for (int i = 0; i < cardinals.Count; i++)
            {
                Direction dir = cardinals[i];
                if (dir != dirLast && TileUtils.IsDriveable(_map.GetTileFromMapOrDefault(pos, dir, TileValues.DIRT)))
                {
                    directions[i] = dir;
                    count++;
                }
            }

            if (count == 0)
            {
                return null;
            }

            if (count == 1)
            {
                return directions.First(dir => dir is not null);
            }

            int index = _random.GetRandom16() & 3;
            while (directions[index] is null)
            {
                index = (index + 1) & 3;
            }

            return directions[index];
        }

        private bool DriveDone(Position pos, TrafficDestination destination)
        {
            if (pos.Y > 0)
            {
                if (destination.Contains(_map.GetTileValue(pos.X, pos.Y - 1)))
                {
                    return true;
                }
            }

            if (pos.X < (_map.Width - 1))
            {
                if (destination.Contains(_map.GetTileValue(pos.X + 1, pos.Y)))
                {
                    return true;
                }
            }

            if (pos.Y < (_map.Height - 1))
            {
                if (destination.Contains(_map.GetTileValue(pos.X, pos.Y + 1)))
                {
                    return true;
                }
            }

            if (pos.X > 0)
            {
                if (destination.Contains(_map.GetTileValue(pos.X - 1, pos.Y)))
                {
                    return true;
                }
            }

            return false;
        }
    }
}
