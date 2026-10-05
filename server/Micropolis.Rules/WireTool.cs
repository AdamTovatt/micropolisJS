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
    /// The wire tool, as the original's <c>layWire</c>: a power line on dirt, one under
    /// water beside a conductor it can join, and a crossing over a straight road or rail.
    /// </summary>
    internal sealed class WireTool : LayingTool
    {
        public WireTool(GameMap map)
            : base(5, map)
        {
        }

        // What a line under water costs
        protected override long WaterCost => 25;

        // The tile with any road it carries taken out
        protected override Piece? PieceOn(int tileValue)
        {
            return TileUtils.NormalizeRoad(tileValue) switch
            {
                TileValues.DIRT => new Piece(TileValues.LHPOWER, TileFlags.BLBNCNBIT),
                TileValues.ROADS => new Piece(TileValues.HROADPOWER, TileFlags.BLBNCNBIT),
                TileValues.ROADS2 => new Piece(TileValues.VROADPOWER, TileFlags.BLBNCNBIT),
                TileValues.LHRAIL => new Piece(TileValues.RAILHPOWERV, TileFlags.BLBNCNBIT),
                TileValues.LVRAIL => new Piece(TileValues.RAILVPOWERH, TileFlags.BLBNCNBIT),
                _ => null,
            };
        }

        // A line under the water, when a conductor it can join lies to the right, the left, below or above, in that
        // order of looking
        protected override bool LayOverWater(int x, int y)
        {
            if (WireJoins(x + 1, y, WireJoinsHorizontally) || WireJoins(x - 1, y, WireJoinsHorizontally))
            {
                WorldEffects.SetTile(x, y, TileValues.VPOWER, TileFlags.CONDBIT | TileFlags.BULLBIT);
                return true;
            }

            if (WireJoins(x, y + 1, WireJoinsVertically) || WireJoins(x, y - 1, WireJoinsVertically))
            {
                WorldEffects.SetTile(x, y, TileValues.HPOWER, TileFlags.CONDBIT | TileFlags.BULLBIT);
                return true;
            }

            return false;
        }

        private bool WireJoins(int x, int y, Func<Tile, bool> joins)
        {
            return Map.TestBounds(x, y) && joins(WorldEffects.GetTile(x, y));
        }
    }
}
