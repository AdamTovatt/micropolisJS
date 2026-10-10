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
    /// The bulldozer, as the original's <c>bulldozerTool</c>: it blows a zone up into
    /// rubble from any of its tiles, and dozes anything else bulldozable to dirt, or back to water where it spans
    /// water, but a rail station, which the original never had, back to the rail it stood on. A tile holding walkway,
    /// which the original never had either, loses it all first, keeping what lies under it.
    /// </summary>
    /// <remarks>
    /// The original's tool also makes the explosion sounds, which this one leaves out: the simulation passes no sound
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

        // A tile holding walkway loses all of it to the bulldozer's hit, and keeps whatever lies under it, which the next
        // hit dozes
        protected override void DoTool(int x, int y, RandomStream random, bool autoBulldoze)
        {
            if (!Map.TestBounds(x, y))
            {
                Result = Outcome.Failed;
                return;
            }

            if (WorldEffects.GetWalkway(x, y) != 0)
            {
                WorldEffects.SetWalkway(x, y, 0);
                AddCost(BulldozerCost);
                Result = Outcome.Ok;
                return;
            }

            Tile tile = WorldEffects.GetTile(x, y);
            int tileValue = tile.GetValue();
            BigZone zone = tile.IsZone() ? new BigZone(ZoneUtils.CheckZoneSize(tileValue), 0, 0) : ZoneUtils.CheckBigZone(tileValue);

            if (zone.ZoneSize > 0)
            {
                AddCost(BulldozerCost);

                // The zone sizes there are, 3, 4 and 6; any other leaves the zone standing, as the original's switch
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

        // Dozes a bulldozable tile: what spans water goes back to river, and anything else to dirt
        private Outcome LayDoze(int x, int y)
        {
            Tile tile = WorldEffects.GetTile(x, y);

            if (!tile.IsBulldozable())
            {
                return Outcome.Failed;
            }

            int value = TileUtils.NormalizeRoad(tile.GetValue());

            if (RoadTool.OverWater(value) || RailTool.OverWater(value) || WireTool.OverWater(value))
            {
                WorldEffects.SetTile(x, y, TileValues.RIVER);
            }
            else if (TileUtils.IsRailStation(value))
            {
                // A station leaves the track it stood on, which the connections fixed after it join again
                WorldEffects.SetTile(x, y, TileUtils.TrackUnder(tile.GetValue()), TileFlags.BLBNBIT);
            }
            else
            {
                WorldEffects.SetTile(x, y, TileValues.DIRT);
            }

            AddCost(BulldozerCost);
            return Outcome.Ok;
        }
    }
}
