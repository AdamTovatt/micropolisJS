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
    /// What a zone's trip came to, numbered as the original's <c>makeTraffic</c> numbers its three, with a slow route
    /// after them.
    /// </summary>
    public enum TrafficResult
    {
        NoRoadFound = -1,
        NoRouteFound = 0,
        RouteFound = 1,

        /// <summary>
        /// A route found that costs more than <see cref="TripRouter.SlowCostPerTile"/> for each tile of the straight run
        /// between its ends: found, but the zone's growth score loses <see cref="Traffic.SlowTripPenalty"/>.
        /// </summary>
        SlowRoute = 2,
    }

    /// <summary>
    /// The zones a trip goes to, by their centre's tile value from the lowest to the highest: the ranges driveDone in
    /// the original ended a drive beside, not the kind of zone each is named for.
    /// </summary>
    public sealed record TrafficDestination(int Low, int High)
    {
        /// <summary>
        /// Commercial, industry, the seaport, the airport, the coal plant, the fire and police stations, the stadium,
        /// and the nuclear plant: a residential zone's trip.
        /// </summary>
        public static readonly TrafficDestination Commercial = new TrafficDestination(TileValues.COMBASE, TileValues.NUCLEAR);

        /// <summary>
        /// A residential zone with houses or built, a hospital, a church, commercial, industry, and the seaport: a
        /// commercial zone's trip.
        /// </summary>
        public static readonly TrafficDestination Industrial = new TrafficDestination(TileValues.LHTHR, TileValues.PORT);

        /// <summary>
        /// A residential zone with houses or built, a hospital and a church: an industrial zone's trip.
        /// </summary>
        public static readonly TrafficDestination Residential = new TrafficDestination(TileValues.LHTHR, TileValues.COMBASE);

        public bool Contains(int tileValue)
        {
            return tileValue >= Low && tileValue <= High;
        }

        /// <summary>
        /// Whether the zone centred at (<paramref name="x"/>, <paramref name="y"/>) is a trip's destination: its centre
        /// falls in the range, or, for a range that holds the houses, it is a residential zone with a house on it. Such
        /// a zone keeps its centre at <see cref="TileValues.FREEZ"/>, below the houses, while its houses stand round it.
        /// </summary>
        public bool IsDestination(GameMap map, int x, int y)
        {
            int centreValue = map.GetTileValue(x, y);

            if (Contains(centreValue))
            {
                return true;
            }

            return centreValue == TileValues.FREEZ && Contains(TileValues.LHTHR) && Rules.Residential.GetFreeZonePopulation(map, x, y) > 0;
        }
    }

    /// <summary>
    /// The traffic a zone generates: a trip from the zone to a destination of the kind it needs, routed by road, by rail
    /// between stations and on foot to and from them (<see cref="TripRouter"/>), in place of the original's random drive
    /// along the roads in traffic.cpp.
    /// </summary>
    public sealed class Traffic
    {
        // The perimeter of a 3×3 zone, relative to its centre, clockwise from the north-west corner's north
        private static readonly int[] PerimX = [-1, 0, 1, 2, 2, 2, 1, 0, -1, -2, -2, -2];
        private static readonly int[] PerimY = [-2, -2, -2, -1, 0, 1, 2, 2, 2, 1, 0, -1];

        /// <summary>
        /// The farthest a tile of a zone's perimeter (<see cref="Perimeter"/>) lies from its centre, across or down.
        /// </summary>
        internal static readonly int PerimeterReach = Math.Max(PerimX.Max(Math.Abs), PerimY.Max(Math.Abs));

        // The heaviest traffic a block holds, and the traffic one trip adds to the block of each road tile it takes. A
        // change from the original, whose drive added 50 to every other tile it took: a routed trip runs longer and
        // takes the cheapest roads, so the original's figure on every road tile jams a town until it empties, and this
        // keeps towns growing as they did.
        internal const int MaxTrafficDensity = 240;
        internal const int TripTraffic = 5;

        /// <summary>
        /// The most riders a tile of rail holds each way, on its track that way, at which that way is full: decayed as
        /// the traffic density is, so from as high.
        /// </summary>
        public const int MaxRailLoad = MaxTrafficDensity;

        /// <summary>
        /// The riders one ride adds to each tile of rail it rides. Tuned so that a line between two busy districts fills:
        /// at the heaviest a tile's load falls by 34 each cycle, so eight or nine rides a cycle hold a line full, two and
        /// a half times the trips that jam a straight road's block, each adding <c>TripTraffic</c> to each of the road's
        /// two tiles there.
        /// </summary>
        public const int RideLoad = 4;

        /// <summary>
        /// What a slow route takes from its zone's growth score, which the original, with no slow trips, never took.
        /// </summary>
        public const int SlowTripPenalty = 300;

        private readonly GameMap _map;
        private readonly RandomStream _random;
        private readonly Trips _trips;
        private readonly TripRouter _router;

        // Every tile of the trip's route, in order, from the perimeter tile it started on, with how it went over each
        private readonly List<RouteStep> _route = new List<RouteStep>();

        /// <param name="trips">Takes the route of each trip found, which nothing in the rules reads.</param>
        public Traffic(GameMap map, RandomStream random, Trips trips)
        {
            _map = map;
            _random = random;
            _trips = trips;
            _router = new TripRouter(map);
        }

        /// <summary>
        /// Routes a trip from the zone centred at (<paramref name="x"/>, <paramref name="y"/>) to a destination of the
        /// kind given, and if it finds one, counts it in the traffic density map where it goes by road and in the rail
        /// load where it rides. Where it walks it adds to neither.
        /// </summary>
        public TrafficResult MakeTraffic(int x, int y, BlockMaps blockMaps, TrafficDestination destination)
        {
            TrafficResult result = _router.Route(new Position(x, y), destination, blockMaps, _random, _route);

            if (result is TrafficResult.RouteFound or TrafficResult.SlowRoute)
            {
                _trips.Routed(_route);
                AddToTrafficDensityMap(blockMaps);
                AddToRailLoadMap(blockMaps);
            }

            return result;
        }

        /// <summary>
        /// What the trip's result takes from its zone's growth score: <see cref="SlowTripPenalty"/> for a slow route, and
        /// nothing otherwise.
        /// </summary>
        public static int GrowthPenalty(TrafficResult result)
        {
            return result == TrafficResult.SlowRoute ? SlowTripPenalty : 0;
        }

        // Adds the trip's traffic to the block of every tile its route goes over by road, in order, a level crossing's
        // included. The original also pointed the traffic helicopter at a road whose block it took to the heaviest
        // traffic, now and then; the helicopter chooses its traffic as it takes off (CopterSprite).
        private void AddToTrafficDensityMap(BlockMaps blockMaps)
        {
            foreach (RouteStep step in _route)
            {
                if (step.Mode == TravelMode.Road)
                {
                    Add(blockMaps.TrafficDensityMap, step.Tile, TripTraffic, MaxTrafficDensity);
                }
            }
        }

        // Adds each ride's riders to every tile of rail it rides, in order, to the tile's load the way the ride goes
        // there (RailLoadEntered): by the side its step onto the tile goes in by, or on the station it gets on at, which
        // it enters from no tile of track, the side facing the one it leaves by
        private void AddToRailLoadMap(BlockMaps blockMaps)
        {
            for (int i = 0; i < _route.Count; i++)
            {
                RouteStep step = _route[i];

                if (step.Mode != TravelMode.Rail)
                {
                    continue;
                }

                // A ride has two tiles at least, so the station it gets on at has a tile after it
                bool boards = i == 0 || _route[i - 1].Mode != TravelMode.Rail;
                int enteredBy = boards
                    ? TileUtils.SideEnteredBy(step.Tile, _route[i + 1].Tile)
                    : TileUtils.SideEnteredBy(_route[i - 1].Tile, step.Tile);
                int ends = TileUtils.RailEnds(_map.GetTileValue(step.Tile.X, step.Tile.Y));

                Add(RailLoadEntered(blockMaps, ends, enteredBy), step.Tile, RideLoad, MaxRailLoad);
            }
        }

        /// <summary>
        /// The rail load a ride adds to on a tile, and is held back by, going in by the side given, numbered as
        /// <see cref="TileUtils.NorthSide"/> says, of a track whose ends are those given, as
        /// <see cref="TileUtils.RailEnds"/> gives them: the load of the riders who entered it from the north or west, or
        /// that of those who entered it from the south or east (<see cref="TileUtils.EntersFromNorthOrWest"/>).
        /// </summary>
        public static BlockMap RailLoadEntered(BlockMaps blockMaps, int ends, int side)
        {
            return blockMaps.RailLoad(TileUtils.EntersFromNorthOrWest(ends, side));
        }

        /// <summary>
        /// Each tile's rail load its busier way, against the capacity of one, as the Rail load overlay shows it: a new
        /// map, which the rules never read.
        /// </summary>
        public static BlockMap BusierRailLoadMap(BlockMaps blockMaps)
        {
            BlockMap fromNorthOrWest = blockMaps.RailLoadFromNorthOrWestMap;
            BlockMap fromSouthOrEast = blockMaps.RailLoadFromSouthOrEastMap;
            BlockMap busier = new BlockMap(fromNorthOrWest.Width, fromNorthOrWest.Height, 1, 0, MaxRailLoad);

            for (int y = 0; y < busier.Height; y++)
            {
                for (int x = 0; x < busier.Width; x++)
                {
                    busier.Set(x, y, Math.Max(fromNorthOrWest.Get(x, y), fromSouthOrEast.Get(x, y)));
                }
            }

            return busier;
        }

        private static void Add(BlockMap map, Position tile, int added, int most)
        {
            map.WorldSet(tile.X, tile.Y, Math.Min(map.WorldGet(tile.X, tile.Y) + added, most));
        }

        /// <summary>
        /// A road or rail on the perimeter of the zone centred at <paramref name="position"/>, the first clockwise, or
        /// <see langword="null"/> if there is none.
        /// </summary>
        public Position? FindPerimeterRoad(Position position)
        {
            for (int i = 0; i < PerimX.Length; i++)
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
    }
}
