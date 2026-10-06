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
        /// The sides of the tile its track leaves by, a bit <c>1 &lt;&lt; d</c> for each, d being 0 north, 1 east, 2 south
        /// and 3 west, as the rail tool draws each piece: a straight piece, a bridge, a crossing of road or a power line
        /// and a station two opposite sides, a curve two sides that meet, a junction three and a cross all four. Not
        /// rail, none.
        /// </summary>
        public static int RailEnds(int tileValue)
        {
            const int north = 1;
            const int east = 2;
            const int south = 4;
            const int west = 8;

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
        /// Whether the tile value is water: the river, its edges and the channel. A bridge, or a wire or rail over
        /// water, is not, nor is the -1 a sprite reads off the map.
        /// </summary>
        public static bool IsWater(int tileValue)
        {
            return tileValue >= TileValues.WATER_LOW && tileValue <= TileValues.WATER_HIGH;
        }

        /// <summary>
        /// Whether a car drives on the tile: road, a road bridge, or road crossing rail or a power line. A trip the
        /// traffic rule routes may also ride rail (<see cref="CarriesTrains(int)"/>), which no car does.
        /// </summary>
        public static bool CarriesCars(int tileValue)
        {
            return IsRoadway(tileValue) || tileValue == TileValues.HRAILROAD || tileValue == TileValues.VRAILROAD;
        }

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
