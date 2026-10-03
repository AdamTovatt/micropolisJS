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
    /// The wire tool, as <c>src/wireTool.js</c> and the original's <c>layWire</c>: a power line on dirt, one under
    /// water beside a conductor it can join, and a crossing over a straight road or rail.
    /// </summary>
    internal sealed class WireTool : ConnectingTool
    {
        // What a line under water costs
        private const long UnderwaterCost = 25;

        public WireTool(GameMap map)
            : base(5, map)
        {
        }

        public override void DoTool(int x, int y, RandomStream random, bool autoBulldoze)
        {
            Result = LayWire(x, y, autoBulldoze);
        }

        private Outcome LayWire(int x, int y, bool autoBulldoze)
        {
            if (autoBulldoze)
            {
                DoAutoBulldoze(x, y);
            }

            long cost = ToolCost;

            switch (TileUtils.NormalizeRoad(WorldEffects.GetTileValue(x, y)))
            {
                case TileValues.DIRT:
                    WorldEffects.SetTile(x, y, TileValues.LHPOWER, TileFlags.CONDBIT | TileFlags.BURNBIT | TileFlags.BULLBIT);
                    break;

                case TileValues.RIVER:
                case TileValues.REDGE:
                case TileValues.CHANNEL:
                    cost = UnderwaterCost;

                    if (!LayUnderwater(x, y))
                    {
                        return Outcome.Failed;
                    }

                    break;

                case TileValues.ROADS:
                    WorldEffects.SetTile(x, y, TileValues.HROADPOWER, TileFlags.CONDBIT | TileFlags.BURNBIT | TileFlags.BULLBIT);
                    break;

                case TileValues.ROADS2:
                    WorldEffects.SetTile(x, y, TileValues.VROADPOWER, TileFlags.CONDBIT | TileFlags.BURNBIT | TileFlags.BULLBIT);
                    break;

                case TileValues.LHRAIL:
                    WorldEffects.SetTile(x, y, TileValues.RAILHPOWERV, TileFlags.CONDBIT | TileFlags.BURNBIT | TileFlags.BULLBIT);
                    break;

                case TileValues.LVRAIL:
                    WorldEffects.SetTile(x, y, TileValues.RAILVPOWERH, TileFlags.CONDBIT | TileFlags.BURNBIT | TileFlags.BULLBIT);
                    break;

                default:
                    return Outcome.Failed;
            }

            AddCost(cost);
            CheckZoneConnections(x, y);
            return Outcome.Ok;
        }

        // Lays a line under the water at (x, y) when a conductor it can join lies to the right, the left, below or
        // above, in that order of looking, and answers whether it did
        private bool LayUnderwater(int x, int y)
        {
            if (x < Map.Width - 1 && WireJoinsHorizontally(WorldEffects.GetTile(x + 1, y)))
            {
                WorldEffects.SetTile(x, y, TileValues.VPOWER, TileFlags.CONDBIT | TileFlags.BULLBIT);
                return true;
            }

            if (x > 0 && WireJoinsHorizontally(WorldEffects.GetTile(x - 1, y)))
            {
                WorldEffects.SetTile(x, y, TileValues.VPOWER, TileFlags.CONDBIT | TileFlags.BULLBIT);
                return true;
            }

            if (y < Map.Height - 1 && WireJoinsVertically(WorldEffects.GetTile(x, y + 1)))
            {
                WorldEffects.SetTile(x, y, TileValues.HPOWER, TileFlags.CONDBIT | TileFlags.BULLBIT);
                return true;
            }

            if (y > 0 && WireJoinsVertically(WorldEffects.GetTile(x, y - 1)))
            {
                WorldEffects.SetTile(x, y, TileValues.HPOWER, TileFlags.CONDBIT | TileFlags.BULLBIT);
                return true;
            }

            return false;
        }
    }
}
