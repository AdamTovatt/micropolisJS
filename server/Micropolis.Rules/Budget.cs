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

using System.Text.Json.Nodes;
using static Micropolis.Rules.JsMath;

namespace Micropolis.Rules
{
    /// <summary>
    /// The city's funds, tax rate and services' funding.
    /// </summary>
    /// <remarks>
    /// Each percent is the share of a service's upkeep funded, from 0 to 1: the double a single-precision value
    /// equals, or any double in a save written before the budget kept it in single precision.
    /// </remarks>
    public sealed class Budget
    {
        /// <summary>
        /// The roads' effect when fully funded.
        /// </summary>
        public const long MaxRoadEffect = 32;

        /// <summary>
        /// The police stations' effect when fully funded.
        /// </summary>
        public const long MaxPoliceStationEffect = 1000;

        /// <summary>
        /// The fire stations' effect when fully funded.
        /// </summary>
        public const long MaxFireStationEffect = 1000;

        public long TotalFunds { get; internal set; }

        public long CityTax { get; internal set; }

        public bool AutoBudget { get; internal set; }

        public double RoadPercent { get; internal set; }

        public double FirePercent { get; internal set; }

        public double PolicePercent { get; internal set; }

        public long RoadSpend { get; internal set; }

        public long FireSpend { get; internal set; }

        public long PoliceSpend { get; internal set; }

        public long RoadMaintenanceBudget { get; internal set; }

        public long FireMaintenanceBudget { get; internal set; }

        public long PoliceMaintenanceBudget { get; internal set; }

        public long RoadEffect { get; internal set; }

        public long FireEffect { get; internal set; }

        public long PoliceEffect { get; internal set; }

        public long CashFlow { get; internal set; }

        public long TaxFund { get; internal set; }

        /// <summary>
        /// Raises <see cref="Messages.FUNDS_CHANGED"/>, <see cref="Messages.BUDGET_REVIEW_DUE"/> and
        /// <see cref="Messages.NO_MONEY"/>, as <c>src/budget.js</c> does.
        /// </summary>
        internal EventEmitter Events { get; } = new EventEmitter();

        /// <summary>
        /// Whether roads wear away: when their funded effect is below 15/16 of its most.
        /// </summary>
        public bool ShouldDegradeRoad()
        {
            return RoadEffect < 15 * MaxRoadEffect / 16;
        }

        // What maintaining one of each costs a year
        private const long PoliceMaintenanceCost = 100;
        private const long FireMaintenanceCost = 100;
        private const long RoadMaintenanceCost = 1;
        private const long RailMaintenanceCost = 2;

        // The road maintenance and tax multipliers for each level, floats as collectTax in the original keeps them
        private static readonly double[] RLevels = [Fround(0.7), Fround(0.9), Fround(1.2)];
        private static readonly double[] FLevels = [Fround(1.4), Fround(1.2), Fround(0.8)];

        /// <summary>
        /// The year's tax and upkeep, as <c>collectTax</c>, and the year-end budget when anyone lives in the city: one
        /// with nobody in it keeps its services at full effect.
        /// </summary>
        public void CollectTax(Level gameLevel, Census census)
        {
            CashFlow = 0;

            // How much would it cost to fully fund every service?
            PoliceMaintenanceBudget = census.PoliceStationPop * PoliceMaintenanceCost;
            FireMaintenanceBudget = census.FireStationPop * FireMaintenanceCost;

            long roadCost = census.RoadTotal * RoadMaintenanceCost;
            long railCost = census.RailTotal * RailMaintenanceCost;
            RoadMaintenanceBudget = (long)Math.Floor(Fround(Fround(roadCost + railCost) * RLevels[(int)gameLevel]));

            // The tax base is a whole number, which the original converts to a float to multiply by the level's
            // multiplier
            long taxBase = FloorDiv(census.TotalPop * census.LandValueAverage, 120) * CityTax;
            TaxFund = (long)Math.Floor(Fround(Fround(taxBase) * FLevels[(int)gameLevel]));

            if (census.TotalPop > 0)
            {
                // The original keeps the cash flow in a short, which wraps past 32767
                CashFlow = unchecked((short)(TaxFund - (PoliceMaintenanceBudget + FireMaintenanceBudget + RoadMaintenanceBudget)));
                DoBudgetNow();
            }
            else
            {
                // Roads and the rest don't deteriorate before anyone lives in the city
                RoadEffect = MaxRoadEffect;
                PoliceEffect = MaxPoliceStationEffect;
                FireEffect = MaxFireStationEffect;
            }
        }

        /// <summary>
        /// The year-end budget, as <c>doBudgetNow</c>, which never waits for the player: the city pays for its services
        /// at the funding it can afford of what was asked for, and takes in the year's tax. With auto-budget on and the
        /// funds to cover the services, that is all. Otherwise each service's effect follows what it was paid, the
        /// player is offered the budget to review, and auto-budget that couldn't cover them turns off, as the original
        /// forces it off. Since the city never waits, a replay never depends on when a window closed.
        /// </summary>
        internal void DoBudgetNow()
        {
            Funding funding = ServiceFunding.FundServices(TotalFunds + TaxFund, Maintenance, Percents);
            SetPercents(funding.Percents);

            ServiceAmounts<long> costs = funding.Paid;
            long totalCost = costs.Road + costs.Fire + costs.Police;
            bool funded = AutoBudget && TotalFunds + TaxFund - totalCost > 0;

            // The year's taxes come in, and the services are paid out of them
            Spend(-(TaxFund - totalCost));

            // Auto-budget with cash for every service. As in the original, each service's spend is booked as its full
            // maintenance cost whatever its percentage, and the effects stay as they are.
            if (funded)
            {
                BookSpend(Maintenance);
                return;
            }

            // The player's values, or what auto-budget could pay. As in the original, what each service gets is booked
            // as its spend, and the effects are set from those spends, standing in for the original's budget window.
            // That window (drawCurrPercents in micropolis-activity's w_budget.c, and the Tcl it calls), on drawing a
            // percentage at a slider position other than the slider's last one, sets the slider, which runs its handler
            // (SimCmdRoadFund, SimCmdFireFund or SimCmdPoliceFund in w_sim.c). The handler stores the whole percent back
            // as the percentage, losing any fraction, re-books the service's spend from it, and updates the effects. So
            // there a fire department paid $94 of $300, drawn at 31%, is set to 31% and gets the effect of $93, and when
            // no slider is drawn at a new position, no effect changes. Here the review never changes the city: the
            // percentages keep their fractions, and the effects always follow what was paid.
            BookSpend(costs);
            UpdateFundEffects();

            if (AutoBudget)
            {
                AutoBudget = false;
                Events.Emit(Messages.NO_MONEY);
            }

            Events.Emit(Messages.BUDGET_REVIEW_DUE);
        }

