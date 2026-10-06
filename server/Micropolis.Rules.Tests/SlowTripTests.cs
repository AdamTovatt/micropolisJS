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

using static Micropolis.Rules.Tests.ZoneSite;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// A slow trip takes its penalty from the growth score of each kind of zone that makes trips. A powered zone of the
    /// lowest built density stands on the <see cref="ZoneSite"/>, under strong demand. A stream draws under the score the
    /// zone grows at, but not under that score less the penalty: the zone grows when its road is clear, and not when the
    /// traffic on the road's block makes its trip slow.
    /// </summary>
    [TestClass]
    public sealed class SlowTripTests
    {
        // Land valuable enough for housing to grow: under it and strong demand a zone neither of whose scores is low
        // enough to decline it
        private const int LandValue = 100;

        // Traffic on the road's block that makes a step onto it cost more than a slow route may, and that one trip's
        // traffic takes nowhere near the heaviest, where the helicopter would draw
        private const int SlowTraffic = 200;

        // Each kind's growth score with a trip found, worked out here rather than by the rules
        private static readonly IReadOnlyDictionary<string, Func<Simulation, long>> Scores = new Dictionary<string, Func<Simulation, long>>
        {
            // As evalRes in the original: the land's value less its pollution, as a score from -3000 to 3000
            ["residential"] = city => StrongDemand + Math.Min(Math.Max(LandValue - city.BlockMaps.PollutionDensityMap.WorldGet(ZoneX, ZoneY), 0) * 32, 6000) - 3000,
            ["commercial"] = city => StrongDemand + city.BlockMaps.CityCentreDistScoreMap.WorldGet(ZoneX, ZoneY),
            ["industrial"] = city => StrongDemand,
        };

        [TestMethod]
        [DataRow("residential", 0, true)]
        [DataRow("residential", SlowTraffic, false)]
        [DataRow("commercial", 0, true)]
        [DataRow("commercial", SlowTraffic, false)]
        [DataRow("industrial", 0, true)]
        [DataRow("industrial", SlowTraffic, false)]
        public void ZoneFound_TripSlowOrNot_GrowsOnlyByTheScoreLessThePenalty(string kind, int roadTraffic, bool grows)
        {
            ZoneKind zone = Kinds[kind];
            Simulation city = City(zone, zone.BuiltCentre, roadTraffic);
            city.BlockMaps.LandValueMap.WorldSet(ZoneX, ZoneY, LandValue);
            zone.SetDemand(city.Valves, StrongDemand);
            int population = Population(city, zone);
            long score = Scores[kind](city) - 26380;
            uint seed = Seeds.First(RandomStream.SimulationStream, random =>
                population > random.GetRandom(zone.TripChance) &&
                Seeds.Trip(city.Map, city.BlockMaps, ZoneX, ZoneY, zone.Destination, random) != TrafficResult.NoRouteFound &&
                random.GetChance(7) &&
                random.GetRandom16Signed() is int draw && score > draw && score - Traffic.SlowTripPenalty <= draw);
            city.Random.SetState(RandomStream.SimulationStream(seed).GetState());

            zone.Found(city.Map, ZoneX, ZoneY, city.ConstructSimData());

            Assert.AreEqual(grows, Population(city, zone) > population);
        }
    }
}
