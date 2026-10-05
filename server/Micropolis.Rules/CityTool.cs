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
    /// A tool that changes the city: <see cref="DoTool"/> stages its edits at a tile and sets <see cref="Result"/>, and
    /// <see cref="ModifyIfEnoughFunding"/> applies them if the budget can pay.
    /// </summary>
    internal abstract class CityTool
    {
        // What dozing one tile costs, wherever a tool dozes it
        protected const long BulldozerCost = 1;

        private long _applicationCost;

        protected CityTool(long toolCost, GameMap map)
        {
            ToolCost = toolCost;
            Map = map;
            WorldEffects = new WorldEffects(map);
        }

        /// <summary>
        /// What the tool costs at a tile, before any bulldozing or the extra a bridge costs.
        /// </summary>
        public long ToolCost { get; }

        /// <summary>
        /// What came of the tool at the last tile it was applied at, as a tool command's outcome names it, which
        /// <see cref="ModifyIfEnoughFunding"/> may turn into <see cref="Outcome.NoMoney"/>. A tool never comes to
        /// <see cref="Outcome.Rejected"/>, which only a command's validation gives.
        /// </summary>
        public Outcome Result { get; protected set; }

        protected GameMap Map { get; }

        protected WorldEffects WorldEffects { get; }

        /// <summary>
        /// Stages the tool's edits at tile (x, y) and sets <see cref="Result"/>. <paramref name="random"/> is the
        /// simulation's stream, which the tools that make a random choice draw from, and
        /// <paramref name="autoBulldoze"/> is the sending player's setting, which the building, road, rail and wire
        /// tools read.
        /// </summary>
        public abstract void DoTool(int x, int y, RandomStream random, bool autoBulldoze);

        /// <summary>
        /// Applies the edits staged and charges the budget for them, if the tool succeeded and the city can pay;
        /// otherwise drops them, and a tool the city can't pay for fails with <see cref="Outcome.NoMoney"/>.
        /// </summary>
        public bool ModifyIfEnoughFunding(Budget budget)
        {
            if (Result != Outcome.Ok)
            {
                Clear();
                return false;
            }

            if (budget.TotalFunds < _applicationCost)
            {
                Result = Outcome.NoMoney;
                Clear();
                return false;
            }

            WorldEffects.Apply();
            budget.Spend(_applicationCost);
            Clear();
            return true;
        }

        protected void AddCost(long cost)
        {
            _applicationCost += cost;
        }

        /// <summary>
        /// Clears the tile for the road, rail and wire tools, as the original's <c>connectTile</c> auto-bulldozes: a
        /// bulldozable tile that is a small explosion, or below the bridges and not dirt, becomes dirt for
        /// <see cref="BulldozerCost"/>.
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

        private void Clear()
        {
            _applicationCost = 0;
            WorldEffects.Clear();
        }
    }
}
