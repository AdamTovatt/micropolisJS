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
    /// The tile predicates the handlers and the tools share. Each that takes a tile value also takes a tile, and reads
    /// its value.
    /// </summary>
    public static class TileUtils
    {
        public static bool CanBulldoze(int tileValue)
        {
            return (tileValue >= TileValues.FIRSTRIVEDGE && tileValue <= TileValues.LASTRUBBLE) ||
                   (tileValue >= TileValues.POWERBASE + 2 && tileValue <= TileValues.POWERBASE + 12) ||
                   (tileValue >= TileValues.TINYEXP && tileValue <= TileValues.LASTTINYEXP + 2);
        }

        public static bool CanBulldoze(Tile tile)
        {
            return CanBulldoze(tile.GetValue());
        }

        /// <summary>
        /// Whether the tile is water that no bulldozing can clear: river, its edge or channel, which
        /// <see cref="CanBulldoze(int)"/> refuses. The shore tiles after them can be bulldozed.
        /// </summary>
        public static bool IsOpenWater(int tileValue)
        {
            return tileValue >= TileValues.RIVER && tileValue <= TileValues.CHANNEL;
        }

        public static bool IsCommercial(int tileValue)
        {
            return tileValue >= TileValues.COMBASE && tileValue < TileValues.INDBASE;
        }

        public static bool IsCommercial(Tile tile)
        {
            return IsCommercial(tile.GetValue());
        }

        public static bool IsCommercialZone(Tile tile)
        {
            return tile.IsZone() && IsCommercial(tile);
        }

        /// <summary>
        /// Whether the tile is road or rail: one a car drives on (<see cref="CarriesCars(int)"/>), or one a train runs
        /// on (<see cref="CarriesTrains(int)"/>).
        /// </summary>
        public static bool IsDriveable(int tileValue)
        {
            return IsRoadway(tileValue) || CarriesTrains(tileValue);
        }

        /// <summary>
        /// Whether a train runs on the tile: rail, a rail bridge, rail crossing road or a power line, or a station. A
        /// trip the traffic rule routes rides it only from a station to a station (<see cref="TripRouter"/>).
        /// </summary>
        public static bool CarriesTrains(int tileValue)
        {
            return (tileValue >= TileValues.RAILHPOWERV && tileValue <= TileValues.LASTRAIL) || IsRailStation(tileValue);
        }

        /// <summary>
        /// Whether the tile is a rail station, either way the track runs through it.
        /// </summary>
        public static bool IsRailStation(int tileValue)
        {
            return tileValue is TileValues.HRAILSTATION or TileValues.VRAILSTATION;
        }

        /// <summary>
        /// The station a piece of rail takes, its track running the way the rail's does: only a straight piece, east and
        /// west or north and south, takes one; for any other tile, <see cref="TileValues.TILE_INVALID"/>.
        /// </summary>
        public static int StationOn(int tileValue)
        {
            return tileValue switch
            {
                TileValues.LHRAIL => TileValues.HRAILSTATION,
                TileValues.LVRAIL => TileValues.VRAILSTATION,
                _ => TileValues.TILE_INVALID,
            };
        }

        /// <summary>
        /// The straight rail a station stands on, which the bulldozer leaves of it.
        /// </summary>
        public static int TrackUnder(int station)
        {
            return station == TileValues.HRAILSTATION ? TileValues.LHRAIL : TileValues.LVRAIL;
        }

        /// <summary>
        /// A tile's north side, as the sides of a tile are numbered: each side d its way's index in
        /// <see cref="Direction.CardinalDirections"/>, 0 north, 1 east, 2 south and 3 west, so a step the way d goes
        /// out of a tile by its side d.
        /// </summary>
        public const int NorthSide = 0;

        /// <summary>
        /// A tile's east side, numbered as <see cref="NorthSide"/> says.
        /// </summary>
        public const int EastSide = 1;

        /// <summary>
        /// A tile's south side, numbered as <see cref="NorthSide"/> says.
        /// </summary>
        public const int SouthSide = 2;

        /// <summary>
        /// A tile's west side, numbered as <see cref="NorthSide"/> says.
        /// </summary>
        public const int WestSide = 3;

        /// <summary>
        /// The side facing the side given, numbered as <see cref="NorthSide"/> says: the side a step going out of a tile
        /// by the one goes into the tile beside by.
        /// </summary>
        public static int OppositeSide(int side)
        {
            return (side + 2) % 4;
        }

        /// <summary>
        /// The side of the tile <paramref name="to"/> that a step onto it from the tile beside it,
        /// <paramref name="from"/>, goes in by, numbered as <see cref="NorthSide"/> says.
        /// </summary>
        public static int SideEnteredBy(Position from, Position to)
        {
            if (to.Y != from.Y)
            {
                return to.Y < from.Y ? SouthSide : NorthSide;
            }

            return to.X > from.X ? WestSide : EastSide;
        }

        /// <summary>
        /// The sides of the tile its track leaves by, a bit <c>1 &lt;&lt; d</c> for each side d, numbered as
        /// <see cref="NorthSide"/> says, as the rail tool draws each piece: a straight piece, a bridge, a crossing of road
        /// or a power line and a station two opposite sides, a curve two sides that meet, a junction three and a cross
        /// all four. Not rail, none.
        /// </summary>
        public static int RailEnds(int tileValue)
        {
            const int north = 1 << NorthSide;
            const int east = 1 << EastSide;
            const int south = 1 << SouthSide;
            const int west = 1 << WestSide;

            return tileValue switch
            {
                TileValues.HRAIL or TileValues.LHRAIL or TileValues.HRAILROAD or TileValues.RAILHPOWERV => east | west,
                TileValues.VRAIL or TileValues.LVRAIL or TileValues.VRAILROAD or TileValues.RAILVPOWERH => north | south,
                TileValues.LVRAIL2 => north | east,
                TileValues.LVRAIL3 => east | south,
                TileValues.LVRAIL4 => south | west,
                TileValues.LVRAIL5 => north | west,
                TileValues.LVRAIL6 => north | east | west,
                TileValues.LVRAIL7 => north | east | south,
                TileValues.LVRAIL8 => east | south | west,
                TileValues.LVRAIL9 => north | south | west,
                TileValues.LVRAIL10 => north | east | south | west,
                TileValues.HRAILSTATION or TileValues.VRAILSTATION => RailEnds(TrackUnder(tileValue)),
                _ => 0,
            };
        }

        /// <summary>
        /// The ends of a tile's track, given as <see cref="RailEnds"/> gives them, that a ride entering by counts as
        /// entering from the north or west, a bit for each as <see cref="RailEnds"/> gives them; entering by any other end
        /// counts as from the south or east. Each way has a track of its own (<see cref="BlockMaps.RailLoad"/>), so the
        /// two ways through a tile must never count alike. Entering by the north or the west end counts as from the north
        /// or west, so a ride going south or east as it enters keeps to one track and one going north or west to the
        /// other, on a straight piece, a bridge, a crossing, a station, a junction and the cross alike. On the two curves
        /// whose ends are both north and west, or both south and east, the ride's way along the north-south end decides,
        /// since the two ends alone would count both ways alike: entering the north-west curve by its west end, a ride
        /// goes on north, and counts as from the south or east, and entering the south-east curve by its east end goes on
        /// south, and counts as from the north or west. A ride turning on a junction or the cross between its north and
        /// west ends, or between its south and east, counts as the ride the other way round does, as any count by the end
        /// entered alone must on a piece of three ends or more; the router knows only that end as it costs a tile.
        /// </summary>
        public static int RailEntriesFromNorthOrWest(int ends)
        {
            const int northAndWest = (1 << NorthSide) | (1 << WestSide);
            const int southAndEast = (1 << SouthSide) | (1 << EastSide);

            if (ends == northAndWest)
            {
                return 1 << NorthSide;
            }

            return ends == southAndEast ? 1 << EastSide : ends & northAndWest;
        }

        /// <summary>
        /// Whether a ride entering a tile by the side given, numbered as <see cref="NorthSide"/> says, counts as entering
        /// from the north or west, its track's ends given as <see cref="RailEnds"/> gives them
        /// (<see cref="RailEntriesFromNorthOrWest"/>).
        /// </summary>
        public static bool EntersFromNorthOrWest(int ends, int side)
        {
            return (RailEntriesFromNorthOrWest(ends) & (1 << side)) != 0;
        }

        /// <summary>
        /// Whether the tile value is water: the river, its edges and the channel. A bridge, or a wire or rail over
        /// water, is not, nor is the -1 a sprite reads off the map.
        /// </summary>
        public static bool IsWater(int tileValue)
        {
            return tileValue >= TileValues.WATER_LOW && tileValue <= TileValues.WATER_HIGH;
        }

        /// <summary>
        /// Whether the tile is a bridge: a road bridge, closed with any traffic on it or an open drawbridge's middle
        /// tile, which the roads' decay turns back into water, or rail laid over water.
        /// </summary>
        public static bool IsBridge(int tileValue)
        {
            int shape = (tileValue - TileValues.ROADBASE) % RoadShapes;
            return (IsRoadway(tileValue) && (shape < 2 || shape == RoadShapes - 1)) ||
                tileValue is TileValues.HRAIL or TileValues.VRAIL;
        }

        /// <summary>
        /// Whether the tile is one of an open drawbridge's raised ends, which it writes over the bridge's road, or the
        /// water beside it, as it opens, and back as it closes.
        /// </summary>
        public static bool IsRaisedBridgeEnd(int tileValue)
        {
            return tileValue is >= TileValues.HBRDG0 and <= TileValues.HBRDG3 or >= TileValues.VBRDG0 and <= TileValues.VBRDG3;
        }

        /// <summary>
        /// Whether a car drives on the tile: road, a road bridge, or road crossing rail or a power line. A trip the
        /// traffic rule routes may also ride rail (<see cref="CarriesTrains(int)"/>), which no car does.
        /// </summary>
        public static bool CarriesCars(int tileValue)
        {
            return IsRoadway(tileValue) || tileValue == TileValues.HRAILROAD || tileValue == TileValues.VRAILROAD;
        }

        /// <summary>
        /// The sides of the tile its road leaves by, a bit <c>1 &lt;&lt; d</c> for each side d, numbered as
        /// <see cref="NorthSide"/> says, as the road tool joins roads: of the tiles a car drives on
        /// (<see cref="CarriesCars"/>), its traffic's by the plain road of its shape. Not road, none.
        /// </summary>
        public static int RoadEnds(int tileValue)
        {
            const int north = 1 << NorthSide;
            const int east = 1 << EastSide;
            const int south = 1 << SouthSide;
            const int west = 1 << WestSide;

            if (tileValue == TileValues.HRAILROAD)
            {
                return north | south;
            }

            if (tileValue == TileValues.VRAILROAD)
            {
                return east | west;
            }

            if (!IsRoadway(tileValue))
            {
                return 0;
            }

            // Each level of traffic and each frame of it repeats the sixteen shapes from the plain road's, but for the
            // sixteenth, the horizontal drawbridge in the plain road's place and the vertical one's frames in the rest
            return ((tileValue - TileValues.ROADBASE) % RoadShapes) switch
            {
                0 or 2 or 13 => east | west,
                1 or 3 or 14 => north | south,
                4 => north | east,
                5 => east | south,
                6 => south | west,
                7 => north | west,
                8 => north | east | west,
                9 => north | east | south,
                10 => east | south | west,
                11 => north | south | west,
                12 => north | east | south | west,
                _ => tileValue == TileValues.BRWH ? east | west : north | south,
            };
        }

        // The shapes of road from ROADBASE, which each level of traffic and each frame of it repeats
        private const int RoadShapes = 16;

        // Road, its bridges, its traffic and its crossings of power lines: the road tiles a trip runs on
        private static bool IsRoadway(int tileValue)
        {
            return tileValue >= TileValues.ROADBASE && tileValue <= TileValues.LASTROAD;
        }

        public static bool IsDriveable(Tile tile)
        {
            return IsDriveable(tile.GetValue());
        }

        /// <summary>
        /// Whether the tile is a house, one of those an empty residential zone grows round its centre.
        /// </summary>
        public static bool IsHouse(int tileValue)
        {
            return tileValue >= TileValues.LHTHR && tileValue <= TileValues.HHTHR;
        }

        public static bool IsFire(int tileValue)
        {
            return tileValue >= TileValues.FIREBASE && tileValue < TileValues.ROADBASE;
        }

        public static bool IsFire(Tile tile)
        {
            return IsFire(tile.GetValue());
        }

        public static bool IsFlood(int tileValue)
        {
            return tileValue >= TileValues.FLOOD && tileValue < TileValues.LASTFLOOD;
        }

        public static bool IsFlood(Tile tile)
        {
            return IsFlood(tile.GetValue());
        }

        public static bool IsIndustrial(int tileValue)
        {
            return tileValue >= TileValues.INDBASE && tileValue < TileValues.PORTBASE;
        }

        public static bool IsIndustrial(Tile tile)
        {
            return IsIndustrial(tile.GetValue());
        }

        public static bool IsIndustrialZone(Tile tile)
        {
            return tile.IsZone() && IsIndustrial(tile);
        }

        public static bool IsManualExplosion(int tileValue)
        {
            return tileValue >= TileValues.TINYEXP && tileValue <= TileValues.LASTTINYEXP;
        }

        public static bool IsManualExplosion(Tile tile)
        {
            return IsManualExplosion(tile.GetValue());
        }

        /// <summary>
        /// Whether the tile is one the rail handler counts, wears and keeps: the rail tiles, and a station, which is
        /// rail for its upkeep, its funding and its wear.
        /// </summary>
        public static bool IsRail(int tileValue)
        {
            return (tileValue >= TileValues.RAILBASE && tileValue < TileValues.RESBASE) || IsRailStation(tileValue);
        }

        public static bool IsRail(Tile tile)
        {
            return IsRail(tile.GetValue());
        }

        /// <summary>
        /// Whether a tile of the value is a park, as the park tool lays one: its trees or its fountain. The wild woods
        /// are not.
        /// </summary>
        public static bool IsPark(int tileValue)
        {
            return (tileValue >= TileValues.WOODS2 && tileValue <= TileValues.WOODS5) || tileValue == TileValues.FOUNTAIN;
        }

        public static bool IsResidential(int tileValue)
        {
            return tileValue >= TileValues.RESBASE && tileValue < TileValues.HOSPITALBASE;
        }

        public static bool IsResidential(Tile tile)
        {
            return IsResidential(tile.GetValue());
        }

        public static bool IsResidentialZone(Tile tile)
        {
            return tile.IsZone() && IsResidential(tile);
        }

        public static bool IsRoad(int tileValue)
        {
            return tileValue >= TileValues.ROADBASE && tileValue < TileValues.POWERBASE;
        }

        public static bool IsRoad(Tile tile)
        {
            return IsRoad(tile.GetValue());
        }

        /// <summary>
        /// One of the eight fire tiles, animated, picked by one draw.
        /// </summary>
        public static Tile RandomFire(RandomStream random)
        {
            return new Tile(TileValues.FIRE + (random.GetRandom16() & 7), TileFlags.ANIMBIT);
        }

        /// <summary>
        /// One of the four rubble tiles, bulldozable, picked by one draw.
        /// </summary>
        public static Tile RandomRubble(RandomStream random)
        {
            return new Tile(TileValues.RUBBLE + (random.GetRandom16() & 3), TileFlags.BULLBIT);
        }

        /// <summary>
        /// The tile a road, rail or wire piece is, with any road it carries taken out, as the original's
        /// <c>neutralizeRoad</c>: from the road tiles through the first past the last road, every sixteen tiles fold
        /// onto the sixteen from <see cref="TileValues.ROADBASE"/>.
        /// </summary>
        public static int NormalizeRoad(int tileValue)
        {
            return tileValue >= TileValues.ROADBASE && tileValue <= TileValues.LASTROAD + 1 ? (tileValue & 15) + 64 : tileValue;
        }
    }
}
