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

namespace Micropolis.Rules
{
    /// <summary>
    /// The advisor conditions, each named by its message, and the city status record the simulation publishes each
    /// cycle, as <c>src/cityStatus.ts</c> builds it: the single home of the conditions' tests, which the advisor
    /// messages ask too.
    /// </summary>
    public static class CityStatus
    {
        // Each advisor condition and the test for it, in the order the status record lists those that hold.
        // NOT_ENOUGH_POWER is the power scan's own verdict, which it reports as it finishes.
        private static readonly IReadOnlyList<(string Condition, Func<Census, Budget, PowerManager, bool> Holds)> AdvisorConditions =
        [
            (Messages.NOT_ENOUGH_POWER, (_, _, power) => power.PowerLoad > power.PowerCapacity),
            (Messages.NEED_ELECTRICITY, (census, _, _) => TotalZonePop(census) > 10 && PowerPop(census) == 0),
            (Messages.BLACKOUTS_REPORTED, (census, _, _) => Blackouts(census)),
            (Messages.NEED_STADIUM, (census, _, _) => census.ResPop > 500 && census.StadiumPop == 0),
            (Messages.NEED_AIRPORT, (census, _, _) => census.ComPop > 100 && census.AirportPop == 0),
            (Messages.NEED_SEAPORT, (census, _, _) => census.IndPop > 70 && census.SeaportPop == 0),
            (Messages.NEED_MORE_RESIDENTIAL, (census, _, _) => JsMath.FloorDiv(TotalZonePop(census), 4) >= census.ResZonePop),
            (Messages.NEED_MORE_COMMERCIAL, (census, _, _) => JsMath.FloorDiv(TotalZonePop(census), 8) >= census.ComZonePop),
            (Messages.NEED_MORE_INDUSTRIAL, (census, _, _) => JsMath.FloorDiv(TotalZonePop(census), 8) >= census.IndZonePop),
            (Messages.NEED_MORE_ROADS, (census, _, _) => TotalZonePop(census) > 10 && TotalZonePop(census) * 2 > census.RoadTotal),
            (Messages.NEED_MORE_RAILS, (census, _, _) => TotalZonePop(census) > 50 && TotalZonePop(census) > census.RailTotal),
            (Messages.HIGH_POLLUTION, (census, _, _) => census.PollutionAverage > 60),
            (Messages.HIGH_CRIME, (census, _, _) => census.CrimeAverage > 100),
            (Messages.TRAFFIC_JAMS, (census, _, _) => census.TrafficAverage > 60),
            (Messages.NEED_FIRE_STATION, (census, _, _) => census.TotalPop > 60 && census.FireStationPop == 0),
            (Messages.NEED_POLICE_STATION, (census, _, _) => census.TotalPop > 60 && census.PoliceStationPop == 0),
            (Messages.TAX_TOO_HIGH, (_, budget, _) => budget.CityTax > 12),
            (Messages.ROAD_NEEDS_FUNDING,
             (census, budget, _) => budget.RoadEffect < JsMath.FloorDiv(5 * Budget.MaxRoadEffect, 8) && census.RoadTotal > 30),
            (Messages.FIRE_STATION_NEEDS_FUNDING,
             (census, budget, _) => budget.FireEffect < JsMath.FloorDiv(7 * Budget.MaxFireStationEffect, 10) && census.TotalPop > 20),
            (Messages.POLICE_NEEDS_FUNDING,
             (census, budget, _) => budget.PoliceEffect < JsMath.FloorDiv(7 * Budget.MaxPoliceStationEffect, 10) && census.TotalPop > 20),
        ];

        /// <summary>
        /// Whether the advisor condition named by its message holds.
        /// </summary>
        public static bool ConditionHolds(string condition, Census census, Budget budget, PowerManager power)
        {
            foreach ((string name, Func<Census, Budget, PowerManager, bool> holds) in AdvisorConditions)
            {
                if (name == condition)
                {
                    return holds(census, budget, power);
                }
            }

            throw new ArgumentException($"Unknown advisor condition {condition}", nameof(condition));
        }

        /// <summary>
        /// The city status record: the power figures of the last power scan, the demand caps, and every advisor
        /// condition that holds, as the payload of <see cref="Messages.CITY_STATUS_UPDATED"/>.
        /// </summary>
        public static JsonObject Build(Census census, Budget budget, PowerManager power, Valves valves)
        {
            return new JsonObject
            {
                ["commercialCapped"] = valves.ComCap,
                ["conditions"] = new JsonArray(AdvisorConditions
                    .Where(entry => entry.Holds(census, budget, power))
                    .Select(entry => (JsonNode?)entry.Condition)
                    .ToArray()),
                ["industrialCapped"] = valves.IndCap,
                ["powerCapacity"] = power.PowerCapacity,
                ["powerLoad"] = power.PowerLoad,
                ["residentialCapped"] = valves.ResCap,
            };
        }

        private static long TotalZonePop(Census census)
        {
            return census.ResZonePop + census.ComZonePop + census.IndZonePop;
        }

        private static long PowerPop(Census census)
        {
            return census.NuclearPowerPop + census.CoalPowerPop;
        }

        // Under 70% of the zones powered: sendMessages in the original divides by the zone count as a float, and
        // compares the float share with the double 0.7
        private static bool Blackouts(Census census)
        {
            long zoneCount = census.UnpoweredZoneCount + census.PoweredZoneCount;
            return zoneCount > 0 && JsMath.Fround((double)census.PoweredZoneCount / zoneCount) < 0.7 && PowerPop(census) > 0;
        }
    }
}
