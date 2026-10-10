/* micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
 * Copyright (C) 2026 Adam Tovatt
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
    /// A tool whose edits are staged in <see cref="WorldEffects"/> with what they cost, and set <see cref="Result"/>,
    /// until <see cref="ModifyIfEnoughFunding"/> applies them if the budget can pay: a tool of the tile grid
    /// (<see cref="CityTool"/>) or of the walkways' ninths (<see cref="WalkwayTool"/>).
    /// </summary>
    internal abstract class StagedTool
    {
        /// <summary>
        /// What dozing one tile costs, wherever a tool dozes it.
        /// </summary>
        public const long BulldozerCost = 1;

        private long _applicationCost;

        protected StagedTool(GameMap map)
        {
            Map = map;
            WorldEffects = new WorldEffects(map);
        }

        /// <summary>
        /// What came of the tool at the last place it was applied at, as a command's outcome names it, which
        /// <see cref="ModifyIfEnoughFunding"/> may turn into <see cref="Outcome.NoMoney"/>. A tool never comes to
        /// <see cref="Outcome.Rejected"/>, which only a command's validation gives.
        /// </summary>
        public Outcome Result { get; protected set; }

        protected GameMap Map { get; }

        protected WorldEffects WorldEffects { get; }

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

        private void Clear()
        {
            _applicationCost = 0;
            WorldEffects.Clear();
        }
    }
}
