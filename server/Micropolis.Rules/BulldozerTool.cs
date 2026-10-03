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
    /// The bulldozer, as <c>src/bulldozerTool.js</c> and the original's <c>bulldozerTool</c>: it blows a zone up into
    /// rubble from any of its tiles, and dozes anything else bulldozable to dirt, or back to water where it spans
    /// water.
    /// </summary>
    /// <remarks>
    /// The TypeScript tool also emits the explosion sounds, which nothing listens to: the simulation passes no sound
    /// on.
    /// </remarks>
    internal sealed class BulldozerTool : ConnectingTool
    {
        // What dozing water costs on top of the tile, where it changes the tile
        private const long WaterCost = 5;

        public BulldozerTool(GameMap map)
            : base(10, map)
        {
        }

        public override void DoTool(int x, int y, RandomStream random, bool autoBulldoze)
        {
            if (!Map.TestBounds(x, y))
            {
                Result = Outcome.Failed;
                return;
            }

            Tile tile = WorldEffects.GetTile(x, y);
            int tileValue = tile.GetValue();
            BigZone zone = tile.IsZone() ? new BigZone(ZoneUtils.CheckZoneSize(tileValue), 0, 0) : ZoneUtils.CheckBigZone(tileValue);

            if (zone.ZoneSize > 0)
            {
                AddCost(BulldozerCost);

                // The zone sizes there are, 3, 4 and 6; any other leaves the zone standing, as the TypeScript's switch
                if (zone.ZoneSize is 3 or 4 or 6)
                {
                    PutRubble(x + zone.DeltaX - 1, y + zone.DeltaY - 1, zone.ZoneSize, random);
                }

                Result = Outcome.Ok;
                return;
            }

            // As connectTile's CONNECT_TILE_BULLDOZE in the original, which fixes the connections around the tile,
            // water or land, whether or not it could be dozed
            Outcome toolResult = LayDoze(x, y);
            CheckZoneConnections(x, y);

            if ((tileValue == TileValues.RIVER || tileValue == TileValues.REDGE || tileValue == TileValues.CHANNEL) &&
                tileValue != WorldEffects.GetTileValue(x, y))
            {
                AddCost(WaterCost);
            }

            Result = toolResult;
        }

        // Turns each tile of the square that is neither radioactive nor dirt into a small explosion, its frame drawn
        // from the stream, column by column
        private void PutRubble(int left, int top, int size, RandomStream random)
        {
            for (int x = left; x < left + size; x++)
            {
                for (int y = top; y < top + size; y++)
                {
                    if (Map.TestBounds(x, y))
                    {
                        int tile = WorldEffects.GetTileValue(x, y);

                        if (tile != TileValues.RADTILE && tile != TileValues.DIRT)
                        {
                            WorldEffects.SetTile(x, y, TileValues.TINYEXP + random.GetRandom(2), TileFlags.ANIMBIT | TileFlags.BULLBIT);
                        }
                    }
                }
            }
        }

        // Dozes a bulldozable tile: what spans water goes back to river, and anything else to dirt
        private Outcome LayDoze(int x, int y)
        {
            Tile tile = WorldEffects.GetTile(x, y);

            if (!tile.IsBulldozable())
            {
                return Outcome.Failed;
            }

            switch (TileUtils.NormalizeRoad(tile.GetValue()))
            {
                case TileValues.HBRIDGE:
                case TileValues.VBRIDGE:
                case TileValues.BRWV:
                case TileValues.BRWH:
                case TileValues.HBRDG0:
                case TileValues.HBRDG1:
                case TileValues.HBRDG2:
                case TileValues.HBRDG3:
                case TileValues.VBRDG0:
                case TileValues.VBRDG1:
                case TileValues.VBRDG2:
                case TileValues.VBRDG3:
                case TileValues.HPOWER:
                case TileValues.VPOWER:
                case TileValues.HRAIL:
                case TileValues.VRAIL:
                    WorldEffects.SetTile(x, y, TileValues.RIVER);
                    break;

                default:
                    WorldEffects.SetTile(x, y, TileValues.DIRT);
                    break;
            }

            AddCost(BulldozerCost);
            return Outcome.Ok;
        }
    }
}
