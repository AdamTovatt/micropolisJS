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
    /// Residential, commercial and industrial demand, and whether the advisor has capped each.
    /// </summary>
    public sealed class Valves
    {
        public long ResValve { get; internal set; }

        public long ComValve { get; internal set; }

        public long IndValve { get; internal set; }

        public bool ResCap { get; internal set; }

        public bool ComCap { get; internal set; }

        public bool IndCap { get; internal set; }

        /// <summary>
        /// Raises <see cref="Messages.VALVES_UPDATED"/>, as <c>src/valves.js</c> does.
        /// </summary>
        internal EventEmitter Events { get; } = new EventEmitter();

        private const long ResValveRange = 2000;
        private const long ComValveRange = 1500;
        private const long IndValveRange = 1500;

        private static readonly long[] TaxTable =
            [200, 150, 120, 100, 80, 50, 30, 0, -10, -40, -100, -150, -200, -250, -300, -350, -400, -450, -500, -550, -600];

        private static readonly double[] ExtMarketParamTable = [Fround(1.2), Fround(1.1), Fround(0.98)];

        /// <summary>
        /// Sets the census's total population and moves each valve by the demand projected from the census, the tax
        /// rate and the level, as <c>setValves</c>: in float, as the original works it out. A capped valve stays at or
        /// below zero.
        /// </summary>
        public void SetValves(Level gameLevel, Census census, Budget budget)
        {
            const double resPopDenom = 8;
            double birthRate = Fround(0.02);
            double labourBaseMax = Fround(1.3);
            double internalMarketDenom = Fround(3.7);
            const double projectedIndPopMin = 5.0;
            double resRatioDefault = Fround(1.3);
            const double resRatioMax = 2;
            const double comRatioMax = 2;
            const double indRatioMax = 2;
            const long taxMax = 20;
            const double taxTableScale = 600;

            // Residential zones scale their population index when reporting it to the census. The original stores the
            // total in a short, and its (short) drops the fraction. Past a short's range C leaves that conversion
            // undefined, and the port keeps the whole value.
            double normalizedResPop = Fround(census.ResPop / resPopDenom);
            census.TotalPop = (long)Math.Truncate(Fround(Fround(normalizedResPop + census.ComPop) + census.IndPop));

            // No developed commercial and industrial zones means no jobs, which holds growth back
            double employment = census.ResPop > 0
                ? Fround((census.ComHist10[1] + census.IndHist10[1]) / normalizedResPop)
                : 1;

            // The expected migration, and births, give the projected population
            double migration = Fround(normalizedResPop * Fround(employment - 1));
            double births = Fround(normalizedResPop * birthRate);
            double projectedResPop = Fround(Fround(normalizedResPop + migration) + births);

            // How many zones want workers
            double labourBase = census.ComHist10[1] + census.IndHist10[1];
            labourBase = labourBase > 0.0 ? Fround(census.ResHist10[1] / labourBase) : 1;
            labourBase = Math.Clamp(labourBase, 0.0, labourBaseMax);

            // Future commercial and industrial needs, from the labour there is and the competition of other cities
            double internalMarket = Fround(Fround(Fround(normalizedResPop + census.ComPop) + census.IndPop) / internalMarketDenom);
            double projectedComPop = Fround(internalMarket * labourBase);
            double projectedIndPop = Fround(Fround(census.IndPop * labourBase) * ExtMarketParamTable[(int)gameLevel]);
            projectedIndPop = Math.Max(projectedIndPop, projectedIndPopMin);

            // The expected change in each population
            double resRatio = normalizedResPop > 0 ? Fround(projectedResPop / normalizedResPop) : resRatioDefault;
            double comRatio = census.ComPop > 0 ? Fround(projectedComPop / census.ComPop) : projectedComPop;
            double indRatio = census.IndPop > 0 ? Fround(projectedIndPop / census.IndPop) : projectedIndPop;

            // Each ratio clamped on its own, as the 1989 C does, where simulate.cpp replaces the residential ratio with
            // the industrial one
            resRatio = Math.Min(resRatio, resRatioMax);
            comRatio = Math.Min(comRatio, comRatioMax);
            indRatio = Math.Min(indRatio, indRatioMax);

            // The tax rate holds growth back
            long z = Math.Min(budget.CityTax + (long)gameLevel, taxMax);
            resRatio = Fround(Fround(Fround(resRatio - 1) * taxTableScale) + TaxTable[z]);
            comRatio = Fround(Fround(Fround(comRatio - 1) * taxTableScale) + TaxTable[z]);
            indRatio = Fround(Fround(Fround(indRatio - 1) * taxTableScale) + TaxTable[z]);

            // Each ratio is a change to its valve, which the original's (short) takes whole by dropping the fraction
            ResValve = Math.Clamp(ResValve + (long)Math.Truncate(resRatio), -ResValveRange, ResValveRange);
            ComValve = Math.Clamp(ComValve + (long)Math.Truncate(comRatio), -ComValveRange, ComValveRange);
            IndValve = Math.Clamp(IndValve + (long)Math.Truncate(indRatio), -IndValveRange, IndValveRange);

            if (ResCap && ResValve > 0)
            {
                ResValve = 0;
            }

            if (ComCap && ComValve > 0)
            {
                ComValve = 0;
            }

            if (IndCap && IndValve > 0)
            {
                IndValve = 0;
            }

            Events.Emit(Messages.VALVES_UPDATED);
        }

        internal void Save(JsonObject saveData)
        {
            saveData["valves"] = new JsonObject
            {
                ["resValve"] = ResValve,
                ["comValve"] = ComValve,
                ["indValve"] = IndValve,
                ["resCap"] = ResCap,
                ["comCap"] = ComCap,
                ["indCap"] = IndCap,
            };
        }

        internal void Load(SavedObject saveData)
        {
            saveData.ReadObject("valves", valves =>
            {
                ResValve = valves.ReadSafeInteger("resValve");
                ComValve = valves.ReadSafeInteger("comValve");
                IndValve = valves.ReadSafeInteger("indValve");
                ResCap = valves.ReadBool("resCap");
                ComCap = valves.ReadBool("comCap");
                IndCap = valves.ReadBool("indCap");
            });
        }
    }
}
