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

using System.Text.Json.Serialization;
using static Micropolis.Rules.JsMath;

namespace Micropolis.Rules
{
    /// <summary>
    /// An amount for each service the budget funds: roads, the fire department and the police. The protocol writes it
    /// as <c>ServiceAmounts</c> in <c>src/protocol.ts</c>.
    /// </summary>
    public readonly record struct ServiceAmounts<T>(
        [property: JsonPropertyName("road")] T Road,
        [property: JsonPropertyName("fire")] T Fire,
        [property: JsonPropertyName("police")] T Police);

    /// <summary>
    /// What the year-end budget does with the cash there is: what each service wants at its funding percentage, what
    /// each gets, and the percentages afterwards.
    /// </summary>
    public readonly record struct Funding(ServiceAmounts<long> Wanted, ServiceAmounts<long> Paid, ServiceAmounts<double> Percents);

    /// <summary>
    /// What the year-end budget would do: what each service would cost, the change in funds, and the funds it would
    /// leave.
    /// </summary>
    public readonly record struct YearForecast(ServiceAmounts<long> Wanted, long FundsChange, long FundsAfterYear);

    /// <summary>
    /// How the budget funds road, fire and police services at year end, as doBudgetNow in the original's budget.cpp
    /// does, and the effect that funding has, as its updateFundEffects does: <c>src/serviceFunding.ts</c>.
    /// </summary>
    /// <remarks>
    /// The original keeps each funding percentage in a float and does this arithmetic in float, which
    /// <see cref="JsMath.Fround"/> reproduces as the TypeScript's <c>Math.fround</c> does.
    /// </remarks>
    public static class ServiceFunding
    {
        /// <summary>
        /// What a service wants at year end at its funding percentage (0 to 1): (int)(fund * percent), multiplied in
        /// float.
        /// </summary>
        public static long CostAt(long maintenance, double percent)
        {
            return (long)Math.Floor(Fround(Fround(maintenance) * Fround(percent)));
        }

        /// <summary>
        /// The funding percentage (0 to 1) of a service funded at a whole percent, as the original's budget slider
        /// handlers (<c>SimCmdRoadFund</c> and its siblings in micropolis-activity's <c>w_sim.c</c>) store it:
        /// percent / 100.0, kept in a float.
        /// </summary>
        public static double FundingPercent(int wholePercent)
        {
            return Fround(wholePercent / 100.0);
        }

        /// <summary>
        /// The spend booked on a service funded at a whole percent, as those slider handlers book it:
        /// (max * percent) / 100, in integers.
        /// </summary>
        public static long FundingSpend(long maintenance, int wholePercent)
        {
            return FloorDiv(maintenance * wholePercent, 100);
        }

        /// <summary>
        /// The effect a service has at a spend on it, out of its effect at full funding: (short)((float)maxEffect *
        /// (float)spend / (float)fund), in float. The maintenance cost must not be 0.
        /// </summary>
        public static long FundEffect(long maxEffect, long spend, long maintenance)
        {
            double effect = Fround(Fround(Fround(maxEffect) * Fround(spend)) / Fround(maintenance));
            return (long)Math.Floor(effect);
        }

        /// <summary>
        /// Funds the services from the cash there is. With more cash than the services want, each gets what it wants
        /// and the percentages stay. Otherwise roads are funded first, then fire, then police: a service is funded in
        /// full only while more cash is left than it wants, and the first one that isn't gets the rest of the cash,
        /// with its percentage scaled back to that, and every service after it gets nothing, at 0%. With no cash and
        /// nothing wanted, nothing is paid and every percentage goes back to 100%.
        /// </summary>
        public static Funding FundServices(long cash, ServiceAmounts<long> maintenance, ServiceAmounts<double> percents)
        {
            ServiceAmounts<long> wanted = new ServiceAmounts<long>(
                CostAt(maintenance.Road, percents.Road),
                CostAt(maintenance.Fire, percents.Fire),
                CostAt(maintenance.Police, percents.Police));
            long total = wanted.Road + wanted.Fire + wanted.Police;

            if (cash > total)
            {
                return new Funding(wanted, wanted, percents);
            }

            if (total == 0)
            {
                return new Funding(wanted, new ServiceAmounts<long>(0, 0, 0), new ServiceAmounts<double>(1, 1, 1));
            }

            long left = cash;
            (long Paid, double Percent) Fund(long want, long maintenanceCost, double percent)
            {
                if (left > want)
                {
                    left -= want;
                    return (want, percent);
                }

                long paid = left;
                double scaledBack = left > 0 ? Fround(Fround(left) / Fround(maintenanceCost)) : 0;
                left = 0;
                return (paid, scaledBack);
            }

            // In the order the budget funds them
            (long Paid, double Percent) road = Fund(wanted.Road, maintenance.Road, percents.Road);
            (long Paid, double Percent) fire = Fund(wanted.Fire, maintenance.Fire, percents.Fire);
            (long Paid, double Percent) police = Fund(wanted.Police, maintenance.Police, percents.Police);

            return new Funding(wanted,
                new ServiceAmounts<long>(road.Paid, fire.Paid, police.Paid),
                new ServiceAmounts<double>(road.Percent, fire.Percent, police.Percent));
        }

        /// <summary>
        /// The year-end budget applied to the given funds, taxes and maintenance costs, with each service funded at the
        /// given percentage: the taxes come in and the services are paid from funds plus taxes.
        /// </summary>
        public static YearForecast ForecastYear(long funds, long taxes, ServiceAmounts<long> maintenance, ServiceAmounts<double> percents)
        {
            Funding funding = FundServices(funds + taxes, maintenance, percents);
            long fundsChange = taxes - (funding.Paid.Road + funding.Paid.Fire + funding.Paid.Police);

            return new YearForecast(funding.Wanted, fundsChange, funds + fundsChange);
        }
    }
}
