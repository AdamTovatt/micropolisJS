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
    /// The tile predicates of <c>src/tileUtils.js</c>, which the handlers and the tools share. Each that takes a tile
    /// value also takes a tile, and reads its value, as the original's <c>unwrapTile</c> lets it.
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

        public static bool IsDriveable(int tileValue)
        {
            return (tileValue >= TileValues.ROADBASE && tileValue <= TileValues.LASTROAD) ||
                   (tileValue >= TileValues.RAILHPOWERV && tileValue <= TileValues.LASTRAIL);
        }

        public static bool IsDriveable(Tile tile)
        {
            return IsDriveable(tile.GetValue());
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

        public static bool IsRail(int tileValue)
        {
            return tileValue >= TileValues.RAILBASE && tileValue < TileValues.RESBASE;
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
        /// One of the four fire tiles, animated, picked by one draw.
        /// </summary>
        public static Tile RandomFire(RandomStream random)
        {
            return new Tile(TileValues.FIRE + (random.GetRandom16() & 3), TileFlags.ANIMBIT);
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
