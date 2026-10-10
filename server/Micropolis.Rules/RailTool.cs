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
    /// The rail tool, as the original's <c>layRail</c>: rail on dirt, a tunnel under water
    /// beside a rail that leads into it, and a crossing over a straight power line or road.
    /// </summary>
    internal sealed class RailTool : LayingTool
    {
        /// <summary>
        /// The straight rail, across as the tool lays it on dirt and down as the connections turn it.
        /// </summary>
        public static readonly IReadOnlyList<Piece> Straight =
        [
            new Piece(TileValues.LHRAIL, TileFlags.BLBNBIT),
            new Piece(TileValues.LVRAIL, TileFlags.BLBNBIT),
        ];

        public RailTool(GameMap map)
            : base(20, map)
        {
        }

        // What a tunnel costs
        protected override long WaterCost => 100;

        protected override bool IsLine(int tileValue)
        {
            return tileValue >= TileValues.LHRAIL && tileValue <= TileValues.LVRAIL10;
        }

        protected override bool IsLineOverWater(int tileValue)
        {
            return OverWater(tileValue);
        }

        /// <summary>
        /// Whether a tile of the value is rail crossing water: a tunnel.
        /// </summary>
        public static bool OverWater(int tileValue)
        {
            return tileValue is TileValues.HRAIL or TileValues.VRAIL;
        }

        // The tile with any road it carries taken out
        protected override Piece? PieceOn(int tileValue)
        {
            return TileUtils.NormalizeRoad(tileValue) switch
            {
                TileValues.DIRT => Straight[0],
                TileValues.LHPOWER => new Piece(TileValues.RAILVPOWERH, TileFlags.BLBNCNBIT),
                TileValues.LVPOWER => new Piece(TileValues.RAILHPOWERV, TileFlags.BLBNCNBIT),
                TileValues.ROADS => new Piece(TileValues.VRAILROAD, TileFlags.BLBNBIT),
                TileValues.ROADS2 => new Piece(TileValues.HRAILROAD, TileFlags.BLBNBIT),
                _ => null,
            };
        }

        // A tunnel, when a rail leads into the water from the right, the left, below or above, in that order of
        // looking. The tests differ from side to side as the original's do; a station, which the original never had,
        // leads into the water along its track.
        protected override bool LayOverWater(int x, int y)
        {
            if (NeighbourIs(x + 1, y, tile => tile == TileValues.RAILHPOWERV || tile == TileValues.HRAIL ||
                                              (tile >= TileValues.LHRAIL && tile <= TileValues.HRAILROAD) ||
                                              tile == TileValues.HRAILSTATION) ||
                NeighbourIs(x - 1, y, tile => tile == TileValues.RAILHPOWERV || tile == TileValues.HRAIL ||
                                              (tile > TileValues.VRAIL && tile < TileValues.VRAILROAD) ||
                                              tile == TileValues.HRAILSTATION))
            {
                WorldEffects.SetTile(x, y, TileValues.HRAIL, TileFlags.BULLBIT);
                return true;
            }

            if (NeighbourIs(x, y + 1, tile => tile == TileValues.RAILVPOWERH || tile == TileValues.VRAILROAD ||
                                              (tile > TileValues.HRAIL && tile < TileValues.HRAILROAD) ||
                                              tile == TileValues.VRAILSTATION) ||
                NeighbourIs(x, y - 1, tile => tile == TileValues.RAILVPOWERH || tile == TileValues.VRAILROAD ||
                                              (tile > TileValues.HRAIL && tile < TileValues.HRAILROAD) ||
                                              tile == TileValues.VRAILSTATION))
            {
                WorldEffects.SetTile(x, y, TileValues.VRAIL, TileFlags.BULLBIT);
                return true;
            }

            return false;
        }
    }
}
