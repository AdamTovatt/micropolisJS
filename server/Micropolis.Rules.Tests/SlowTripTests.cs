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

using static Micropolis.Rules.TileValues;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// A slow trip takes its penalty from the growth score of each kind of zone that makes trips. A powered zone of the
    /// lowest built density stands on open land east of the suburb, with a road at the first tile of its perimeter, one
    /// west and two north of its centre, which goes on west a tile, beside a destination of the zone's kind north of the
    /// road's second tile. A stream draws under the score the zone grows at, but not under that score less the penalty:
    /// the zone grows when its road is clear, and not when the traffic on the road's block makes its trip slow.
    /// </summary>
    [TestClass]
    public sealed class SlowTripTests
    {
        private const int ZoneX = 110;
        private const int ZoneY = 20;
        private const int RoadX = ZoneX - 1;
        private const int RoadY = ZoneY - 2;

        // A destination whose footprint's south-east corner is north of the road's second tile, and not of its first
        private const int DestinationX = RoadX - 2;
        private const int DestinationY = RoadY - 2;

        // Land valuable enough for housing to grow, and strong demand: under it a zone neither of whose scores is low
        // enough to decline it
        private const int LandValue = 100;
        private const long StrongDemand = 1500;

        // Traffic on the road's block that makes a step onto it cost more than a slow route may, and that one trip's
        // traffic takes nowhere near the heaviest, where the helicopter would draw
        private const int SlowTraffic = 200;

        private static readonly IReadOnlyDictionary<string, ZoneKind> Kinds = new Dictionary<string, ZoneKind>
        {
            ["residential"] = new ZoneKind(
                RZB, TrafficDestination.Commercial, COMCLR, 35, Residential.ResidentialFound, Residential.GetZonePopulation,
                city => city.Valves.ResValve = StrongDemand,
                // As evalResidential: the land's value less its pollution, as a score from -3000 to 3000
                city => StrongDemand + Math.Min(Math.Max(LandValue - city.BlockMaps.PollutionDensityMap.WorldGet(ZoneX, ZoneY), 0) * 32, 6000) - 3000),
            ["commercial"] = new ZoneKind(
                CZB, TrafficDestination.Industrial, IZB, 5, Commercial.CommercialFound, Commercial.GetZonePopulation,
                city => city.Valves.ComValve = StrongDemand,
                city => StrongDemand + city.BlockMaps.CityCentreDistScoreMap.WorldGet(ZoneX, ZoneY)),
            ["industrial"] = new ZoneKind(
                IZB, TrafficDestination.Residential, RZB, 5, Industrial.IndustrialFound, Industrial.GetZonePopulation,
                city => city.Valves.IndValve = StrongDemand,
                city => StrongDemand),
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
            Simulation city = City(zone, roadTraffic);
            int population = Population(zone, city);
            long score = zone.Score(city) - 26380;
            uint seed = Seeds.First(RandomStream.SimulationStream, random =>
                population > random.GetRandom(zone.TripChance) &&
                Seeds.Trip(city.Map, city.BlockMaps, ZoneX, ZoneY, zone.Destination, random) != TrafficResult.NoRouteFound &&
                random.GetChance(7) &&
                random.GetRandom16Signed() is int draw && score > draw && score - Traffic.SlowTripPenalty <= draw);
            city.Random.SetState(RandomStream.SimulationStream(seed).GetState());

            zone.Found(city.Map, ZoneX, ZoneY, city.ConstructSimData());

            Assert.AreEqual(grows, Population(zone, city) > population);
        }

        private static Simulation City(ZoneKind zone, int roadTraffic)
        {
            Simulation city = FixtureCities.City("suburb", "built");
            ZoneUtils.PutZone(city.Map, ZoneX, ZoneY, zone.Centre, true);
            ZoneUtils.PutZone(city.Map, DestinationX, DestinationY, zone.DestinationCentre, true);
            city.Map.SetTile(RoadX, RoadY, ROADS, 0);
            city.Map.SetTile(RoadX - 1, RoadY, ROADS, 0);
            city.BlockMaps.TrafficDensityMap.WorldSet(RoadX - 1, RoadY, roadTraffic);
            city.BlockMaps.LandValueMap.WorldSet(ZoneX, ZoneY, LandValue);
            zone.Demand(city);
            return city;
        }

        private static int Population(ZoneKind zone, Simulation city)
        {
            return zone.Population(city.Map, ZoneX, ZoneY, city.Map.GetTileValue(ZoneX, ZoneY));
        }

        // A kind of zone: its centre, the destination its trips go to and a centre of that kind, the draw its population
        // must pass to make a trip, its handler, its population, how to make its demand strong, and its growth score
        // with a trip found
        private sealed record ZoneKind(
            int Centre, TrafficDestination Destination, int DestinationCentre, int TripChance,
            Action<GameMap, int, int, SimData> Found, Func<GameMap, int, int, int, int> Population,
            Action<Simulation> Demand, Func<Simulation, long> Score);
    }
}
