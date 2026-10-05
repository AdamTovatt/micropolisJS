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
    /// Routes a zone's trip to a destination of the kind it needs, over road and rail, in place of the original's random
    /// drive. One search runs from every driveable tile of the zone's perimeter at once, costing each tile it enters,
    /// and finds every destination zone it reaches, at the cheapest of the driveable tiles beside its footprint. One draw
    /// then picks the destination, a nearer one likelier, and the trip takes the route the search found to it.
    /// </summary>
    /// <remarks>
    /// The search settles tiles in order of cost, and keeps only the cheapest route to each tile. A route to a tile gives
    /// way only to a cheaper one, or to one as cheap whose last step comes from a neighbour earlier in north, east,
    /// south, west; a destination's goal is the cheapest tile beside it, and of two as cheap the first row by row; so
    /// ties break the same way every run. A route goes no further than its <see cref="MaxRouteTiles"/>th tile, and
    /// where the cheapest route to a tile ends there, the search goes no further from that tile, though a dearer,
    /// shorter route to it could have: it may miss a destination such a route would reach, and a route it finds is the
    /// cheapest only among those the cut leaves. So it is deterministic, but not exact over every route within the cut.
    /// All its arithmetic is on whole numbers, and it draws from the stream once a trip, to pick. It holds no state
    /// between searches: its buffers are scratch, which each search starts afresh.
    /// </remarks>
    internal sealed class TripRouter
    {
        /// <summary>
        /// The most tiles a route takes, its first included.
        /// </summary>
        public const int MaxRouteTiles = 60;

        /// <summary>
        /// How many times a clear road's straight run between a route's ends the route may cost before it is slow.
        /// </summary>
        public const int SlowFactor = 3;

        /// <summary>
        /// What entering a rail tile costs, which traffic never adds to.
        /// </summary>
        public const int RailCost = 2;

        /// <summary>
        /// What entering a road tile costs on a clear road, to which its block's traffic density adds one for every
        /// <see cref="DensityPerCost"/>.
        /// </summary>
        public const int RoadCost = 4;

        /// <summary>
        /// The traffic density that adds one to the cost of entering a road tile.
        /// </summary>
        public const int DensityPerCost = 16;

        // The step across and down to the neighbour in each direction, north, east, south and west
        private static readonly int[] DeltaX = [0, 1, 0, -1];
        private static readonly int[] DeltaY = [-1, 0, 1, 0];

        // The step of a route's first tile, which no step reached
        private const int NoStep = -1;

        // The most a tile costs to enter, and so how many costs past the one settling the search may queue a tile
        private const int MostEnterCost = RoadCost + Traffic.MaxTrafficDensity / DensityPerCost;

        private readonly GameMap _map;
        private readonly int _width;
        private readonly int _height;

        // By index x + y * width, valid where its mark is the search's: the cost of the cheapest route found to the
        // tile, its length in tiles, the direction of its last step, and whether the search has settled it
        private readonly int[] _cost;
        private readonly int[] _length;
        private readonly int[] _step;
        private readonly int[] _mark;
        private readonly int[] _settled;

        // By the index of a tile, valid where its mark is the search's: the centre of the destination zone whose
        // footprint holds it, or -1 for none
        private readonly int[] _owner;
        private readonly int[] _ownerMark;

        // By the index of a zone's centre, valid where its mark is the search's: whether it is a destination
        private readonly bool[] _isDestination;
        private readonly int[] _destinationMark;

        // By the index of a destination zone's centre, valid where its mark is the search's: the tile beside it the
        // search reaches it at
        private readonly int[] _goal;
        private readonly int[] _foundMark;

        // The tiles queued at each cost, a ring of one more cost than a step can add, and the centres found
        private readonly List<int>[] _buckets;
        private readonly List<int> _found = new List<int>();
        private int _search;

        public TripRouter(GameMap map)
        {
            _map = map;
            _width = map.Width;
            _height = map.Height;
            int tiles = map.Width * map.Height;
            _cost = new int[tiles];
            _length = new int[tiles];
            _step = new int[tiles];
            _mark = new int[tiles];
            _settled = new int[tiles];
            _owner = new int[tiles];
            _ownerMark = new int[tiles];
            _isDestination = new bool[tiles];
            _destinationMark = new int[tiles];
            _goal = new int[tiles];
            _foundMark = new int[tiles];
            _buckets = new List<int>[MostEnterCost + 1];

            for (int i = 0; i < _buckets.Length; i++)
            {
                _buckets[i] = new List<int>();
            }
        }

        /// <summary>
        /// Routes a trip from the zone centred at <paramref name="origin"/> to a zone of the destination's kind, filling
        /// <paramref name="route"/> with every tile of the route in order: <see cref="TrafficResult.RouteFound"/>, or
        /// <see cref="TrafficResult.SlowRoute"/> where the route costs more than <see cref="SlowFactor"/> times a clear
        /// road's straight run between its ends. With no road or rail on the zone's perimeter it is
        /// <see cref="TrafficResult.NoRoadFound"/>, and with no destination reached
        /// <see cref="TrafficResult.NoRouteFound"/>, the route left empty. Every destination it reaches is weighted one
        /// more than <see cref="MaxRouteTiles"/> less its route's length, and one draw from <paramref name="random"/>
        /// picks among them by their centres row by row.
        /// </summary>
        /// <param name="trafficDensity">The traffic density map, which adds to the cost of each road tile.</param>
        public TrafficResult Route(Position origin, TrafficDestination destination, BlockMap trafficDensity, RandomStream random,
                                   List<Position> route)
        {
            route.Clear();
            Start();

            foreach (Position tile in Traffic.Perimeter(_map, origin))
            {
                if (TileUtils.IsDriveable(_map.GetTileValue(tile)))
                {
                    Label(Index(tile.X, tile.Y), 0, 1, NoStep);
                }
            }

            if (_buckets[0].Count == 0)
            {
                return TrafficResult.NoRoadFound;
            }

            Search(destination, Index(origin.X, origin.Y), trafficDensity);

            if (_found.Count == 0)
            {
                return TrafficResult.NoRouteFound;
            }

            _found.Sort();

            // Each zone found lies within the cut's reach and needs a road beside it, so even a crowded map's weights
            // sum to some thousands, within one 16-bit draw, which would throw rather than pick past it
            int total = 0;

            foreach (int centre in _found)
            {
                total += Weight(centre);
            }

            int draw = random.GetRandom(total - 1);
            int chosen = _found[^1];

            foreach (int centre in _found)
            {
                draw -= Weight(centre);

                if (draw < 0)
                {
                    chosen = centre;
                    break;
                }
            }

            int goal = _goal[chosen];
            FillRoute(goal, route);

            int straightRun = Math.Abs(route[^1].X - route[0].X) + Math.Abs(route[^1].Y - route[0].Y);
            return _cost[goal] > SlowFactor * RoadCost * straightRun ? TrafficResult.SlowRoute : TrafficResult.RouteFound;
        }

        private int Weight(int centre)
        {
            return MaxRouteTiles + 1 - _length[_goal[centre]];
        }

        private void Search(TrafficDestination destination, int originIndex, BlockMap trafficDensity)
        {
            int queued = _buckets[0].Count;

            for (int cost = 0; queued > 0; cost++)
            {
                List<int> bucket = _buckets[cost % _buckets.Length];

                // Every step costs at least RailCost, so nothing joins this cost while it settles
                for (int i = 0; i < bucket.Count; i++)
                {
                    int index = bucket[i];

                    if (_cost[index] != cost || _settled[index] == _search)
                    {
                        continue;
                    }

                    _settled[index] = _search;
                    FindDestinationsBeside(index, destination, originIndex);

                    if (_length[index] < MaxRouteTiles)
                    {
                        queued += Expand(index, trafficDensity);
                    }
                }

                queued -= bucket.Count;
                bucket.Clear();
            }
        }

        // Queues the driveable neighbours of a settled tile that this route reaches cheaper, or as cheaply from a
        // neighbour earlier in north, east, south, west, and says how many it queued
        private int Expand(int index, BlockMap trafficDensity)
        {
            int x = index % _width;
            int y = index / _width;
            int queued = 0;

            for (int step = 0; step < 4; step++)
            {
                int nextX = x + DeltaX[step];
                int nextY = y + DeltaY[step];

                if (!OnMap(nextX, nextY))
                {
                    continue;
                }

                int tileValue = _map.GetTileValue(nextX, nextY);

                if (!TileUtils.IsDriveable(tileValue))
                {
                    continue;
                }

                int next = Index(nextX, nextY);
                int cost = _cost[index] + EnterCost(tileValue, nextX, nextY, trafficDensity);

                if (_mark[next] != _search || cost < _cost[next])
                {
                    Label(next, cost, _length[index] + 1, step);
                    queued++;
                }
                else if (cost == _cost[next] && Back(step) < Back(_step[next]))
                {
                    // As cheap, from a neighbour earlier in the order, and queued at this cost already: a tile queued is
                    // settled only once every cheaper one has been
                    _length[next] = _length[index] + 1;
                    _step[next] = step;
                }
            }

            return queued;
        }

        // The direction back from a tile to the neighbour its step came from
        private static int Back(int step)
        {
            return (step + 2) % 4;
        }

        private static int EnterCost(int tileValue, int x, int y, BlockMap trafficDensity)
        {
            if (!TileUtils.CarriesCars(tileValue))
            {
                return RailCost;
            }

            return RoadCost + trafficDensity.WorldGet(x, y) / DensityPerCost;
        }

        // Each destination zone beside a settled tile has its goal there, unless the search reached it cheaper, or as
        // cheaply at a tile earlier row by row
        private void FindDestinationsBeside(int index, TrafficDestination destination, int originIndex)
        {
            int x = index % _width;
            int y = index / _width;

            for (int step = 0; step < 4; step++)
            {
                int nextX = x + DeltaX[step];
                int nextY = y + DeltaY[step];

                if (!OnMap(nextX, nextY))
                {
                    continue;
                }

                int centre = Owner(Index(nextX, nextY), destination);

                if (centre < 0 || centre == originIndex)
                {
                    continue;
                }

                if (_foundMark[centre] != _search)
                {
                    _foundMark[centre] = _search;
                    _goal[centre] = index;
                    _found.Add(centre);
                }
                else if (_cost[index] == _cost[_goal[centre]] && index < _goal[centre])
                {
                    _goal[centre] = index;
                }
            }
        }

        // The centre of the destination zone whose footprint holds the tile, or -1 for none
        private int Owner(int index, TrafficDestination destination)
        {
            if (_ownerMark[index] == _search)
            {
                return _owner[index];
            }

            _ownerMark[index] = _search;
            _owner[index] = -1;

            int x = index % _width;
            int y = index / _width;

            // A road or rail is no zone's, and a zone's centre is its footprint's second tile across and down, so it
            // lies one down and right of the tile at most, and up and left at most the largest zone's side less two
            if (!TileUtils.IsDriveable(_map.GetTileValue(x, y)) && CentreCovering(x, y, out int centre) &&
                IsDestination(centre, destination))
            {
                _owner[index] = centre;
            }

            return _owner[index];
        }

        // Whether the zone centred there is a destination, asked once a search for each zone
        private bool IsDestination(int centre, TrafficDestination destination)
        {
            if (_destinationMark[centre] != _search)
            {
                _destinationMark[centre] = _search;
                _isDestination[centre] = destination.IsDestination(_map, centre % _width, centre / _width);
            }

            return _isDestination[centre];
        }

        // The centre of the zone whose footprint holds (x, y), if one does. Zones never overlap, so the first centre found
        // is the one: a 3×3 zone's, the most common, lies in the 3×3 round the tile, so that is looked through first.
        private bool CentreCovering(int x, int y, out int centre)
        {
            return CentreCovering(x, y, 1, out centre) || CentreCovering(x, y, ZoneUtils.LargestZoneSize - 2, out centre);
        }

        // The centre of a zone whose footprint holds (x, y), from those up to the reach up and left and one down and right
        private bool CentreCovering(int x, int y, int reach, out int centre)
        {
            for (int centreY = y - reach; centreY <= y + 1; centreY++)
            {
                for (int centreX = x - reach; centreX <= x + 1; centreX++)
                {
                    if (!OnMap(centreX, centreY) || !_map.GetTile(centreX, centreY).IsZone())
                    {
                        continue;
                    }

                    int size = ZoneUtils.SizeAtCentre(_map.GetTileValue(centreX, centreY));

                    if (x >= centreX - 1 && y >= centreY - 1 && x <= centreX + size - 2 && y <= centreY + size - 2)
                    {
                        centre = Index(centreX, centreY);
                        return true;
                    }
                }
            }

            centre = -1;
            return false;
        }

        private void FillRoute(int goal, List<Position> route)
        {
            int index = goal;
            route.Add(PositionOf(index));

            while (_step[index] != NoStep)
            {
                index = Index(index % _width - DeltaX[_step[index]], index / _width - DeltaY[_step[index]]);
                route.Add(PositionOf(index));
            }

            route.Reverse();
        }

        // Records a route to the tile and queues it at the route's cost
        private void Label(int index, int cost, int length, int step)
        {
            _mark[index] = _search;
            _cost[index] = cost;
            _length[index] = length;
            _step[index] = step;
            _buckets[cost % _buckets.Length].Add(index);
        }

        // A new search, every tile unlabelled
        private void Start()
        {
            if (_search == int.MaxValue)
            {
                Array.Clear(_mark);
                Array.Clear(_settled);
                Array.Clear(_ownerMark);
                Array.Clear(_destinationMark);
                Array.Clear(_foundMark);
                _search = 0;
            }

            _search++;
            _found.Clear();

            foreach (List<int> bucket in _buckets)
            {
                bucket.Clear();
            }
        }

        private bool OnMap(int x, int y)
        {
            return (uint)x < (uint)_width && (uint)y < (uint)_height;
        }

        private int Index(int x, int y)
        {
            return x + y * _width;
        }

        private Position PositionOf(int index)
        {
            return new Position(index % _width, index / _width);
        }
    }
}
