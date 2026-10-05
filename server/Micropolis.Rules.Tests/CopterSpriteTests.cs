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

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The helicopter that takes off from an airport, flies straight to the densest traffic, reports it, and flies back
    /// to land where it took off, over a blank map (<see cref="AirSpace"/>).
    /// </summary>
    [TestClass]
    public sealed class CopterSpriteTests
    {
        // The airport the helicopters take off from, in the map's south-west
        private const int AirportX = 20;
        private const int AirportY = 80;

        // Traffic heavy enough to report, and heavier
        private const int Heavy = CopterSprite.HeavyTraffic + 30;
        private const int Heavier = CopterSprite.HeavyTraffic + 60;

        // A helicopter flies 5 pixels a step straight and 3 each way diagonally, and getDir never heads it due east or west,
        // so heading the right way it covers at least 3 pixels a step along the longer axis to its target; it turns 45°
        // each fourth step, so it faces the right way within 16 steps of any start, having flown at most 80 pixels away,
        // which take it at most 27 steps more to fly back
        private const int TurnSlack = 16 + 27;

        [TestMethod]
        [DataRow(CopterSprite.HeavyTraffic, false)]
        [DataRow(CopterSprite.HeavyTraffic + 1, true)]
        public void GenerateCopter_DensestBlock_TakesOffOnlyOverTheThreshold(int density, bool takesOff)
        {
            AirSpace air = AirSpace.Of();
            air.Traffic.WorldSet(60, 30, density);

            air.Sprites.GenerateCopter(AirportX, AirportY, air.Traffic);

            Assert.AreEqual(takesOff, air.Copter is not null);
        }

        // Three blocks share the heaviest traffic, two of them on row 10 of blocks, which is before row 20; a block with
        // heavy but lighter traffic comes before them all
        [TestMethod]
        public void GenerateCopter_BlocksTiedHeaviest_FliesToTheFirstRowByRow()
        {
            AirSpace air = AirSpace.Of();
            air.Traffic.WorldSet(2, 2, Heavy);
            air.Traffic.WorldSet(20, 40, Heavier);
            air.Traffic.WorldSet(100, 20, Heavier);
            air.Traffic.WorldSet(80, 21, Heavier);

            air.Sprites.GenerateCopter(AirportX, AirportY, air.Traffic);

            Assert.AreEqual(CopterPhase.ToTraffic, air.Copter!.CopterFlight!.Phase);
            Assert.AreEqual(new Position(80, 20), air.Copter!.CopterFlight!.Block);
        }

        [TestMethod]
        public void GenerateCopter_HelicopterInTheAir_SendsNoOther()
        {
            AirSpace air = AirSpace.Of();
            air.Traffic.WorldSet(60, 30, Heavy);
            air.Sprites.GenerateCopter(AirportX, AirportY, air.Traffic);
            Sprite first = air.Copter!;
            air.Step();
            (long x, long y) = (first.X, first.Y);

            air.Sprites.GenerateCopter(AirportX + 10, AirportY, air.Traffic);

            Assert.AreEqual((x, y), (first.X, first.Y));
            Assert.HasCount(1, air.Sprites.SpriteList.Where(sprite => sprite.Type == SpriteType.Helicopter));
        }

        // The helicopter flies straight to the block, reports its traffic there once, flies straight back and lands where
        // it took off, drawing nothing from the stream
        [TestMethod]
        public void Move_HeavyTraffic_FliesThereReportsOnceAndLandsHome()
        {
            AirSpace air = AirSpace.Of();
            air.BuildAirport(AirportX, AirportY);
            air.Traffic.WorldSet(90, 20, Heavy);
            List<NewsPlace> reports = [];
            air.Sprites.Events.AddEventListener(RulesEvents.HeavyTraffic, reports.Add);
            air.Sprites.GenerateCopter(AirportX, AirportY, air.Traffic);
            Sprite copter = air.Copter!;
            (long homeX, long homeY) = (copter.X, copter.Y);
            uint[] stream = air.City.Random.GetState();

            int outbound = air.StepUntil(() => copter.CopterFlight!.Phase == CopterPhase.Returning);
            (long turnX, long turnY) = (copter.X, copter.Y);
            int back = air.StepUntil(() => copter.Frame == 0);

            CollectionAssert.AreEqual(new[] { NewsPlaces.Showable(90, 20) }, reports);
            // It turned for home with its hot spot over the middle of the block
            Assert.IsLessThan(30, Math.Abs(turnX + copter.XHot - (90 * 16 + 16)) + Math.Abs(turnY + copter.YHot - (20 * 16 + 16)));
            Assert.IsLessThanOrEqualTo(StraightSteps(homeX, homeY, turnX, turnY), outbound);
            Assert.IsLessThanOrEqualTo(StraightSteps(turnX, turnY, homeX, homeY), back);
            Assert.IsLessThan(30, Math.Abs(copter.X - homeX) + Math.Abs(copter.Y - homeY));
            CollectionAssert.AreEqual(stream, air.City.Random.GetState());
        }

        // The traffic cleared while it flew: it reports nothing there, and still flies home and lands
        [TestMethod]
        public void Move_TrafficClearedBeforeItArrives_ReportsNothingAndLandsHome()
        {
            AirSpace air = AirSpace.Of();
            air.Traffic.WorldSet(90, 20, Heavy);
            List<NewsPlace> reports = [];
            air.Sprites.Events.AddEventListener(RulesEvents.HeavyTraffic, reports.Add);
            air.Sprites.GenerateCopter(AirportX, AirportY, air.Traffic);
            Sprite copter = air.Copter!;
            air.Traffic.WorldSet(90, 20, CopterSprite.HeavyTraffic);

            air.StepUntil(() => copter.Frame == 0);

            Assert.IsEmpty(reports);
            Assert.IsLessThan(30, Math.Abs(copter.X - copter.OrigX) + Math.Abs(copter.Y - copter.OrigY));
        }

        // Its airport bulldozed while it flies, it still flies back to where it took off, and lands there
        [TestMethod]
        public void Move_AirportBulldozed_LandsWhereItTookOff()
        {
            AirSpace air = AirSpace.Of();
            Position airport = air.BuildAirport(AirportX, AirportY);
            air.Traffic.WorldSet(90, 20, Heavy);
            air.Sprites.GenerateCopter(airport.X, airport.Y, air.Traffic);
            Sprite copter = air.Copter!;
            (long homeX, long homeY) = (copter.X, copter.Y);
            air.Step();
            air.Bulldoze(airport);

            air.StepUntil(() => copter.Frame == 0);

            Assert.IsLessThan(30, Math.Abs(copter.X - homeX) + Math.Abs(copter.Y - homeY));
        }

        // A monster on the map is no business of the helicopter's: it flies to its traffic, where the original's turned to
        // chase the monster once its time was up
        [TestMethod]
        public void Move_MonsterOnTheMap_FliesToItsTraffic()
        {
            AirSpace air = AirSpace.Of();
            air.Traffic.WorldSet(90, 20, Heavy);
            air.Sprites.GenerateCopter(AirportX, AirportY, air.Traffic);
            Sprite copter = air.Copter!;
            // In the south-east corner, far from the helicopter's way north-east
            air.Sprites.MakeSprite(SpriteType.Monster, 1800, 1500);
            List<NewsPlace> reports = [];
            air.Sprites.Events.AddEventListener(RulesEvents.HeavyTraffic, reports.Add);

            air.StepUntil(() => copter.CopterFlight!.Phase == CopterPhase.Returning);

            CollectionAssert.AreEqual(new[] { NewsPlaces.Showable(90, 20) }, reports);
        }

        // From every start facing every way, at every phase of its turns, the helicopter reaches traffic in every
        // direction and at every distance in the sweep, within the steps a straight flight takes: it never circles
        [TestMethod]
        public void Move_AnyStartAndHeading_ReachesTheTrafficStraight()
        {
            SpriteManager sprites = new SpriteManager(new GameMap(200, 200), RandomStream.FromSeed(0));
            BlockMaps blockMaps = new BlockMaps(200, 200);
            List<string> failures = [];

            for (int tilesX = -40; tilesX <= 40; tilesX += 3)
            {
                for (int tilesY = -40; tilesY <= 40; tilesY += 3)
                {
                    foreach (long jitter in new long[] { 0, 5, 11 })
                    {
                        for (long frame = 1; frame <= 8; frame++)
                        {
                            for (long cycle = 0; cycle < 4; cycle++)
                            {
                                (int? steps, long distance) = StepsToReach(sprites, blockMaps, tilesX, tilesY, jitter, frame, cycle);
                                int most = MostSteps(distance);

                                if (steps is null || steps > most)
                                {
                                    failures.Add($"({tilesX}, {tilesY}) tiles, {jitter} pixels off, facing {frame} at cycle {cycle}: " +
                                                 $"{steps?.ToString() ?? "never"} steps, most {most}");
                                }
                            }
                        }
                    }
                }
            }

            Assert.AreEqual("", string.Join("\n", failures.Take(20)), $"{failures.Count} starts failed");
        }

        // A powered airport's scans send a helicopter only while some block's traffic is heavy: none in a thousand scans
        // without, and one with
        [TestMethod]
        [DataRow(CopterSprite.HeavyTraffic, false)]
        [DataRow(CopterSprite.HeavyTraffic + 1, true)]
        public void AirportFound_Traffic_SendsAHelicopterOnlyWhileItIsHeavy(int density, bool sends)
        {
            AirSpace air = AirSpace.Of();
            air.BuildAirport(AirportX, AirportY);
            air.Traffic.WorldSet(90, 20, density);
            bool sent = false;

            for (int scan = 0; scan < 1000 && !sent; scan++)
            {
                air.Scan();
                sent = air.Copter is not null;
            }

            Assert.AreEqual(sends, sent);
        }

        // A helicopter saved and loaded flies on as the helicopter never saved does: flying to its traffic, and flying
        // back, each until it has landed
        [TestMethod]
        [DataRow(CopterPhase.ToTraffic)]
        [DataRow(CopterPhase.Returning)]
        public void Save_HelicopterInEachPhase_LoadsToTheSameFlight(CopterPhase phase)
        {
            AirSpace air = AirSpace.Of();
            air.BuildAirport(AirportX, AirportY);
            air.Traffic.WorldSet(90, 20, Heavy);
            air.Sprites.GenerateCopter(AirportX, AirportY, air.Traffic);
            Sprite copter = air.Copter!;
            air.StepUntil(() => copter.CopterFlight!.Phase == phase);
            air.Step();

            Simulation loaded = Simulation.FromSave(CanonicalJson.Write(air.City.Save()));
            CopterFlight flight = loaded.SpriteManager.GetSprite(SpriteType.Helicopter)!.CopterFlight!;
            Assert.AreEqual((copter.CopterFlight!.Phase, copter.CopterFlight!.Block), (flight.Phase, flight.Block));

            for (int step = 0; step < 1000; step++)
            {
                air.Step();
                loaded.SpriteManager.MoveObjects(loaded.ConstructSimData());
            }

            Assert.AreEqual(0, copter.Frame, "The helicopter is still flying, so the runs don't cover its landing.");
            Assert.AreEqual(CanonicalJson.Write(air.City.Save()), CanonicalJson.Write(loaded.Save()));
        }

        private static int StraightSteps(long fromX, long fromY, long toX, long toY)
        {
            return MostSteps(Math.Max(Math.Abs(toX - fromX), Math.Abs(toY - fromY)));
        }

        // The most steps a straight flight takes over the distance along its longer axis
        private static int MostSteps(long distance)
        {
            return (int)(distance / 3) + TurnSlack;
        }

        // The steps a helicopter in the middle of the sweep's large map takes to turn for home from traffic the tiles
        // given away from the block it starts over, offset by the jitter in pixels each way, facing the frame, with the
        // sprite counter at the cycle, or null if it never does; and the distance along the longer axis it starts from its
        // aim. Each start makes the map's one helicopter afresh.
        private static (int? Steps, long Distance) StepsToReach(SpriteManager sprites, BlockMaps blockMaps, int tilesX, int tilesY,
                                                                long jitter, long frame, long cycle)
        {
            Position block = new Position(100 + tilesX, 100 + tilesY);
            // Over the middle of the block at (100, 100), 16 pixels into it, then off by the jitter
            Sprite copter = sprites.MakeSprite(SpriteType.Helicopter, 1616 - 40 + jitter, 1616 + 8 + jitter);
            copter.CopterFlight = CopterFlight.ToTraffic(block);
            copter.Frame = frame;
            sprites.SpriteCycle = cycle;
            long distance = Math.Max(Math.Abs(tilesX * 16 - jitter), Math.Abs(tilesY * 16 - jitter));

            for (int step = 0; step < 2000; step++)
            {
                if (copter.CopterFlight!.Phase == CopterPhase.Returning)
                {
                    return (step, distance);
                }

                sprites.SpriteCycle++;
                CopterSprite.Move(sprites, copter, blockMaps);
            }

            return (null, distance);
        }
    }
}