        /// <summary>
        /// Sets each service's effect from the spend booked on it.
        /// </summary>
        internal void UpdateFundEffects()
        {
            RoadEffect = MaxRoadEffect;
            PoliceEffect = MaxPoliceStationEffect;
            FireEffect = MaxFireStationEffect;

            if (RoadMaintenanceBudget > 0)
            {
                RoadEffect = ServiceFunding.FundEffect(RoadEffect, RoadSpend, RoadMaintenanceBudget);
            }

            if (FireMaintenanceBudget > 0)
            {
                FireEffect = ServiceFunding.FundEffect(FireEffect, FireSpend, FireMaintenanceBudget);
            }

            if (PoliceMaintenanceBudget > 0)
            {
                PoliceEffect = ServiceFunding.FundEffect(PoliceEffect, PoliceSpend, PoliceMaintenanceBudget);
            }
        }

        /// <summary>
        /// Sets the funds, never below 0, and announces them: a city left with nothing hears it has no money.
        /// </summary>
        internal void SetFunds(long amount)
        {
            if (amount == TotalFunds)
            {
                return;
            }

            TotalFunds = Math.Max(0, amount);
            Events.Emit(Messages.FUNDS_CHANGED, TotalFunds);

            if (TotalFunds == 0)
            {
                Events.Emit(Messages.NO_MONEY);
            }
        }

        internal void Spend(long amount)
        {
            SetFunds(TotalFunds - amount);
        }

        // Each service's full maintenance cost
        private ServiceAmounts<long> Maintenance => new ServiceAmounts<long>(RoadMaintenanceBudget, FireMaintenanceBudget, PoliceMaintenanceBudget);

        // Each service's funding percentage, 0 to 1
        private ServiceAmounts<double> Percents => new ServiceAmounts<double>(RoadPercent, FirePercent, PolicePercent);

        private void SetPercents(ServiceAmounts<double> percents)
        {
            RoadPercent = percents.Road;
            FirePercent = percents.Fire;
            PolicePercent = percents.Police;
        }

        // Books the spend on each service, which UpdateFundEffects reads
        private void BookSpend(ServiceAmounts<long> spends)
        {
            RoadSpend = spends.Road;
            FireSpend = spends.Fire;
            PoliceSpend = spends.Police;
        }

        internal void Save(JsonObject saveData)
        {
            saveData["budget"] = new JsonObject
            {
                ["totalFunds"] = TotalFunds,
                ["cityTax"] = CityTax,
                ["autoBudget"] = AutoBudget,
                ["roadPercent"] = RoadPercent,
                ["firePercent"] = FirePercent,
                ["policePercent"] = PolicePercent,
                ["roadSpend"] = RoadSpend,
                ["fireSpend"] = FireSpend,
                ["policeSpend"] = PoliceSpend,
                ["roadMaintenanceBudget"] = RoadMaintenanceBudget,
                ["fireMaintenanceBudget"] = FireMaintenanceBudget,
                ["policeMaintenanceBudget"] = PoliceMaintenanceBudget,
                ["roadEffect"] = RoadEffect,
                ["fireEffect"] = FireEffect,
                ["policeEffect"] = PoliceEffect,
                ["cashFlow"] = CashFlow,
                ["taxFund"] = TaxFund,
            };
        }

        internal void Load(SavedObject saveData)
        {
            saveData.ReadObject("budget", budget =>
            {
                TotalFunds = budget.ReadSafeInteger("totalFunds");
                CityTax = budget.ReadSafeInteger("cityTax");
                AutoBudget = budget.ReadBool("autoBudget");
                RoadPercent = budget.ReadNumber("roadPercent", 0, 1);
                FirePercent = budget.ReadNumber("firePercent", 0, 1);
                PolicePercent = budget.ReadNumber("policePercent", 0, 1);
                RoadSpend = budget.ReadSafeInteger("roadSpend");
                FireSpend = budget.ReadSafeInteger("fireSpend");
                PoliceSpend = budget.ReadSafeInteger("policeSpend");
                RoadMaintenanceBudget = budget.ReadSafeInteger("roadMaintenanceBudget");
                FireMaintenanceBudget = budget.ReadSafeInteger("fireMaintenanceBudget");
                PoliceMaintenanceBudget = budget.ReadSafeInteger("policeMaintenanceBudget");
                RoadEffect = budget.ReadSafeInteger("roadEffect");
                FireEffect = budget.ReadSafeInteger("fireEffect");
                PoliceEffect = budget.ReadSafeInteger("policeEffect");
                CashFlow = budget.ReadSafeInteger("cashFlow");
                TaxFund = budget.ReadSafeInteger("taxFund");
            });
        }
    }
}
