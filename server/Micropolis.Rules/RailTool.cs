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
    /// The rail tool, as the original's <c>layRail</c>: rail on dirt, a tunnel under water
    /// beside a rail that leads into it, and a crossing over a straight power line or road.
    /// </summary>
    internal sealed class RailTool : LayingTool
    {
        public RailTool(GameMap map)
            : base(20, map)
        {
        }

        // What a tunnel costs
        protected override long WaterCost => 100;

        // The tile with any road it carries taken out
        protected override Piece? PieceOn(int tileValue)
        {
            return TileUtils.NormalizeRoad(tileValue) switch
            {
                TileValues.DIRT => new Piece(TileValues.LHRAIL, TileFlags.BLBNBIT),
                TileValues.LHPOWER => new Piece(TileValues.RAILVPOWERH, TileFlags.BLBNCNBIT),
                TileValues.LVPOWER => new Piece(TileValues.RAILHPOWERV, TileFlags.BLBNCNBIT),
                TileValues.ROADS => new Piece(TileValues.VRAILROAD, TileFlags.BLBNBIT),
                TileValues.ROADS2 => new Piece(TileValues.HRAILROAD, TileFlags.BLBNBIT),
                _ => null,
            };
        }

        // A tunnel, when a rail leads into the water from the right, the left, below or above, in that order of
        // looking. The tests differ from side to side as the original's do.
        protected override bool LayOverWater(int x, int y)
        {
            if (NeighbourIs(x + 1, y, tile => tile == TileValues.RAILHPOWERV || tile == TileValues.HRAIL ||
                                              (tile >= TileValues.LHRAIL && tile <= TileValues.HRAILROAD)) ||
                NeighbourIs(x - 1, y, tile => tile == TileValues.RAILHPOWERV || tile == TileValues.HRAIL ||
                                              (tile > TileValues.VRAIL && tile < TileValues.VRAILROAD)))
            {
                WorldEffects.SetTile(x, y, TileValues.HRAIL, TileFlags.BULLBIT);
                return true;
            }

            if (NeighbourIs(x, y + 1, tile => tile == TileValues.RAILVPOWERH || tile == TileValues.VRAILROAD ||
                                              (tile > TileValues.HRAIL && tile < TileValues.HRAILROAD)) ||
                NeighbourIs(x, y - 1, tile => tile == TileValues.RAILVPOWERH || tile == TileValues.VRAILROAD ||
                                              (tile > TileValues.HRAIL && tile < TileValues.HRAILROAD)))
            {
                WorldEffects.SetTile(x, y, TileValues.VRAIL, TileFlags.BULLBIT);
                return true;
            }

            return false;
        }
    }
}
