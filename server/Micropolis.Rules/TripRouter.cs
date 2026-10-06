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
    /// between searches: what entering a tile costs and which zone's footprint holds it, a search reads from the map
    /// and the traffic density as they are the first time it asks, and its buffers are scratch, which each search
    /// starts afresh.
    /// </remarks>
    internal sealed class TripRouter
    {
        /// <summary>
        /// The most tiles a route takes, its first included.
        /// </summary>
        public const int MaxRouteTiles = 60;

        /// <summary>
        /// What a route may cost for each tile of the straight run between its ends before it is slow: between a clear
        /// road's <see cref="RoadCost"/> and a road at the heaviest traffic, so a route along jammed roads is slow, as is
        /// one that goes far round.
        /// </summary>
        public const int SlowCostPerTile = 6;

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
        public const int DensityPerCost = 64;

        // The step across and down to the neighbour in each direction, north, east, south and west
        private static readonly int[] DeltaX = [0, 1, 0, -1];
        private static readonly int[] DeltaY = [-1, 0, 1, 0];

        // The step of a route's first tile, which no step reached
        private const int NoStep = -1;

        // The owner of a tile no zone's footprint holds
        private const int NoZone = -1;

        // The most a tile costs to enter, and so how many costs past the one settling the search may queue a tile
        private const int MostEnterCost = RoadCost + Traffic.MaxTrafficDensity / DensityPerCost;

        // How many costs the ring of queues holds: one past the most a tile costs to enter, so a tile queued while a cost
        // settles never joins that cost's queue, nor one holding another cost
        private const int Ring = MostEnterCost + 1;

        private readonly GameMap _map;
        private readonly int _width;
        private readonly int _height;

        // The step in index to the neighbour in each direction, and by the index of a tile, a bit for each direction
        // whose neighbour is on the map
        private readonly int[] _offset;
        private readonly byte[] _neighbours;

        // By the index of a tile, what the search knows of it, one record a tile so that a tile's parts lie together
        private readonly Place[] _places;

        // By the index of a zone's centre, valid where its mark is the search's: whether it is a destination
        private readonly bool[] _isDestination;
        private readonly int[] _destinationMark;

        // By the index of a destination zone's centre, valid where its mark is the search's: the tile beside it the
        // search reaches it at
        private readonly int[] _goal;
        private readonly int[] _foundMark;

        // The tiles queued at each cost, a ring of one more cost than a step can add, with how many each holds, and the
        // centres found
        private readonly int[][] _buckets;
        private readonly int[] _bucketCount;
        private readonly List<int> _found = new List<int>();
        private int _search;

        public TripRouter(GameMap map)
        {
            _map = map;
            _width = map.Width;
            _height = map.Height;
            int tiles = map.Width * map.Height;
            _offset = [-_width, 1, _width, -1];
            _neighbours = new byte[tiles];

            for (int index = 0; index < tiles; index++)
            {
                for (int step = 0; step < 4; step++)
                {
                    if (OnMap(index % _width + DeltaX[step], index / _width + DeltaY[step]))
                    {
                        _neighbours[index] |= (byte)(1 << step);
                    }
                }
            }

            _places = new Place[tiles];
            _isDestination = new bool[tiles];
            _destinationMark = new int[tiles];
            _goal = new int[tiles];
            _foundMark = new int[tiles];
            _buckets = new int[Ring][];
            _bucketCount = new int[Ring];

            for (int i = 0; i < _buckets.Length; i++)
            {
                _buckets[i] = new int[16];
            }
        }

        /// <summary>
        /// Routes a trip from the zone centred at <paramref name="origin"/> to a zone of the destination's kind, filling
        /// <paramref name="route"/> with every tile of the route in order: <see cref="TrafficResult.RouteFound"/>, or
        /// <see cref="TrafficResult.SlowRoute"/> where the route costs more than <see cref="SlowCostPerTile"/> for each
        /// tile of the straight run between its ends. With no road or rail on the zone's perimeter it is
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
                int index = Index(tile.X, tile.Y);

                if (Enter(index, trafficDensity) != 0)
                {
                    Label(index, 0, 1, NoStep);
                }
            }

            if (_bucketCount[0] == 0)
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
            return _places[goal].Cost > SlowCostPerTile * straightRun ? TrafficResult.SlowRoute : TrafficResult.RouteFound;
        }

        private int Weight(int centre)
        {
            return MaxRouteTiles + 1 - _places[_goal[centre]].Length;
        }

        private void Search(TrafficDestination destination, int originIndex, BlockMap trafficDensity)
        {
            int queued = _bucketCount[0];

            for (int cost = 0; queued > 0; cost++)
            {
                int slot = cost % Ring;
                int[] bucket = _buckets[slot];
                int count = _bucketCount[slot];

                // Every step costs at least RailCost, so nothing joins this cost while it settles
                for (int i = 0; i < count; i++)
                {
                    int index = bucket[i];
                    ref Place place = ref _places[index];

                    if (place.Cost != cost || place.Settled == _search)
                    {
                        continue;
                    }

                    queued += Settle(index, destination, originIndex, trafficDensity);
                }

                queued -= count;
                _bucketCount[slot] = 0;
            }
        }

        // Settles a tile, its route the cheapest, and takes each neighbour of it: a destination zone whose footprint
        // holds it has its goal here, unless the search reached it cheaper, or as cheaply at a tile earlier row by row;
        // and a driveable one is queued where this route reaches it cheaper, or as cheaply from a neighbour earlier in
        // north, east, south, west, short of the cut. Says how many it queued.
        private int Settle(int index, TrafficDestination destination, int originIndex, BlockMap trafficDensity)
        {
            ref Place settled = ref _places[index];
            settled.Settled = _search;
            int neighbours = _neighbours[index];
            int cost = settled.Cost;
            int length = settled.Length + 1;
            int queued = 0;

            for (int step = 0; step < 4; step++)
            {
                if ((neighbours & (1 << step)) == 0)
                {
                    continue;
                }

                int next = index + _offset[step];
                int enter = Enter(next, trafficDensity);

                if (enter == 0)
                {
                    FoundBeside(next, index, destination, originIndex);
                }
                else if (length <= MaxRouteTiles)
                {
                    int nextCost = cost + enter;
                    ref Place place = ref _places[next];

                    if (place.Mark != _search || nextCost < place.Cost)
                    {
                        Label(next, nextCost, length, step);
                        queued++;
                    }
                    else if (nextCost == place.Cost && Back(step) < Back(place.Step))
                    {
                        // As cheap, from a neighbour earlier in the order, and queued at this cost already: a tile queued
                        // is settled only once every cheaper one has been
                        place.Length = (byte)length;
                        place.Step = (sbyte)step;
                    }
                }
            }

            return queued;
        }

        // The direction back from a tile to the neighbour its step came from
        private static int Back(int step)
        {
            return (step + 2) % 4;
        }

        // The zone whose footprint holds a tile beside a settled one has its goal there, if it is a destination other
        // than the trip's own zone, unless the search reached it cheaper, or as cheaply at a tile earlier row by row
        private void FoundBeside(int tile, int settled, TrafficDestination destination, int originIndex)
        {
            int centre = Owner(tile);

            if (centre == NoZone || centre == originIndex || !IsDestination(centre, destination))
            {
                return;
            }

            if (_foundMark[centre] != _search)
            {
                _foundMark[centre] = _search;
                _goal[centre] = settled;
                _found.Add(centre);
            }
            else if (_places[settled].Cost == _places[_goal[centre]].Cost && settled < _goal[centre])
            {
                _goal[centre] = settled;
            }
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

        // What entering the tile costs, from the map and the traffic density as they are, or 0 for a tile no trip
        // enters, read the first time the search asks
        private int Enter(int index, BlockMap trafficDensity)
        {
            ref Place place = ref _places[index];

            if (place.EnterMark != _search)
            {
                place.EnterMark = _search;
                place.Enter = (byte)EnterCost(index, trafficDensity);
            }

            return place.Enter;
        }

        private int EnterCost(int index, BlockMap trafficDensity)
        {
            int tileValue = _map.RawValueAt(index) & TileFlags.BIT_MASK;

            if (!TileUtils.IsDriveable(tileValue))
            {
                return 0;
            }

            if (!TileUtils.CarriesCars(tileValue))
            {
                return RailCost;
            }

            return RoadCost + trafficDensity.WorldGet(index % _width, index / _width) / DensityPerCost;
        }

        // The centre of the zone whose footprint holds the tile, or NoZone, read from the map as it is the first time
        // the search asks
        private int Owner(int index)
        {
            ref Place place = ref _places[index];

            if (place.OwnerMark != _search)
            {
                place.OwnerMark = _search;
                place.Owner = ZoneUtils.ZoneCentre(_map, index % _width, index / _width) is Position centre
                    ? Index(centre.X, centre.Y)
                    : NoZone;
            }

            return place.Owner;
        }

        private void FillRoute(int goal, List<Position> route)
        {
            int index = goal;
            route.Add(PositionOf(index));

            while (_places[index].Step != NoStep)
            {
                index -= _offset[_places[index].Step];
                route.Add(PositionOf(index));
            }

            route.Reverse();
        }

        // Records a route to the tile and queues it at the route's cost
        private void Label(int index, int cost, int length, int step)
        {
            ref Place place = ref _places[index];
            place.Mark = _search;
            place.Cost = cost;
            place.Length = (byte)length;
            place.Step = (sbyte)step;

            int slot = cost % Ring;

            if (_bucketCount[slot] == _buckets[slot].Length)
            {
                Array.Resize(ref _buckets[slot], _buckets[slot].Length * 2);
            }

            _buckets[slot][_bucketCount[slot]++] = index;
        }

        // A new search, every tile unlabelled
        private void Start()
        {
            if (_search == int.MaxValue)
            {
                Array.Clear(_places);
                Array.Clear(_destinationMark);
                Array.Clear(_foundMark);
                _search = 0;
            }

            _search++;
            _found.Clear();
            Array.Clear(_bucketCount);
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

        // What a search knows of a tile, each part valid where its mark is the search's: the cheapest route found to the
        // tile, its cost, its length in tiles and the direction of its last step, and whether the search has settled it;
        // what entering it costs; and the centre of the zone whose footprint holds it
        private struct Place
        {
            public int Mark;
            public int Settled;
            public int Cost;
            public int EnterMark;
            public int OwnerMark;
            public int Owner;
            public byte Length;
            public sbyte Step;
            public byte Enter;
        }
    }
}
