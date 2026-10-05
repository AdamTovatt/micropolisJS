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
    /// A commercial zone whose drive finds no route, which no fixture's commercial zone reaches: such a
    /// zone never grows, and draws nothing to decide it.
    /// </summary>
    [TestClass]
    public sealed class CommercialTests
    {
        // A powered zone of the lowest population on open land east of the suburb, with a road at the first tile of its
        // perimeter, one west and two north of its centre
        private const int ZoneX = 110;
        private const int ZoneY = 20;
        private const int RoadX = ZoneX - 1;
        private const int RoadY = ZoneY - 2;

        // Land valuable enough for the zone to grow a level, and strong demand
        private const int LandValue = 64;
        private const long StrongDemand = 1500;

        [TestMethod]
        public void CommercialFound_DriveFindsNoRoute_NeitherGrowsNorDrawsToGrow()
        {
            Simulation city = CityWithAZone(roadLeadsToIndustry: false);
            RandomStream expected = RandomStream.FromSeed(1);
            expected.SetState(city.Random.GetState());
            expected.GetRandom(5);
            expected.GetChance(7);

            Commercial.CommercialFound(city.Map, ZoneX, ZoneY, city.ConstructSimData());

            Assert.AreEqual(1, Population(city));
            CollectionAssert.AreEqual(expected.GetState(), city.Random.GetState());
        }

        // The same stream grows the zone when its road leads to industry, so the zone with no route is held back by its
        // drive alone
        [TestMethod]
        public void CommercialFound_DriveReachesIndustry_Grows()
        {
            Simulation city = CityWithAZone(roadLeadsToIndustry: true);

            Commercial.CommercialFound(city.Map, ZoneX, ZoneY, city.ConstructSimData());

            Assert.AreEqual(2, Population(city));
        }

        // The zone under strong demand, drawing from a stream that drives, assesses, and draws a value under the score the
        // zone grows at
        private static Simulation CityWithAZone(bool roadLeadsToIndustry)
        {
            Simulation city = FixtureCities.City("suburb", "built");
            ZoneUtils.PutZone(city.Map, ZoneX, ZoneY, CZB, true);
            city.Map.SetTile(RoadX, RoadY, ROADS, 0);
            if (roadLeadsToIndustry)
            {
                // The road goes on west a tile, to industry north of it
                city.Map.SetTile(RoadX - 1, RoadY, ROADS, 0);
                city.Map.SetTile(RoadX - 1, RoadY - 1, INDBASE, 0);
            }

            city.BlockMaps.LandValueMap.WorldSet(ZoneX, ZoneY, LandValue);
            city.Valves.ComValve = StrongDemand;
            long growthScore = StrongDemand + city.BlockMaps.CityCentreDistScoreMap.WorldGet(ZoneX, ZoneY) - 26380;
            city.Random.SetState(RandomStream.SimulationStream(SeedThatGrows(growthScore)).GetState());
            return city;
        }

        // The first seed whose simulation stream draws 0 from five, so a zone of population 1 drives, passes getChance(7),
        // so the zone is assessed, and then draws under the score
        private static uint SeedThatGrows(long growthScore)
        {
            uint seed = 1;
            while (true)
            {
                RandomStream random = RandomStream.SimulationStream(seed);
                if (random.GetRandom(5) == 0 && random.GetChance(7) && growthScore > random.GetRandom16Signed())
                {
                    return seed;
                }

                seed++;
            }
        }

        private static int Population(Simulation city)
        {
            return Commercial.GetZonePopulation(city.Map, ZoneX, ZoneY, city.Map.GetTileValue(ZoneX, ZoneY));
        }
    }
}
