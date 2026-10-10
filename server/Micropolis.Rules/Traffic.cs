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
        /// <summary>
        /// No way out of the zone: no road, station or walkway at its edge, none within a walk across open land of it,
        /// and no destination that walk reaches; the original's trip found no road.
        /// </summary>
        NoWayOut = -1,
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

        // The side of each tile of the perimeter that faces the zone, numbered as TileUtils.NorthSide says
        private static readonly int[] PerimFacing =
        [
            TileUtils.SouthSide, TileUtils.SouthSide, TileUtils.SouthSide, TileUtils.WestSide, TileUtils.WestSide, TileUtils.WestSide,
            TileUtils.NorthSide, TileUtils.NorthSide, TileUtils.NorthSide, TileUtils.EastSide, TileUtils.EastSide, TileUtils.EastSide,
        ];

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
        /// The most walkers a crossing's tile holds (<see cref="BlockMaps.FootLoadMap"/>): decayed as the traffic
        /// density is, so from as high.
        /// </summary>
        public const int MaxFootLoad = MaxTrafficDensity;

        /// <summary>
        /// The walkers one walk adds to the tile of each crossing it walks over, as a ride adds its riders to the rail.
        /// </summary>
        public const int WalkLoad = RideLoad;

        /// <summary>
        /// What a slow route takes from its zone's growth score, which the original, with no slow trips, never took.
        /// </summary>
        public const int SlowTripPenalty = 300;

        private readonly GameMap _map;
        private readonly RandomStream _random;
        private readonly Trips _trips;
        private readonly TripRouter _router;

        // The trip's route: every tile of it, in order, from the perimeter tile it started on, with how it went over each
        private readonly TripRoute _route = new TripRoute();

        // The ninths a walk of the route goes through, kept from walk to walk
        private readonly List<Position> _walked = new List<Position>();

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
        /// kind given, and if it finds one, counts it in the traffic density map where it goes by road, in the rail load
        /// where it rides, and in the foot load where it walks over a crossing.
        /// </summary>
        public TrafficResult MakeTraffic(int x, int y, BlockMaps blockMaps, TrafficDestination destination)
        {
            TrafficResult result = _router.Route(new Position(x, y), destination, blockMaps, _random, _route);

            if (result is TrafficResult.RouteFound or TrafficResult.SlowRoute)
            {
                _trips.Routed(_route);
                AddToTrafficDensityMap(blockMaps);
                AddToRailLoadMap(blockMaps);
                AddToFootLoadMap(blockMaps);
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
            foreach (RouteStep step in _route.Steps)
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
            List<RouteStep> route = _route.Steps;

            for (int i = 0; i < route.Count; i++)
            {
                RouteStep step = route[i];

                if (step.Mode != TravelMode.Rail)
                {
                    continue;
                }

                // A ride has two tiles at least, so the station it gets on at has a tile after it
                bool boards = i == 0 || route[i - 1].Mode != TravelMode.Rail;
                int enteredBy = boards
                    ? TileUtils.SideEnteredBy(step.Tile, route[i + 1].Tile)
                    : TileUtils.SideEnteredBy(route[i - 1].Tile, step.Tile);
                int ends = TileUtils.RailEnds(_map.GetTileValue(step.Tile.X, step.Tile.Y));

                Add(RailLoadEntered(blockMaps, ends, enteredBy), step.Tile, RideLoad, MaxRailLoad);
            }
        }

        // Adds each walk's walkers to the tile of each crossing it walks over, once a tile: going over the ninths the
        // client draws its walker through (WalkPaths), so a walk along a sidewalk beside a crossing, on the same piece of
        // walkway, crosses nothing. Only a walk with a tile a car drives on is worked out.
        private void AddToFootLoadMap(BlockMaps blockMaps)
        {
            List<RouteStep> route = _route.Steps;
            int start = 0;

            for (int i = 1; i <= route.Count; i++)
            {
                if (i < route.Count && route[i].Mode == route[start].Mode)
                {
                    continue;
                }

                if (route[start].Mode == TravelMode.Walk && CrossesRoad(route, start, i))
                {
                    WalkPaths.Fill(_route, start, i, _walked);
                    AddCrossings(blockMaps);
                }

                start = i;
            }
        }

        // Whether a car drives on any tile of the route from start up to end
        private bool CrossesRoad(List<RouteStep> route, int start, int end)
        {
            for (int i = start; i < end; i++)
            {
                if (TileUtils.CarriesCars(_map.GetTileValue(route[i].Tile.X, route[i].Tile.Y)))
                {
                    return true;
                }
            }

            return false;
        }

        // Adds a walk's walkers, through the ninths walked, to the tile of each crossing among them, once a tile
        private void AddCrossings(BlockMaps blockMaps)
        {
            Position counted = new Position(-1, -1);

            foreach (Position ninth in _walked)
            {
                (int x, int y, int n) = Walkways.Locate(ninth.X, ninth.Y);
                Position tile = new Position(x, y);
                if (tile != counted && (Walkways.Crossings(_map.GetWalkway(x, y), _map.GetTileValue(x, y)) & (1 << n)) != 0)
                {
                    Add(blockMaps.FootLoadMap, tile, WalkLoad, MaxFootLoad);
                    counted = tile;
                }
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
        /// Whether the zone centred at <paramref name="position"/> has a way out at its edge: a road or rail on its
        /// perimeter (<see cref="FindPerimeterRoad"/>), or a walkway on a ninth of a tile of its perimeter along the side
        /// facing the zone, which gives the zone access as a road there does.
        /// </summary>
        public bool HasWayAtEdge(Position position)
        {
            if (FindPerimeterRoad(position) is not null)
            {
                return true;
            }

            foreach ((Position tile, int facing) in PerimeterFacing(_map, position))
            {
                if (LeadsOut(Walkways.UsableMask(_map.GetWalkway(tile.X, tile.Y), _map.GetTileValue(tile.X, tile.Y)), facing))
                {
                    return true;
                }
            }

            return false;
        }

        /// <summary>
        /// Whether ninths of walkway on a tile of a zone's perimeter, the walker's to use, lead out of the zone: one of them
        /// lies along the tile's side facing it, numbered as <see cref="TileUtils.NorthSide"/> says.
        /// </summary>
        internal static bool LeadsOut(int ninths, int facing)
        {
            return Walkways.Edge(ninths, facing) != 0;
        }

        /// <summary>
        /// The tiles on the perimeter of the zone centred at <paramref name="position"/> that are on the map, in the
        /// order <see cref="FindPerimeterRoad"/> searches them for a road.
        /// </summary>
        public static IReadOnlyList<Position> Perimeter(GameMap map, Position position)
        {
            return PerimeterFacing(map, position).Select(tile => tile.Tile).ToList();
        }

        /// <summary>
        /// The tiles on the perimeter of the zone centred at <paramref name="position"/> that are on the map, in the
        /// order <see cref="Perimeter"/> gives them, each with its side that faces the zone, numbered as
        /// <see cref="TileUtils.NorthSide"/> says.
        /// </summary>
        public static IReadOnlyList<(Position Tile, int Facing)> PerimeterFacing(GameMap map, Position position)
        {
            List<(Position Tile, int Facing)> perimeter = new List<(Position Tile, int Facing)>();

            for (int i = 0; i < PerimX.Length; i++)
            {
                int xx = position.X + PerimX[i];
                int yy = position.Y + PerimY[i];

                if (map.TestBounds(xx, yy))
                {
                    perimeter.Add((new Position(xx, yy), PerimFacing[i]));
                }
            }

            return perimeter;
        }
    }
}
