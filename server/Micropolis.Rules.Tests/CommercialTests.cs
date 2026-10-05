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
    /// A commercial zone whose trip finds no route, which no fixture's commercial zone reaches: such a zone never grows,
    /// and draws nothing to decide it. (A slow trip's penalty is in <see cref="SlowTripTests"/>.)
    /// </summary>
    [TestClass]
    public sealed class CommercialTests
    {
        // A powered zone of the lowest population on open land east of the suburb, with a road at the first tile of its
        // perimeter, one west and two north of its centre, which goes on west a tile
        private const int ZoneX = 110;
        private const int ZoneY = 20;
        private const int RoadX = ZoneX - 1;
        private const int RoadY = ZoneY - 2;

        // An industrial zone whose footprint's south-east corner is north of the road's second tile, and not of its first
        private const int IndustryX = RoadX - 2;
        private const int IndustryY = RoadY - 2;

        // Land valuable enough for the zone to grow a level, and strong demand
        private const int LandValue = 64;
        private const long StrongDemand = 1500;

        [TestMethod]
        public void CommercialFound_TripFindsNoRoute_NeitherGrowsNorDrawsToGrow()
        {
            Simulation city = CityWithAZone(industry: false);
            RandomStream expected = RandomStream.FromSeed(1);
            expected.SetState(city.Random.GetState());
            expected.GetRandom(5);
            expected.GetChance(7);

            Commercial.CommercialFound(city.Map, ZoneX, ZoneY, city.ConstructSimData());

            Assert.AreEqual(1, Population(city));
            CollectionAssert.AreEqual(expected.GetState(), city.Random.GetState());
        }

        // A stream chosen the same way grows the zone when its road leads to industry, so the zone with no route is held
        // back by its trip alone
        [TestMethod]
        public void CommercialFound_TripReachesIndustry_Grows()
        {
            Simulation city = CityWithAZone(industry: true);

            Commercial.CommercialFound(city.Map, ZoneX, ZoneY, city.ConstructSimData());

            Assert.AreEqual(2, Population(city));
        }

        // The zone under strong demand, drawing from the first stream that draws 0 from five, so a zone of population 1
        // makes a trip, takes the trip's draws, passes getChance(7), so the zone is assessed, and draws under the score
        // the zone grows at
        private static Simulation CityWithAZone(bool industry)
        {
            Simulation city = FixtureCities.City("suburb", "built");
            ZoneUtils.PutZone(city.Map, ZoneX, ZoneY, CZB, true);
            city.Map.SetTile(RoadX, RoadY, ROADS, 0);
            city.Map.SetTile(RoadX - 1, RoadY, ROADS, 0);
            if (industry)
            {
                ZoneUtils.PutZone(city.Map, IndustryX, IndustryY, IZB, true);
            }

            city.BlockMaps.LandValueMap.WorldSet(ZoneX, ZoneY, LandValue);
            city.Valves.ComValve = StrongDemand;
            long growthScore = StrongDemand + city.BlockMaps.CityCentreDistScoreMap.WorldGet(ZoneX, ZoneY) - 26380;
            uint seed = Seeds.First(RandomStream.SimulationStream, random =>
                random.GetRandom(5) == 0 &&
                Seeds.Trip(city.Map, city.BlockMaps, ZoneX, ZoneY, TrafficDestination.Industrial, random) != TrafficResult.NoRoadFound &&
                random.GetChance(7) &&
                growthScore > random.GetRandom16Signed());
            city.Random.SetState(RandomStream.SimulationStream(seed).GetState());
            return city;
        }

        private static int Population(Simulation city)
        {
            return Commercial.GetZonePopulation(city.Map, ZoneX, ZoneY, city.Map.GetTileValue(ZoneX, ZoneY));
        }
    }
}
