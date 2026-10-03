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
    /// The road tool, as <c>src/roadTool.js</c> and the original's <c>layRoad</c>: road on dirt, a bridge over water
    /// beside a road that leads onto it, and a crossing over a straight power line or rail.
    /// </summary>
    internal sealed class RoadTool : ConnectingTool
    {
        // What a bridge costs
        private const long BridgeCost = 50;

        public RoadTool(GameMap map)
            : base(10, map)
        {
        }

        public override void DoTool(int x, int y, RandomStream random, bool autoBulldoze)
        {
            Result = LayRoad(x, y, autoBulldoze);
        }

        private Outcome LayRoad(int x, int y, bool autoBulldoze)
        {
            if (autoBulldoze)
            {
                DoAutoBulldoze(x, y);
            }

            long cost = ToolCost;

            switch (WorldEffects.GetTileValue(x, y))
            {
                case TileValues.DIRT:
                    WorldEffects.SetTile(x, y, TileValues.ROADS, TileFlags.BULLBIT | TileFlags.BURNBIT);
                    break;

                case TileValues.RIVER:
                case TileValues.REDGE:
                case TileValues.CHANNEL:
                    cost = BridgeCost;

                    if (!LayBridge(x, y))
                    {
                        return Outcome.Failed;
                    }

                    break;

                case TileValues.LHPOWER:
                    WorldEffects.SetTile(x, y, TileValues.VROADPOWER, TileFlags.CONDBIT | TileFlags.BURNBIT | TileFlags.BULLBIT);
                    break;

                case TileValues.LVPOWER:
                    WorldEffects.SetTile(x, y, TileValues.HROADPOWER, TileFlags.CONDBIT | TileFlags.BURNBIT | TileFlags.BULLBIT);
                    break;

                case TileValues.LHRAIL:
                    WorldEffects.SetTile(x, y, TileValues.HRAILROAD, TileFlags.BURNBIT | TileFlags.BULLBIT);
                    break;

                case TileValues.LVRAIL:
                    WorldEffects.SetTile(x, y, TileValues.VRAILROAD, TileFlags.BURNBIT | TileFlags.BULLBIT);
                    break;

                default:
                    return Outcome.Failed;
            }

            AddCost(cost);
            CheckZoneConnections(x, y);
            return Outcome.Ok;
        }

        // Lays a bridge over the water at (x, y) when a road leads onto it from the right, the left, below or above, in
        // that order of looking, and answers whether it did. The tests differ from side to side as the original's do.
        private bool LayBridge(int x, int y)
        {
            if (x < Map.Width - 1)
            {
                int tile = TileUtils.NormalizeRoad(WorldEffects.GetTileValue(x + 1, y));

                if (tile == TileValues.VRAILROAD || tile == TileValues.HBRIDGE ||
                    (tile >= TileValues.ROADS && tile <= TileValues.HROADPOWER))
                {
                    WorldEffects.SetTile(x, y, TileValues.HBRIDGE, TileFlags.BULLBIT);
                    return true;
                }
            }

            if (x > 0)
            {
                int tile = TileUtils.NormalizeRoad(WorldEffects.GetTileValue(x - 1, y));

                if (tile == TileValues.VRAILROAD || tile == TileValues.HBRIDGE ||
                    (tile >= TileValues.ROADS && tile <= TileValues.INTERSECTION))
                {
                    WorldEffects.SetTile(x, y, TileValues.HBRIDGE, TileFlags.BULLBIT);
                    return true;
                }
            }

            if (y < Map.Height - 1)
            {
                int tile = TileUtils.NormalizeRoad(WorldEffects.GetTileValue(x, y + 1));

                if (tile == TileValues.HRAILROAD || tile == TileValues.VROADPOWER ||
                    (tile >= TileValues.VBRIDGE && tile <= TileValues.INTERSECTION))
                {
                    WorldEffects.SetTile(x, y, TileValues.VBRIDGE, TileFlags.BULLBIT);
                    return true;
                }
            }

            if (y > 0)
            {
                int tile = TileUtils.NormalizeRoad(WorldEffects.GetTileValue(x, y - 1));

                if (tile == TileValues.HRAILROAD || tile == TileValues.VROADPOWER ||
                    (tile >= TileValues.VBRIDGE && tile <= TileValues.INTERSECTION))
                {
                    WorldEffects.SetTile(x, y, TileValues.VBRIDGE, TileFlags.BULLBIT);
                    return true;
                }
            }

            return false;
        }
    }
}
