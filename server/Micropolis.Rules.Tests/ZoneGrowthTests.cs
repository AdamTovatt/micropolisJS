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

using System.Text.Json.Nodes;
using static Micropolis.Rules.TileValues;
using static Micropolis.Rules.Tests.ZoneSite;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The tile report's growth against the zone handlers themselves. A zone stands on the <see cref="ZoneSite"/>, empty
    /// unless a test builds it up, with the most land value, no pollution and a city centre score of 0 on its block, under
    /// strong demand for every kind. The report's score is the one the handler grows the zone by, to the unit; each
    /// blocker it names holds back a zone the handler grows with the same draws once the blocker is lifted; its outlook
    /// is what the handler can do with the zone; and the housing appeal is the score of an empty home there without
    /// demand. A stream for a zone is found by taking from it the draws its handler will, in order, a trip's by routing it
    /// (<see cref="Seeds"/>).
    /// </summary>
    [TestClass]
    public sealed class ZoneGrowthTests
    {
        private const int MostLandValue = 250;

        // What the handlers' draw against a zone score is offset by
        private const long DrawOffset = 26380;

        // The most seeds a test searches before it fails: many times what the least likely search here takes
        private const uint MostSeeds = 50_000_000;

        // Each blocker, of each kind of zone it holds back: the kind, whether it lowers the zone's score rather than
        // stopping its growth outright, and how to set the city with it on and off. A blocker that lowers the score is
        // named only where at zero it would better where the zone stands, so each such case sets a score it matters to.
        private static readonly IReadOnlyDictionary<string, BlockerCase> Cases = new Dictionary<string, BlockerCase>
        {
            ["residential NO_POWER"] = new BlockerCase("residential", GrowthBlocker.NoPower, true, Unpowered),
            // A location score of 8, which demand below -358 holds back
            ["residential LOW_DEMAND"] = new BlockerCase("residential", GrowthBlocker.LowDemand, true,
                (city, on) =>
                {
                    city.BlockMaps.LandValueMap.WorldSet(ZoneX, ZoneY, 94);
                    city.Valves.ResValve = on ? -400 : 0;
                }),
            ["residential LOW_LAND_VALUE"] = new BlockerCase("residential", GrowthBlocker.LowLandValue, true,
                (city, on) =>
                {
                    city.Valves.ResValve = 0;
                    city.BlockMaps.LandValueMap.WorldSet(ZoneX, ZoneY, on ? 50 : MostLandValue);
                }),
            // A powered, empty zone of high land value, whose pollution outweighs it
            ["residential POLLUTION_OUTWEIGHS_LAND_VALUE"] = new BlockerCase("residential", GrowthBlocker.PollutionOutweighsLandValue, true,
                (city, on) =>
                {
                    city.Valves.ResValve = 0;
                    city.BlockMaps.LandValueMap.WorldSet(ZoneX, ZoneY, 200);
                    city.BlockMaps.PollutionDensityMap.WorldSet(ZoneX, ZoneY, on ? 120 : 0);
                }),
            // Just above and at the most pollution a home grows in, at a land value that outweighs either
            ["residential TOO_POLLUTED"] = new BlockerCase("residential", GrowthBlocker.TooPolluted, false,
                (city, on) => city.BlockMaps.PollutionDensityMap.WorldSet(ZoneX, ZoneY, on ? 129 : 128)),
            ["residential NO_FREE_LOT"] = new BlockerCase("residential", GrowthBlocker.NoFreeLot, false,
                (city, on) =>
                {
                    if (on)
                    {
                        SetLots(city, RUBBLE);
                    }
                }),
            // An empty zone full of houses, with just too few and just enough people round it to be built up
            ["residential NEIGHBOURHOOD_TOO_SPARSE"] = new BlockerCase("residential", GrowthBlocker.NeighbourhoodTooSparse, false,
                (city, on) =>
                {
                    SetLots(city, HOUSE);
                    city.BlockMaps.PopulationDensityMap.WorldSet(ZoneX, ZoneY, on ? 64 : 65);
                }),
            // The densest zone, and the next
            ["residential FULL"] = new BlockerCase("residential", GrowthBlocker.Full, false,
                (city, on) => ZoneUtils.PutZone(city.Map, ZoneX, ZoneY, RZB + (on ? 27 : 18), true)),
            ["commercial NO_POWER"] = new BlockerCase("commercial", GrowthBlocker.NoPower, true, Unpowered),
            ["commercial LOW_DEMAND"] = new BlockerCase("commercial", GrowthBlocker.LowDemand, true,
                (city, on) => city.Valves.ComValve = on ? -400 : 0),
            // A zone of population 1, which can decline, under demand at which the farthest from the centre can too
            ["commercial FAR_FROM_CENTRE"] = new BlockerCase("commercial", GrowthBlocker.FarFromCentre, true,
                (city, on) =>
                {
                    ZoneUtils.PutZone(city.Map, ZoneX, ZoneY, CZB, true);
                    city.Valves.ComValve = 400;
                    city.BlockMaps.CityCentreDistScoreMap.WorldSet(ZoneX, ZoneY, on ? -64 : 0);
                }),
            // A zone of population 1, on land of a value just too low and just high enough for it to grow
            ["commercial LAND_VALUE_LIMITS_SIZE"] = new BlockerCase("commercial", GrowthBlocker.LandValueLimitsSize, false,
                (city, on) =>
                {
                    ZoneUtils.PutZone(city.Map, ZoneX, ZoneY, CZB, true);
                    city.BlockMaps.LandValueMap.WorldSet(ZoneX, ZoneY, on ? 31 : 32);
                }),
            ["commercial FULL"] = new BlockerCase("commercial", GrowthBlocker.Full, false,
                (city, on) => ZoneUtils.PutZone(city.Map, ZoneX, ZoneY, CZB + (on ? 36 : 27), true)),
            ["industrial NO_POWER"] = new BlockerCase("industrial", GrowthBlocker.NoPower, true, Unpowered),
            ["industrial LOW_DEMAND"] = new BlockerCase("industrial", GrowthBlocker.LowDemand, true,
                (city, on) => city.Valves.IndValve = on ? -400 : 0),
            ["industrial FULL"] = new BlockerCase("industrial", GrowthBlocker.Full, false,
                (city, on) => ZoneUtils.PutZone(city.Map, ZoneX, ZoneY, IZB + (on ? 27 : 18), true)),
        };

        // An empty zone of each kind, its score exactly at the draw and a unit above it: the handler grows the zone only
        // when the score the report gives is above the draw, so it grows by that score and no other
        [TestMethod]
        [DataRow("residential", -1, true)]
        [DataRow("residential", 0, false)]
        [DataRow("commercial", -1, true)]
        [DataRow("commercial", 0, false)]
        [DataRow("industrial", -1, true)]
        [DataRow("industrial", 0, false)]
        public void Report_Score_IsTheScoreTheHandlerGrowsTheZoneBy(string kind, int drawFromScore, bool grows)
        {
            ZoneKind zone = Kinds[kind];
            Simulation city = City(zone);
            long score = Report(city).Score;
            uint seed = FirstSeed($"a draw {drawFromScore} from the score", seed =>
                Reaches(city, zone, RandomStream.FromSeed(seed), draw => draw == score - DrawOffset + drawFromScore));
            city.Random.SetState(RandomStream.FromSeed(seed).GetState());

            Assert.AreEqual(grows, Grows(city, zone));
        }

        // With the blocker on, the report names it alone, and the handler holds the zone back under draws that grow it
        // with the blocker off, when the report names nothing. A blocker that lowers the score holds it back under a
        // draw between the two scores; one that stops growth outright, under a draw both scores pass, leaving its tiles
        // as they were.
        [TestMethod]
        [DynamicData(nameof(CaseNames))]
        public void Report_Blocker_HoldsBackAZoneTheHandlerGrowsWithoutIt(string name)
        {
            BlockerCase blocker = Cases[name];
            ZoneKind zone = Kinds[blocker.Kind];
            Simulation on = City(zone, city => blocker.Set(city, true));
            Simulation off = City(zone, city => blocker.Set(city, false));

            CollectionAssert.AreEqual(new[] { blocker.Blocker }, Report(on).Blockers.ToList(), "the blockers on");
            CollectionAssert.AreEqual(Array.Empty<GrowthBlocker>(), Report(off).Blockers.ToList(), "the blockers off");

            long scoreOn = Report(on).Score;
            long scoreOff = Report(off).Score;
            uint seed = FirstSeed(name, seed =>
                Reaches(off, zone, RandomStream.FromSeed(seed), draw => ZoneUtils.CanGrow(scoreOff) && scoreOff - DrawOffset > draw) &&
                Reaches(on, zone, RandomStream.FromSeed(seed), draw => ZoneUtils.CanGrow(scoreOn) && scoreOn - DrawOffset > draw) != blocker.LowersScore);
            on.Random.SetState(RandomStream.FromSeed(seed).GetState());
            off.Random.SetState(RandomStream.FromSeed(seed).GetState());

            // The tiles without their flags, which an industrial zone's animation sets whether it grows or not
            List<int> before = Tiles(on);
            Assert.IsTrue(Grows(off, zone), "grows with the blocker off");
            Assert.IsFalse(Grows(on, zone), "grows with the blocker on");
            if (!blocker.LowersScore)
            {
                CollectionAssert.AreEqual(before, Tiles(on), "the tiles with the blocker on");
            }
        }

        public static IEnumerable<object[]> CaseNames => Cases.Keys.Select(name => new object[] { name });

        // Every blocker the protocol lists has a case
        [TestMethod]
        public void Cases_EveryBlocker_IsCovered()
        {
            CollectionAssert.AreEquivalent(Enum.GetValues<GrowthBlocker>(), Cases.Values.Select(blocker => blocker.Blocker).Distinct().ToList());
        }

        // The densest home, unpowered and too polluted: the blockers come in the protocol's order, though the grow
        // step's are found before the power
        [TestMethod]
        public void Report_SeveralBlockers_ListsThemInTheProtocolsOrder()
        {
            Simulation city = City(Kinds["residential"], city =>
            {
                ZoneUtils.PutZone(city.Map, ZoneX, ZoneY, RZB + 27, false);
                city.BlockMaps.PollutionDensityMap.WorldSet(ZoneX, ZoneY, 129);
            });

            CollectionAssert.AreEqual(new[] { GrowthBlocker.NoPower, GrowthBlocker.TooPolluted, GrowthBlocker.Full },
                                      Report(city).Blockers.ToList());
        }

        // An empty commercial zone a little far from the centre, under strong demand: likely to grow all the same, so
        // nothing holds it back
        [TestMethod]
        public void Report_TermThatLeavesTheOutlookAsItIs_IsNotNamed()
        {
            Simulation city = City(Kinds["commercial"], city => city.BlockMaps.CityCentreDistScoreMap.WorldSet(ZoneX, ZoneY, -10));
            ZoneGrowthReport growth = Report(city);

            Assert.AreEqual(GrowthOutlook.LikelyToGrow, growth.Outlook);
            CollectionAssert.AreEqual(Array.Empty<GrowthBlocker>(), growth.Blockers.ToList());
        }

        // An empty home under low demand on land of low value: neither term at zero would let it grow, so the one
        // furthest below zero is named, and the zone held back never shows no reason
        [TestMethod]
        public void Report_NoTermBettersTheOutlookAlone_NamesTheLowest()
        {
            Simulation city = City(Kinds["residential"], city =>
            {
                city.Valves.ResValve = -1000;
                city.BlockMaps.LandValueMap.WorldSet(ZoneX, ZoneY, 50);
            });
            ZoneGrowthReport growth = Report(city);

            Assert.AreEqual(-2400, growth.Score);
            Assert.AreEqual(GrowthOutlook.HoldsSteady, growth.Outlook);
            CollectionAssert.AreEqual(new[] { GrowthBlocker.LowLandValue }, growth.Blockers.ToList());
        }

        // Where a zone stands is what its handler can do with it: grow where the score lets it and its grow step refuses
        // nothing, decline where the score lets it and it has people
        [TestMethod]
        [DataRow(FREEZ, true, 1500, GrowthOutlook.LikelyToGrow)]
        [DataRow(RZB, true, 0, GrowthOutlook.MayGrowOrDecline)]
        [DataRow(RZB, false, 1500, GrowthOutlook.LikelyToDecline)]
        [DataRow(RZB + 27, true, 1500, GrowthOutlook.HoldsSteady)]
        [DataRow(FREEZ, false, 1500, GrowthOutlook.HoldsSteady)]
        public void Report_Outlook_IsWhatTheHandlerCanDoWithTheZone(int centre, bool powered, long demand, GrowthOutlook outlook)
        {
            Simulation city = City(Kinds["residential"], city =>
            {
                ZoneUtils.PutZone(city.Map, ZoneX, ZoneY, centre, powered);
                city.Valves.ResValve = demand;
                city.BlockMaps.LandValueMap.WorldSet(ZoneX, ZoneY, 100);
            });

            Assert.AreEqual(outlook, Report(city).Outlook);
        }

        // A built-up home zone, which makes a trip whenever its draw is under its population, with its road and without:
        // the report says whether the trip finds a road
        [TestMethod]
        [DataRow(true)]
        [DataRow(false)]
        public void Report_RoadAtEdge_IsWhetherTheZonesTripFindsARoad(bool road)
        {
            ZoneKind zone = Kinds["residential"];
            Simulation city = City(zone, city => RoadAtEdge(city, road));

            Assert.AreEqual(road, Report(city).RoadAtEdge);
            Assert.AreEqual(road, Seeds.Trip(city.Map, city.BlockMaps, ZoneX, ZoneY, zone.Destination, RandomStream.FromSeed(1)) != TrafficResult.NoRoadFound);
        }

        // Without its road, the trip a built-up home zone makes declines it
        [TestMethod]
        public void ResidentialFound_NoRoadAtEdge_TheTripDeclinesTheZone()
        {
            ZoneKind zone = Kinds["residential"];
            Simulation city = City(zone, city => RoadAtEdge(city, false));
            int population = Population(city, zone);
            uint seed = FirstSeed("a trip", seed => population > RandomStream.FromSeed(seed).GetRandom(zone.TripChance));
            city.Random.SetState(RandomStream.FromSeed(seed).GetState());

            zone.Found(city.Map, ZoneX, ZoneY, city.ConstructSimData());

            int after = Population(city, zone);
            Assert.IsTrue(after < population, $"declines from {population} to {after}");
        }

        // Each tile of a zone reports on the zone's centre
        [TestMethod]
        public void Report_EveryTileOfAZone_ReportsOnItsCentre()
        {
            Simulation city = City(Kinds["commercial"]);

            for (int y = ZoneY - 1; y <= ZoneY + 1; y++)
            {
                for (int x = ZoneX - 1; x <= ZoneX + 1; x++)
                {
                    ZoneGrowthReport growth = TileReport(city, x, y).Growth!;
                    Assert.AreEqual((ZoneX, ZoneY, "COMMERCIAL"), (growth.X, growth.Y, growth.Zone));
                }
            }
        }

        // A tile of no zone, the zone's road, and a tile of a hospital, a zone that never grows, have no growth
        [TestMethod]
        [DataRow(ZoneX + 3, ZoneY)]
        [DataRow(RoadX, RoadY)]
        [DataRow(ZoneX - 1, ZoneY + 1)]
        public void Report_TileOfNoGrowingZone_HasNoGrowth(int x, int y)
        {
            Simulation city = City(Kinds["residential"], city => ZoneUtils.PutZone(city.Map, ZoneX, ZoneY, HOSPITAL, true));

            Assert.IsNull(TileReport(city, x, y).Growth);
        }

        // An empty zone is assessed whenever the map scan finds it, any other only now and then. The draws of the tests
        // above follow it, which differ by it.
        [TestMethod]
        [DataRow("residential", FREEZ, false)]
        [DataRow("residential", RZB, true)]
        [DataRow("commercial", COMCLR, true)]
        [DataRow("industrial", INDCLR, true)]
        public void Report_AssessedNowAndThen_IsFalseOnlyForAnEmptyHomeZone(string kind, int centre, bool nowAndThen)
        {
            Simulation city = City(Kinds[kind], city => ZoneUtils.PutZone(city.Map, ZoneX, ZoneY, centre, true));

            Assert.AreEqual(nowAndThen, Report(city).AssessedNowAndThen);
        }

        // A zone grows above the floor and declines below the ceiling, so at -350 it can only decline and at 350 only
        // grow
        [TestMethod]
        [DataRow(-351L, false, true)]
        [DataRow(-350L, false, true)]
        [DataRow(-349L, true, true)]
        [DataRow(349L, true, true)]
        [DataRow(350L, true, false)]
        [DataRow(351L, true, false)]
        public void CanGrowAndCanDecline_Score_SplitAtTheThresholds(long score, bool canGrow, bool canDecline)
        {
            Assert.AreEqual((canGrow, canDecline), (ZoneUtils.CanGrow(score), ZoneUtils.CanDecline(score)));
        }

        [TestMethod]
        [DataRow(true, false, GrowthOutlook.LikelyToGrow)]
        [DataRow(true, true, GrowthOutlook.MayGrowOrDecline)]
        [DataRow(false, false, GrowthOutlook.HoldsSteady)]
        [DataRow(false, true, GrowthOutlook.LikelyToDecline)]
        public void Outlook_WhatTheHandlerCanDo_NamesIt(bool canGrow, bool canDecline, GrowthOutlook outlook)
        {
            Assert.AreEqual(outlook, ZoneUtils.Outlook(canGrow, canDecline));
        }

        // The housing appeal of the zone's block: the score of the empty home zone there without demand for housing where
        // the block is developed, the least location score where it is too polluted for the zone to grow, and 0, drawn
        // clear, on clean undeveloped land
        [TestMethod]
        [DataRow(250, 0, 3000, "scored")]
        [DataRow(200, 120, -440, "scored")]
        [DataRow(50, 0, -1400, "scored")]
        [DataRow(100, 150, -3000, "too polluted")]
        [DataRow(250, 129, -3000, "too polluted")]
        [DataRow(0, 150, -3000, "too polluted")]
        [DataRow(0, 0, 0, "undeveloped")]
        public void HousingAppeal_Block_IsTheScoreOfAnEmptyHomeThereWithoutDemand(int landValue, int pollution, int appeal, string block)
        {
            Simulation city = City(Kinds["residential"], city =>
            {
                city.Valves.ResValve = 0;
                city.BlockMaps.LandValueMap.WorldSet(ZoneX, ZoneY, landValue);
                city.BlockMaps.PollutionDensityMap.WorldSet(ZoneX, ZoneY, pollution);
            });
            OverlayAnswer overlay = (OverlayAnswer)city.AnswerQuery(new JsonObject { ["type"] = "overlay", ["layer"] = "housingAppeal" });
            ZoneGrowthReport growth = Report(city);

            Assert.AreEqual((city.BlockMaps.LandValueMap.BlockSize, -3000, 3000), (overlay.BlockSize, overlay.Low, overlay.High));
            Assert.AreEqual(appeal, overlay.Values[overlay.Width * (ZoneY / overlay.BlockSize) + ZoneX / overlay.BlockSize]);

            if (block == "scored")
            {
                Assert.AreEqual(appeal, growth.Score);
            }
            else if (block == "too polluted")
            {
                CollectionAssert.Contains(growth.Blockers.ToList(), GrowthBlocker.TooPolluted);
            }
        }

        // The zone of the kind, empty, on the site, with the most land value, no pollution and a city centre score of 0 on
        // its block, under strong demand for every kind, with any change made after
        private static Simulation City(ZoneKind zone, Action<Simulation>? change = null)
        {
            Simulation city = ZoneSite.City(zone, zone.EmptyCentre);
            city.BlockMaps.LandValueMap.WorldSet(ZoneX, ZoneY, MostLandValue);
            city.BlockMaps.PollutionDensityMap.WorldSet(ZoneX, ZoneY, 0);
            city.BlockMaps.CityCentreDistScoreMap.WorldSet(ZoneX, ZoneY, 0);
            city.Census.NeedHospital = 0;
            foreach (ZoneKind kind in Kinds.Values)
            {
                kind.SetDemand(city.Valves, StrongDemand);
            }

            change?.Invoke(city);
            return city;
        }

        private static void Unpowered(Simulation city, bool on)
        {
            if (on)
            {
                city.Map.RemoveTileFlags(ZoneX, ZoneY, TileFlags.POWERBIT);
            }
        }

        // A home zone of the lowest built density, with its road or without
        private static void RoadAtEdge(Simulation city, bool road)
        {
            ZoneUtils.PutZone(city.Map, ZoneX, ZoneY, RZB, true);
            if (!road)
            {
                city.Map.SetTile(RoadX, RoadY, DIRT, 0);
            }
        }

        // Sets the 8 lots round the centre to the tile
        private static void SetLots(Simulation city, int tile)
        {
            for (int y = ZoneY - 1; y <= ZoneY + 1; y++)
            {
                for (int x = ZoneX - 1; x <= ZoneX + 1; x++)
                {
                    if (x != ZoneX || y != ZoneY)
                    {
                        city.Map.SetTile(x, y, tile, TileFlags.BLBNCNBIT);
                    }
                }
            }
        }

        private static List<int> Tiles(Simulation city)
        {
            return city.Map.RawValues().Select(raw => raw & TileFlags.BIT_MASK).ToList();
        }

        // Whether the stream reaches the zone's growth: its handler's draws in order, a trip, then the draw that assesses
        // the zone if the report says it is assessed only now and then, then the draw against its score, which must
        // pass, then an empty home zone's draw for a hospital, which the city needs none of
        private static bool Reaches(Simulation city, ZoneKind zone, RandomStream random, Func<int, bool> passes)
        {
            int population = Population(city, zone);

            if (population > random.GetRandom(zone.TripChance) &&
                Seeds.Trip(city.Map, city.BlockMaps, ZoneX, ZoneY, zone.Destination, random) != TrafficResult.RouteFound)
            {
                return false;
            }

            ZoneGrowthReport growth = Report(city);
            if (growth.AssessedNowAndThen && !random.GetChance(7))
            {
                return false;
            }

            if (!passes(random.GetRandom16Signed()))
            {
                return false;
            }

            return growth.Zone != "RESIDENTIAL" || population > 0 || !random.GetChance(3);
        }

        private static bool Grows(Simulation city, ZoneKind zone)
        {
            int population = Population(city, zone);
            zone.Found(city.Map, ZoneX, ZoneY, city.ConstructSimData());
            return Population(city, zone) > population;
        }

        // The zone's growth, asked of a corner tile, which reports on the centre
        private static ZoneGrowthReport Report(Simulation city)
        {
            return TileReport(city, ZoneX + 1, ZoneY + 1).Growth!;
        }

        private static TileReportAnswer TileReport(Simulation city, int x, int y)
        {
            return (TileReportAnswer)city.AnswerQuery(new JsonObject { ["type"] = "tileReport", ["x"] = x, ["y"] = y });
        }

        // The first seed that passes the test, which may start several streams from it, failing with what it looked for
        // once it has searched far more seeds than the test should need
        private static uint FirstSeed(string sought, Func<uint, bool> test)
        {
            for (uint seed = 1; seed <= MostSeeds; seed++)
            {
                if (test(seed))
                {
                    return seed;
                }
            }

            Assert.Fail($"No seed of the first {MostSeeds} gives {sought}.");
            return 0;
        }

        // A blocker of a kind of zone: whether it lowers the zone's score rather than stopping its growth, and how to set
        // the city with it on or off
        private sealed record BlockerCase(string Kind, GrowthBlocker Blocker, bool LowersScore, Action<Simulation, bool> Set);
    }
}
