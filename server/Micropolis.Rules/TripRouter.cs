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
    /// How a route goes over a tile of it: by road, riding a train, or on foot.
    /// </summary>
    internal enum TravelMode
    {
        Road,
        Rail,
        Walk,
    }

    /// <summary>
    /// A tile of a route, and how the route goes over it.
    /// </summary>
    internal readonly record struct RouteStep(Position Tile, TravelMode Mode);

    /// <summary>
    /// Routes a zone's trip to a destination of the kind it needs, by road, by rail and on foot, in place of the
    /// original's random drive. One search runs from every tile of the zone's perimeter at once, costing each tile it
    /// enters, and finds every destination zone it reaches, at the cheapest of the tiles beside its footprint it may
    /// arrive from. One draw then picks the destination, a nearer one likelier, and the trip takes the route the search
    /// found to it.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The search knows how a route goes over each tile, so it keeps a route to a tile for each way of going over it.
    /// A route by road goes on along road, and gets on a train only at a station; a route riding goes on along rail,
    /// through any station, and gets off only at one, onto road or on foot. A route may walk at most
    /// <see cref="MostWalkedTiles"/> tiles at each end, over any tile but water: from the zone's perimeter to a
    /// station it gets on at, and from a station it gets off at to beside its destination; it walks nowhere else. A
    /// level crossing carries a route by road across it and a route riding along it, neither changing how it goes. A
    /// route arrives beside its destination by road, on foot, or at a station it gets off at; a route riding through
    /// a station, or one that has only got on there, does not arrive. A ride goes on only where the track joins, from a
    /// side its tile's track leaves by onto a tile whose track leaves by the side facing (<see cref="TileUtils.RailEnds"/>),
    /// so it follows the track round its curves and through a station along it; a route by road gets on from any side,
    /// and one getting off goes any way. Getting on costs <see cref="BoardingCost"/>, for the wait for a departure, and
    /// every tile of rail a ride goes over, the station it gets on at included, costs what its rail load costs the way
    /// the ride goes over it (<see cref="BlockMaps.RailLoad"/>), each tile carrying a track each way.
    /// </para>
    /// <para>
    /// The search settles routes in order of cost, and keeps only the cheapest route to each tile for each way of
    /// going over it. A route gives way only to a cheaper one, or, unless it is a route's first tile, to one as cheap
    /// whose last step comes from a neighbour earlier in north, east, south, west, or from the same neighbour going over
    /// it a way earlier in road, boarding, riding, walking out, then walking in one, two and three tiles; a destination's
    /// goal is the cheapest route beside it, and of two as cheap the one ending on the first tile row by row, then the
    /// way earlier in that order; so ties break the same way every run. A route goes no further than its <see cref="MaxRouteTiles"/>th
    /// tile, and where the cheapest route to a tile ends there, the search goes no further from that tile, though a
    /// dearer, shorter route to it could have: it may miss a destination such a route would reach, and a route it
    /// finds is the cheapest only among those the cut leaves. So it is deterministic, but not exact over every route
    /// within the cut. All its arithmetic is on whole numbers, and it draws from the stream once a trip, to pick. It
    /// holds no state between searches: what entering a tile costs and which zone's footprint holds it, a search reads
    /// from the map, the traffic density and the rail load as they are the first time it asks, and its buffers are
    /// scratch, which each search starts afresh.
    /// </para>
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
        /// What riding onto a rail tile costs while the rail is empty, to which its rail load the way the ride goes adds
        /// one for every <see cref="RailLoadPerCost"/>, and which a tile at <see cref="Traffic.MaxRailLoad"/> that way
        /// takes no ride onto (<see cref="BlockMaps.RailLoad"/>).
        /// </summary>
        public const int RailCost = 2;

        /// <summary>
        /// What getting on a train at a station adds to the route, for the wait for its departure
        /// (<see cref="Timetable"/>): three tiles of clear road, a fixed figure rather than the wait step for step, so a
        /// ride is worth taking only some way.
        /// </summary>
        public const int BoardingCost = 3 * RoadCost;

        /// <summary>
        /// The rail load that adds one to the cost of riding onto a rail tile.
        /// </summary>
        public const int RailLoadPerCost = 48;

        /// <summary>
        /// What entering a road tile costs on a clear road, to which its block's traffic density adds one for every
        /// <see cref="DensityPerCost"/>.
        /// </summary>
        public const int RoadCost = 4;

        /// <summary>
        /// The traffic density that adds one to the cost of entering a road tile.
        /// </summary>
        public const int DensityPerCost = 64;

        /// <summary>
        /// What walking onto a tile costs: more than a clear road, so a route walks only where a station is near.
        /// </summary>
        public const int WalkCost = 6;

        /// <summary>
        /// The most tiles a route walks at each end, between its zone's perimeter and a station, or between a station
        /// and beside its destination.
        /// </summary>
        public const int MostWalkedTiles = 3;

        // The step of a route's first tile, which no step reached
        private const int NoStep = -1;

        // The owner of a tile no zone's footprint holds
        private const int NoZone = -1;

        // The ways a route goes over a tile, in the order ties break by: by road; having just got on a train at a
        // station, from which it may only ride on; riding; walking from its zone to a station; and walking from a
        // station to its destination, having walked one, two or three tiles
        private const int ByRoad = 0;
        private const int Boarding = 1;
        private const int Riding = 2;
        private const int WalkingOut = 3;
        private const int WalkingIn = 4;
        private const int Ways = WalkingIn + MostWalkedTiles;

        // What a tile is to the search, bits of it: a road a car drives on, rail a train runs on, a station, and water,
        // which no one walks on
        private const int Road = 1;
        private const int Rail = 2;
        private const int Station = 4;
        private const int Water = 8;

        // The most a step costs, and so how many costs past the one settling the search may queue a route: entering a
        // road tile, getting on at a station, riding onto a rail tile, which riding off the station got on at costs
        // too, or walking
        private const int MostRoadCost = RoadCost + Traffic.MaxTrafficDensity / DensityPerCost;
        private const int MostRailCost = 2 * (RailCost + (Traffic.MaxRailLoad - 1) / RailLoadPerCost);
        private const int MostRoadOrRailCost = MostRoadCost > MostRailCost ? MostRoadCost : MostRailCost;
        private const int MostRideCost = MostRoadOrRailCost > BoardingCost ? MostRoadOrRailCost : BoardingCost;
        private const int MostEnterCost = MostRideCost > WalkCost ? MostRideCost : WalkCost;

        // How many costs the ring of queues holds: one past the most a tile costs to enter, so a route queued while a
        // cost settles never joins that cost's queue, nor one holding another cost
        private const int Ring = MostEnterCost + 1;

        private readonly GameMap _map;
        private readonly int _width;
        private readonly int _height;
        private readonly int _tiles;

        // Each way's routes lie in a block of the routes a power of two long, at least the map's tiles: a route's index
        // is its way shifted this far, with its tile's index in the bits the mask keeps, so the search, which splits
        // the index of every route it settles, shifts and masks rather than divides
        private readonly int _wayShift;
        private readonly int _tileMask;

        // The step in index to the neighbour in each direction, and by the index of a tile, a bit for each direction
        // whose neighbour is on the map: each direction, a route's step, numbered as a tile's side it goes out by is
        // (TileUtils.NorthSide)
        private readonly int[] _offset;
        private readonly byte[] _neighbours;

        // By the index of a tile, what the search reads of it from the map and the block maps
        private readonly Facts[] _facts;

        // By a route's index, the index of its tile and the way it goes over it, ways apart: what the search knows of
        // the route, one record a route so that its parts lie together
        private readonly Place[] _places;

        // By the index of a zone's centre, valid where its mark is the search's: whether it is a destination
        private readonly bool[] _isDestination;
        private readonly int[] _destinationMark;

        // By the index of a destination zone's centre, valid where its mark is the search's: the route beside it the
        // search reaches it by
        private readonly int[] _goal;
        private readonly int[] _foundMark;

        // The routes queued at each cost, a ring of one more cost than a step can add, with how many each holds, and
        // the centres found
        private readonly int[][] _buckets;
        private readonly int[] _bucketCount;
        private readonly List<int> _found = new List<int>();
        private int _search;

        // Whether the search has found a road or a station on the perimeter, or a station within a walk of it, full or
        // not: a zone with one has a way out though its rail be too loaded to take the trip, as one with a jammed road has
        private bool _setOff;

        public TripRouter(GameMap map)
        {
            _map = map;
            _width = map.Width;
            _height = map.Height;
            _tiles = map.Width * map.Height;
            while (1 << _wayShift < _tiles)
            {
                _wayShift++;
            }
            _tileMask = (1 << _wayShift) - 1;
            _offset = Direction.CardinalDirections.Select(direction => direction.YDelta * _width + direction.XDelta).ToArray();
            _neighbours = new byte[_tiles];

            for (int index = 0; index < _tiles; index++)
            {
                for (int step = 0; step < 4; step++)
                {
                    Direction direction = Direction.CardinalDirections[step];
                    if (OnMap(index % _width + direction.XDelta, index / _width + direction.YDelta))
                    {
                        _neighbours[index] |= (byte)(1 << step);
                    }
                }
            }

            _facts = new Facts[_tiles];
            _places = new Place[Ways << _wayShift];
            _isDestination = new bool[_tiles];
            _destinationMark = new int[_tiles];
            _goal = new int[_tiles];
            _foundMark = new int[_tiles];
            _buckets = new int[Ring][];
            _bucketCount = new int[Ring];

            for (int i = 0; i < _buckets.Length; i++)
            {
                _buckets[i] = new int[16];
            }
        }

        /// <summary>
        /// Routes a trip from the zone centred at <paramref name="origin"/> to a zone of the destination's kind, filling
        /// <paramref name="route"/> with every tile of the route in order, with how it goes over each:
        /// <see cref="TrafficResult.RouteFound"/>, or <see cref="TrafficResult.SlowRoute"/> where the route costs more
        /// than <see cref="SlowCostPerTile"/> for each tile of the straight run between its ends. With no road or
        /// station on the zone's perimeter, and no station within a walk of it, full or not, it is
        /// <see cref="TrafficResult.NoRoadFound"/>, and with no destination reached
        /// <see cref="TrafficResult.NoRouteFound"/>, the route left empty. Every destination it reaches is weighted one
        /// more than <see cref="MaxRouteTiles"/> less its route's length, and one draw from <paramref name="random"/>
        /// picks among them by their centres row by row.
        /// </summary>
        /// <param name="blockMaps">The block maps, whose traffic density adds to the cost of each road tile and whose
        /// rail load each way adds to the cost of each rail tile a ride goes over that way.</param>
        public TrafficResult Route(Position origin, TrafficDestination destination, BlockMaps blockMaps, RandomStream random,
                                   List<RouteStep> route)
        {
            route.Clear();
            Start();
            bool walks = StationWithinWalk(origin);

            foreach (Position tile in Traffic.Perimeter(_map, origin))
            {
                int index = Index(tile.X, tile.Y);
                ref Facts facts = ref Read(index, blockMaps);

                if ((facts.Kind & Road) != 0)
                {
                    Label(At(ByRoad, index), 0, 1, NoStep, ByRoad);
                }

                _setOff |= (facts.Kind & (Road | Station)) != 0;

                if ((facts.Kind & Station) != 0 && BoardingEnter(facts) != 0)
                {
                    Label(At(Boarding, index), BoardingCost, 1, NoStep, Boarding);
                }

                if (walks && (facts.Kind & Water) == 0)
                {
                    Label(At(WalkingOut, index), 0, 1, NoStep, WalkingOut);
                }
            }

            Search(destination, Index(origin.X, origin.Y), blockMaps);

            if (!_setOff)
            {
                return TrafficResult.NoRoadFound;
            }

            if (_found.Count == 0)
            {
                return TrafficResult.NoRouteFound;
            }

            _found.Sort();

            // Each zone found lies within the cut's reach and needs a way beside it, so even a crowded map's weights
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

            int straightRun = Math.Abs(route[^1].Tile.X - route[0].Tile.X) + Math.Abs(route[^1].Tile.Y - route[0].Tile.Y);
            return _places[goal].Cost > SlowCostPerTile * straightRun ? TrafficResult.SlowRoute : TrafficResult.RouteFound;
        }

        // Whether a station lies within a walk of the zone's perimeter, which lies at most Traffic.PerimeterReach tiles
        // across and down from its centre: in the box that far round the centre widened by the most a route walks. A
        // route walks out of its zone only to get on a train, so where no station lies there the search walks nowhere,
        // which finds the same routes as walking would, and a city without stations pays nothing for walking.
        private bool StationWithinWalk(Position origin)
        {
            int reach = Traffic.PerimeterReach + MostWalkedTiles;

            for (int y = Math.Max(0, origin.Y - reach); y <= Math.Min(_height - 1, origin.Y + reach); y++)
            {
                for (int x = Math.Max(0, origin.X - reach); x <= Math.Min(_width - 1, origin.X + reach); x++)
                {
                    if (TileUtils.IsRailStation(_map.RawValueAt(Index(x, y)) & TileFlags.BIT_MASK))
                    {
                        return true;
                    }
                }
            }

            return false;
        }

        private int Weight(int centre)
        {
            return MaxRouteTiles + 1 - _places[_goal[centre]].Length;
        }

        private void Search(TrafficDestination destination, int originIndex, BlockMaps blockMaps)
        {
            int queued = 0;

            foreach (int count in _bucketCount)
            {
                queued += count;
            }

            for (int cost = 0; queued > 0; cost++)
            {
                int slot = cost % Ring;
                int[] bucket = _buckets[slot];
                int count = _bucketCount[slot];

                // Every step costs at least RailCost, so nothing joins this cost while it settles
                for (int i = 0; i < count; i++)
                {
                    int at = bucket[i];
                    ref Place place = ref _places[at];

                    if (place.Cost != cost || place.Settled == _search)
                    {
                        continue;
                    }

                    queued += at >> _wayShift == ByRoad
                        ? SettleByRoad(at, destination, originIndex, blockMaps)
                        : Settle(at, destination, originIndex, blockMaps);
                }

                queued -= count;
                _bucketCount[slot] = 0;
            }
        }

        // Settles a route by road, as Settle does a route going any other way: on a map without stations every route
        // is by road, so the search settles them in a loop of their own, small enough for the compiler to keep tight.
        // Its neighbour may be arrived beside, driven on along road, or got on a train at, in that order, as Settle
        // takes them.
        private int SettleByRoad(int at, TrafficDestination destination, int originIndex, BlockMaps blockMaps)
        {
            ref Place settled = ref _places[at];
            settled.Settled = _search;
            int index = at & _tileMask;
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
                ref Facts facts = ref Read(next, blockMaps);
                int nextKind = facts.Kind;

                if ((nextKind & (Road | Rail)) == 0)
                {
                    FoundBeside(next, at, destination, originIndex);
                }

                if (length > MaxRouteTiles)
                {
                    continue;
                }

                if ((nextKind & Road) != 0)
                {
                    queued += Offer(ByRoad, next, facts.RoadEnter, cost, length, step, ByRoad);
                }

                if ((nextKind & Station) != 0)
                {
                    queued += Offer(Boarding, next, BoardingEnter(facts), cost, length, step, ByRoad);
                }
            }

            return queued;
        }

        // Settles a route, the cheapest to its tile going over it its way, any way but by road (SettleByRoad), and takes
        // each neighbour of its tile: a destination zone whose footprint holds it has its goal here, if the route may
        // arrive, unless the search reached it cheaper, or as cheaply on a tile earlier row by row; and each way the
        // route may go on onto it is queued where this route reaches it cheaper, or as cheaply from a neighbour earlier
        // in north, east, south, west, short of the cut. Says how many it queued.
        private int Settle(int at, TrafficDestination destination, int originIndex, BlockMaps blockMaps)
        {
            ref Place settled = ref _places[at];
            settled.Settled = _search;
            int index = at & _tileMask;
            int way = at >> _wayShift;
            int kind = _facts[index].Kind;
            int ends = _facts[index].Ends;
            int neighbours = _neighbours[index];
            int cost = settled.Cost;
            int length = settled.Length + 1;
            bool arrives = way >= WalkingIn || (way == Riding && (kind & Station) != 0);
            int queued = 0;

            for (int step = 0; step < 4; step++)
            {
                if ((neighbours & (1 << step)) == 0)
                {
                    continue;
                }

                int next = index + _offset[step];
                ref Facts facts = ref Read(next, blockMaps);
                int nextKind = facts.Kind;

                if (arrives && (nextKind & (Road | Rail)) == 0)
                {
                    FoundBeside(next, at, destination, originIndex);
                }

                if (length > MaxRouteTiles)
                {
                    continue;
                }

                switch (way)
                {
                    case Boarding:
                    case Riding:
                        queued += Offer(Riding, next, RidesOn(ends, facts.Ends, step) ? RideOnto(index, way, facts, step) : 0, cost, length, step, way);

                        if (way == Riding && (kind & Station) != 0)
                        {
                            queued += Offer(ByRoad, next, (nextKind & Road) != 0 ? facts.RoadEnter : 0, cost, length, step, way);
                            queued += Offer(WalkingIn, next, (nextKind & Water) == 0 ? WalkCost : 0, cost, length, step, way);
                        }

                        break;

                    case WalkingOut:
                        _setOff |= (nextKind & Station) != 0;
                        queued += Offer(Boarding, next, (nextKind & Station) != 0 ? BoardingEnter(facts) : 0, cost, length, step, way);

                        if (settled.Length < MostWalkedTiles)
                        {
                            queued += Offer(WalkingOut, next, (nextKind & Water) == 0 ? WalkCost : 0, cost, length, step, way);
                        }

                        break;

                    case >= WalkingIn:
                        if (way + 1 < Ways)
                        {
                            queued += Offer(way + 1, next, (nextKind & Water) == 0 ? WalkCost : 0, cost, length, step, way);
                        }

                        break;
                }
            }

            return queued;
        }

        // Whether a ride goes on from a tile onto the tile beside it: only where the track joins them, leaving the one
        // by the side the step goes and the other by the side facing it
        private static bool RidesOn(int ends, int nextEnds, int step)
        {
            return (ends & (1 << step)) != 0 && (nextEnds & (1 << Back(step))) != 0;
        }

        // What riding on from the tile of a route riding or just got on, its index given, onto the tile beside costs, the
        // step given: what the tile beside costs the way the ride goes, and from the station it got on at what the
        // station costs that way too, which getting on there, before the way was known, didn't; or 0 where either is full
        // that way
        private int RideOnto(int index, int way, in Facts next, int step)
        {
            int enter = RideEnter(next, step);

            if (way != Boarding || enter == 0)
            {
                return enter;
            }

            int station = RideEnter(_facts[index], step);
            return station == 0 ? 0 : enter + station;
        }

        // What riding onto or off a rail tile costs, a ride going over it the way a step onto or off it goes: what its
        // rail load costs that way, the load Traffic.RailLoadEntered names for the end the ride goes in by, which faces
        // the step's way back, or 0 where that way is full
        private static int RideEnter(in Facts facts, int step)
        {
            return (facts.EntriesFromNorthOrWest & (1 << Back(step))) != 0
                ? facts.RideEnterFromNorthOrWest
                : facts.RideEnterFromSouthOrEast;
        }

        // What getting on a train at a station costs, the wait for its departure, or 0 where it is full both ways: the
        // station's track the way the ride goes costs as it rides on (RideOnto)
        private static int BoardingEnter(in Facts facts)
        {
            return facts.RideEnterFromNorthOrWest == 0 && facts.RideEnterFromSouthOrEast == 0 ? 0 : BoardingCost;
        }

        // Queues a route going on over the tile beside, the way given, which costs what entering it costs that way, or
        // 0 where it can't: where this route reaches it cheaper than any route queued to it, or as cheaply from a
        // neighbour earlier in north, east, south, west, or from the same one going over it an earlier way. Says how
        // many it queued.
        private int Offer(int way, int next, int enter, int cost, int length, int step, int from)
        {
            if (enter == 0)
            {
                return 0;
            }

            int at = At(way, next);
            int nextCost = cost + enter;
            ref Place place = ref _places[at];

            if (place.Mark != _search || nextCost < place.Cost)
            {
                Label(at, nextCost, length, step, from);
                return 1;
            }

            // A route's first tile, which getting on a train there makes cost something, gives way to no route that
            // steps onto it as cheaply
            if (nextCost == place.Cost && place.Step != NoStep &&
                (Back(step) < Back(place.Step) || (step == place.Step && from < place.From)))
            {
                // As cheap, from a neighbour earlier in the order, and queued at this cost already: a route queued is
                // settled only once every cheaper one has been
                place.Length = (byte)length;
                place.Step = (sbyte)step;
                place.From = (byte)from;
            }

            return 0;
        }

        // The direction back from a tile to the neighbour its step came from: the side the step went in by
        private static int Back(int step)
        {
            return TileUtils.OppositeSide(step);
        }

        // The zone whose footprint holds a tile beside a settled route has its goal there, if it is a destination other
        // than the trip's own zone, unless the search reached it cheaper, or as cheaply on a tile earlier row by row,
        // or on the same tile an earlier way
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
                return;
            }

            int goal = _goal[centre];

            if (_places[settled].Cost == _places[goal].Cost &&
                ((settled & _tileMask) < (goal & _tileMask) || ((settled & _tileMask) == (goal & _tileMask) && settled < goal)))
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

        // What the tile is to the search, from the map and the block maps as they are the first time the search asks
        private ref Facts Read(int index, BlockMaps blockMaps)
        {
            ref Facts facts = ref _facts[index];

            if (facts.Mark != _search)
            {
                ReadAfresh(ref facts, index, blockMaps);
            }

            return ref facts;
        }

        // Reads what the tile is to the search, apart from Read, which the search calls for every neighbour of every
        // route it settles and so stays small enough to inline
        private void ReadAfresh(ref Facts facts, int index, BlockMaps blockMaps)
        {
            facts.Mark = _search;
            int tileValue = _map.RawValueAt(index) & TileFlags.BIT_MASK;
            facts.RoadEnter = 0;
            facts.RideEnterFromNorthOrWest = 0;
            facts.RideEnterFromSouthOrEast = 0;
            facts.Ends = 0;

            // Most tiles a search reads carry neither cars nor trains: zones and buildings, and the land between
            if (!TileUtils.IsDriveable(tileValue))
            {
                facts.Kind = TileUtils.IsWater(tileValue) ? (byte)Water : (byte)0;
                return;
            }

            int x = index % _width;
            int y = index / _width;
            int kind = 0;

            if (TileUtils.CarriesCars(tileValue))
            {
                kind |= Road;
                facts.RoadEnter = (byte)(RoadCost + blockMaps.TrafficDensityMap.WorldGet(x, y) / DensityPerCost);
            }

            if (TileUtils.CarriesTrains(tileValue))
            {
                kind |= Rail;
                facts.RideEnterFromNorthOrWest = RailEnterAt(blockMaps.RailLoad(fromNorthOrWest: true).WorldGet(x, y));
                facts.RideEnterFromSouthOrEast = RailEnterAt(blockMaps.RailLoad(fromNorthOrWest: false).WorldGet(x, y));
            }

            if (TileUtils.IsRailStation(tileValue))
            {
                kind |= Station;
            }
            else if (TileUtils.IsWater(tileValue))
            {
                kind |= Water;
            }

            facts.Kind = (byte)kind;
            if ((kind & Rail) != 0)
            {
                facts.Ends = (byte)TileUtils.RailEnds(tileValue);
                facts.EntriesFromNorthOrWest = (byte)TileUtils.RailEntriesFromNorthOrWest(facts.Ends);
            }
        }

        // What riding onto a rail tile costs at the load given, its load the way the ride goes, or 0 where it is full
        private static byte RailEnterAt(int load)
        {
            return load < Traffic.MaxRailLoad ? (byte)(RailCost + load / RailLoadPerCost) : (byte)0;
        }

        // The centre of the zone whose footprint holds the tile, or NoZone, read from the map as it is the first time
        // the search asks
        private int Owner(int index)
        {
            ref Facts facts = ref _facts[index];

            if (facts.OwnerMark != _search)
            {
                facts.OwnerMark = _search;
                facts.Owner = ZoneUtils.ZoneCentre(_map, index % _width, index / _width) is Position centre
                    ? Index(centre.X, centre.Y)
                    : NoZone;
            }

            return facts.Owner;
        }

        private void FillRoute(int goal, List<RouteStep> route)
        {
            int at = goal;

            while (true)
            {
                ref Place place = ref _places[at];
                int index = at & _tileMask;
                route.Add(new RouteStep(PositionOf(index), ModeOf(at >> _wayShift)));

                if (place.Step == NoStep)
                {
                    break;
                }

                at = At(place.From, index - _offset[place.Step]);
            }

            route.Reverse();
        }

        private static TravelMode ModeOf(int way)
        {
            return way switch
            {
                ByRoad => TravelMode.Road,
                Boarding or Riding => TravelMode.Rail,
                _ => TravelMode.Walk,
            };
        }

        // Records a route and queues it at its cost
        private void Label(int at, int cost, int length, int step, int from)
        {
            ref Place place = ref _places[at];
            place.Mark = _search;
            place.Cost = cost;
            place.Length = (byte)length;
            place.Step = (sbyte)step;
            place.From = (byte)from;

            int slot = cost % Ring;

            if (_bucketCount[slot] == _buckets[slot].Length)
            {
                Array.Resize(ref _buckets[slot], _buckets[slot].Length * 2);
            }

            _buckets[slot][_bucketCount[slot]++] = at;
        }

        // A new search, every route unlabelled and every tile unread
        private void Start()
        {
            if (_search == int.MaxValue)
            {
                Array.Clear(_places);
                Array.Clear(_facts);
                Array.Clear(_destinationMark);
                Array.Clear(_foundMark);
                _search = 0;
            }

            _search++;
            _setOff = false;
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

        // The index of the route going over the tile the way given
        private int At(int way, int index)
        {
            return (way << _wayShift) | index;
        }

        private Position PositionOf(int index)
        {
            return new Position(index % _width, index / _width);
        }

        // What a search knows of a route, valid where its mark is the search's: the cheapest found to its tile going
        // over it its way, its cost, its length in tiles, the direction of its last step and the way it went over the
        // tile that step came from, and whether the search has settled it
        private struct Place
        {
            public int Mark;
            public int Settled;
            public int Cost;
            public byte Length;
            public sbyte Step;
            public byte From;
        }

        // What a search knows of a tile, each part valid where its mark is the search's: what it is, bits of the kinds
        // above, the sides its track leaves by (TileUtils.RailEnds) and those of them a ride entering by counts as
        // entering from the north or west (TileUtils.RailEntriesFromNorthOrWest), what entering it by road costs, and
        // what riding onto it costs entering from the north or west and from the south or east, each 0 where none can;
        // and the centre of the zone whose footprint holds it
        private struct Facts
        {
            public int Mark;
            public int OwnerMark;
            public int Owner;
            public byte Kind;
            public byte Ends;
            public byte EntriesFromNorthOrWest;
            public byte RoadEnter;
            public byte RideEnterFromNorthOrWest;
            public byte RideEnterFromSouthOrEast;
        }
    }
}
