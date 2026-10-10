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
    /// A tool that changes the city's tiles: <see cref="Apply"/> stages its edits at a tile and sets
    /// <see cref="StagedTool.Result"/>, and <see cref="StagedTool.ModifyIfEnoughFunding"/> applies them if the budget can
    /// pay.
    /// </summary>
    internal abstract class CityTool : StagedTool
    {
        protected CityTool(long toolCost, GameMap map)
            : base(map)
        {
            ToolCost = toolCost;
        }

        /// <summary>
        /// What the tool costs at a tile, before any bulldozing or the extra a bridge costs.
        /// </summary>
        public long ToolCost { get; }

        /// <summary>
        /// Stages the tool's edits at tile (x, y), as <see cref="DoTool"/> does, and then, as a zone or building placed
        /// over rubble clears it under auto-bulldoze: where a tile it stages takes no walkway (<see cref="Walkways.Takes"/>)
        /// and holds one, auto-bulldoze clears the walkway for <see cref="StagedTool.BulldozerCost"/> a tile, and without
        /// it the tool needs the bulldozer. A road or rail laid over walkway keeps it.
        /// </summary>
        public void Apply(int x, int y, RandomStream random, bool autoBulldoze)
        {
            DoTool(x, y, random, autoBulldoze);

            if (Result != Outcome.Ok)
            {
                return;
            }

            List<Position> cleared = WorldEffects.StagedTiles
                .Where(tile => !Walkways.Takes(WorldEffects.GetTileValue(tile.X, tile.Y)) && WorldEffects.GetWalkway(tile.X, tile.Y) != 0)
                .ToList();

            if (cleared.Count > 0 && !autoBulldoze)
            {
                Result = Outcome.NeedsBulldoze;
                return;
            }

            foreach (Position tile in cleared)
            {
                WorldEffects.SetWalkway(tile.X, tile.Y, 0);
                AddCost(BulldozerCost);
            }
        }

        /// <summary>
        /// Stages the tool's edits at tile (x, y) and sets <see cref="StagedTool.Result"/>. <paramref name="random"/> is
        /// the simulation's stream, which the tools that make a random choice draw from, and
        /// <paramref name="autoBulldoze"/> is the sending player's setting, which the building, road, rail and wire
        /// tools read.
        /// </summary>
        protected abstract void DoTool(int x, int y, RandomStream random, bool autoBulldoze);

        /// <summary>
        /// Clears the tile for the road, rail and wire tools, as the original's <c>connectTile</c> auto-bulldozes: a
        /// bulldozable tile that is a small explosion, or below the bridges and not dirt, becomes dirt for
        /// <see cref="StagedTool.BulldozerCost"/>.
        /// </summary>
        protected void DoAutoBulldoze(int x, int y)
        {
            Tile tile = WorldEffects.GetTile(x, y);

            if (tile.IsBulldozable())
            {
                int value = TileUtils.NormalizeRoad(tile.GetValue());

                if ((value >= TileValues.TINYEXP && value <= TileValues.LASTTINYEXP) ||
                    (value < TileValues.HBRIDGE && value != TileValues.DIRT))
                {
                    AddCost(BulldozerCost);
                    WorldEffects.SetTile(x, y, TileValues.DIRT);
                }
            }
        }

        /// <summary>
        /// Blows up a zone or building of <paramref name="size"/> by <paramref name="size"/> tiles whose top left tile
        /// is (left, top), as the bulldozer does: each tile of the square on the map that is neither radioactive nor
        /// dirt becomes a small explosion, its frame drawn from the stream, column by column.
        /// </summary>
        protected void PutRubble(int left, int top, int size, RandomStream random)
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
    }
}
