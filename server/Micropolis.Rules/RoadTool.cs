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
    /// The road tool, as the original's <c>layRoad</c>: road on dirt, a bridge over water
    /// beside a road that leads onto it, and a crossing over a straight power line or rail.
    /// </summary>
    internal sealed class RoadTool : LayingTool
    {
        public RoadTool(GameMap map)
            : base(10, map)
        {
        }

        // What a bridge costs
        protected override long WaterCost => 50;

        // The tile as it is, road and all
        protected override Piece? PieceOn(int tileValue)
        {
            return tileValue switch
            {
                TileValues.DIRT => new Piece(TileValues.ROADS, TileFlags.BLBNBIT),
                TileValues.LHPOWER => new Piece(TileValues.VROADPOWER, TileFlags.BLBNCNBIT),
                TileValues.LVPOWER => new Piece(TileValues.HROADPOWER, TileFlags.BLBNCNBIT),
                TileValues.LHRAIL => new Piece(TileValues.HRAILROAD, TileFlags.BLBNBIT),
                TileValues.LVRAIL => new Piece(TileValues.VRAILROAD, TileFlags.BLBNBIT),
                _ => null,
            };
        }

        // A bridge, when a road leads onto the water from the right, the left, below or above, in that order of
        // looking. The tests differ from side to side as the original's do.
        protected override bool LayOverWater(int x, int y)
        {
            if (NeighbourIs(x + 1, y, tile => tile == TileValues.VRAILROAD || tile == TileValues.HBRIDGE ||
                                              (tile >= TileValues.ROADS && tile <= TileValues.HROADPOWER)) ||
                NeighbourIs(x - 1, y, tile => tile == TileValues.VRAILROAD || tile == TileValues.HBRIDGE ||
                                              (tile >= TileValues.ROADS && tile <= TileValues.INTERSECTION)))
            {
                WorldEffects.SetTile(x, y, TileValues.HBRIDGE, TileFlags.BULLBIT);
                return true;
            }

            if (NeighbourIs(x, y + 1, tile => tile == TileValues.HRAILROAD || tile == TileValues.VROADPOWER ||
                                              (tile >= TileValues.VBRIDGE && tile <= TileValues.INTERSECTION)) ||
                NeighbourIs(x, y - 1, tile => tile == TileValues.HRAILROAD || tile == TileValues.VROADPOWER ||
                                              (tile >= TileValues.VBRIDGE && tile <= TileValues.INTERSECTION)))
            {
                WorldEffects.SetTile(x, y, TileValues.VBRIDGE, TileFlags.BULLBIT);
                return true;
            }

            return false;
        }
    }
}
