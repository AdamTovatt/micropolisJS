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
    /// The rail tool, as <c>src/railTool.js</c> and the original's <c>layRail</c>: rail on dirt, a tunnel under water
    /// beside a rail that leads into it, and a crossing over a straight power line or road.
    /// </summary>
    internal sealed class RailTool : ConnectingTool
    {
        // What a tunnel costs
        private const long TunnelCost = 100;

        public RailTool(GameMap map)
            : base(20, map)
        {
        }

        public override void DoTool(int x, int y, RandomStream random, bool autoBulldoze)
        {
            Result = LayRail(x, y, autoBulldoze);
        }

        private Outcome LayRail(int x, int y, bool autoBulldoze)
        {
            if (autoBulldoze)
            {
                DoAutoBulldoze(x, y);
            }

            long cost = ToolCost;

            switch (TileUtils.NormalizeRoad(WorldEffects.GetTileValue(x, y)))
            {
                case TileValues.DIRT:
                    WorldEffects.SetTile(x, y, TileValues.LHRAIL, TileFlags.BULLBIT | TileFlags.BURNBIT);
                    break;

                case TileValues.RIVER:
                case TileValues.REDGE:
                case TileValues.CHANNEL:
                    cost = TunnelCost;

                    if (!LayTunnel(x, y))
                    {
                        return Outcome.Failed;
                    }

                    break;

                case TileValues.LHPOWER:
                    WorldEffects.SetTile(x, y, TileValues.RAILVPOWERH, TileFlags.CONDBIT | TileFlags.BURNBIT | TileFlags.BULLBIT);
                    break;

                case TileValues.LVPOWER:
                    WorldEffects.SetTile(x, y, TileValues.RAILHPOWERV, TileFlags.CONDBIT | TileFlags.BURNBIT | TileFlags.BULLBIT);
                    break;

                case TileValues.ROADS:
                    WorldEffects.SetTile(x, y, TileValues.VRAILROAD, TileFlags.BURNBIT | TileFlags.BULLBIT);
                    break;

                case TileValues.ROADS2:
                    WorldEffects.SetTile(x, y, TileValues.HRAILROAD, TileFlags.BURNBIT | TileFlags.BULLBIT);
                    break;

                default:
                    return Outcome.Failed;
            }

            AddCost(cost);
            CheckZoneConnections(x, y);
            return Outcome.Ok;
        }

        // Lays a tunnel under the water at (x, y) when a rail leads into it from the right, the left, below or above,
        // in that order of looking, and answers whether it did. The tests differ from side to side as the original's
        // do.
        private bool LayTunnel(int x, int y)
        {
            if (x < Map.Width - 1)
            {
                int tile = TileUtils.NormalizeRoad(WorldEffects.GetTileValue(x + 1, y));

                if (tile == TileValues.RAILHPOWERV || tile == TileValues.HRAIL ||
                    (tile >= TileValues.LHRAIL && tile <= TileValues.HRAILROAD))
                {
                    WorldEffects.SetTile(x, y, TileValues.HRAIL, TileFlags.BULLBIT);
                    return true;
                }
            }

            if (x > 0)
            {
                int tile = TileUtils.NormalizeRoad(WorldEffects.GetTileValue(x - 1, y));

                if (tile == TileValues.RAILHPOWERV || tile == TileValues.HRAIL ||
                    (tile > TileValues.VRAIL && tile < TileValues.VRAILROAD))
                {
                    WorldEffects.SetTile(x, y, TileValues.HRAIL, TileFlags.BULLBIT);
                    return true;
                }
            }

            if (y < Map.Height - 1)
            {
                int tile = TileUtils.NormalizeRoad(WorldEffects.GetTileValue(x, y + 1));

                if (tile == TileValues.RAILVPOWERH || tile == TileValues.VRAILROAD ||
                    (tile > TileValues.HRAIL && tile < TileValues.HRAILROAD))
                {
                    WorldEffects.SetTile(x, y, TileValues.VRAIL, TileFlags.BULLBIT);
                    return true;
                }
            }

            if (y > 0)
            {
                int tile = TileUtils.NormalizeRoad(WorldEffects.GetTileValue(x, y - 1));

                if (tile == TileValues.RAILVPOWERH || tile == TileValues.VRAILROAD ||
                    (tile > TileValues.HRAIL && tile < TileValues.HRAILROAD))
                {
                    WorldEffects.SetTile(x, y, TileValues.VRAIL, TileFlags.BULLBIT);
                    return true;
                }
            }

            return false;
        }
    }
}
