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
    /// The plane that departs from an airport and flies straight off the map, or enters at the map's edge and flies
    /// straight along the runway's row to land, over a blank map (<see cref="AirSpace"/>), and the crashes that still end
    /// planes and helicopters.
    /// </summary>
    [TestClass]
    public sealed class AirplaneSpriteTests
    {
        // An airport in the west of the map, whose planes take off east, and one whose roll east would start within 20
        // tiles of the 120 tile map's east edge, so its planes take off west
        private const int WestX = 30;
        private const int EastX = 105;
        private const int AirportY = 40;

        // The last column whose roll east starts outside the east edge's 20 tiles, at pixel 1600, and the first inside
        private const int LastEastX = 97;
        private const int FirstWestX = 98;

        // The row every plane of an airport on row 40 flies along
        private const long RunwayRow = AirportY * 16 + 12;

        // A plane takes off east through the take-off frames, or west from the first frame where its roll east would
        // start within 20 tiles of the map's east edge
        [TestMethod]
        [DataRow(WestX, WestX * 16 + 48L, 11L)]
        [DataRow(LastEastX, LastEastX * 16 + 48L, 11L)]
        [DataRow(FirstWestX, FirstWestX * 16 + 48 - 148L, 7L)]
        public void GeneratePlane_Airport_TakesOffFromItsRunwayRow(int airportX, long rollX, long frame)
        {
            AirSpace air = AirSpace.Of();

            Sprite plane = air.Sprites.GeneratePlane(airportX, AirportY)!;

            Assert.AreEqual((rollX, RunwayRow, frame), (plane.X, plane.Y, plane.Frame));
            Assert.AreEqual(PlanePhase.Departing, plane.PlaneFlight!.Phase);
        }

        // A departing plane holds the heading it took off on, along the runway's row, until it leaves the map, and draws
        // nothing from the stream: east once the take-off frames are done, and west from the first
        [TestMethod]
        [DataRow(WestX, 3L, 16 * 120L)]
        [DataRow(EastX, 7L, 0L)]
        public void Move_Departing_HoldsItsHeadingUntilItLeavesTheMap(int airportX, long heading, long edge)
        {
            AirSpace air = AirSpace.Of();
            air.BuildAirport(airportX, AirportY);
            Sprite plane = air.Sprites.GeneratePlane(airportX, AirportY)!;
            uint[] stream = air.City.Random.GetState();
            List<long> frames = [];
            long lastHotX = 0;

            air.StepUntil(() =>
            {
                if (plane.Frame != 0)
                {
                    frames.Add(plane.Frame);
                    lastHotX = AirSpace.HotSpot(plane).X;
                    Assert.AreEqual(RunwayRow, plane.Y);
                }

                return plane.Frame == 0;
            });

            CollectionAssert.AreEqual(heading == 3 ? new long[] { 11, 10, 9, 3 } : new long[] { 7 }, frames.Distinct().ToArray());
            Assert.IsLessThanOrEqualTo(8, Math.Abs(edge - lastHotX), $"The plane was last seen at {lastHotX}, not by the edge at {edge}.");
            CollectionAssert.AreEqual(stream, air.City.Random.GetState());
        }

        // A departing plane holds a heading that isn't east or west too, as a plane saved in flight before flights does
        [TestMethod]
        public void Move_DepartingDiagonally_HoldsItsHeading()
        {
            AirSpace air = AirSpace.Of();
            Sprite plane = air.Sprites.GeneratePlane(WestX, AirportY)!;
            plane.Frame = 2;

            air.StepUntil(() => plane.Frame != 2);

            Assert.AreEqual(0, plane.Frame);
            Assert.IsLessThan(0, AirSpace.HotSpot(plane).Y);
        }

        // A plane arriving at an airport whose planes take off east enters at the west edge on the runway's row, flies
        // east along it, and disappears where a departure starts its take-off roll; at an airport whose planes take off
        // west, the other way, either side of the boundary between them too
        [TestMethod]
        [DataRow(WestX, 3L, 0L, WestX * 16 + 48L)]
        [DataRow(LastEastX, 3L, 0L, LastEastX * 16 + 48L)]
        [DataRow(FirstWestX, 7L, 16 * 120 - 1L, FirstWestX * 16 + 48 - 148L)]
        [DataRow(EastX, 7L, 16 * 120 - 1L, EastX * 16 + 48 - 148L)]
        public void Move_Arriving_FliesAlongTheRunwayRowAndLandsWhereDeparturesRoll(int airportX, long heading, long entryHotX, long rollX)
        {
            AirSpace air = AirSpace.Of();
            Position airport = air.BuildAirport(airportX, AirportY);
            Sprite plane = Arriving(air, airport);
            long lastX = plane.X;

            Assert.AreEqual((entryHotX, RunwayRow, heading), (AirSpace.HotSpot(plane).X, plane.Y, plane.Frame));
            air.StepUntil(() =>
            {
                if (plane.Frame != 0)
                {
                    lastX = plane.X;
                    Assert.AreEqual((RunwayRow, heading), (plane.Y, plane.Frame));
                }

                return plane.Frame == 0;
            });

            // It disappears on the step that reaches the roll's start, its last position the step before
            Assert.IsLessThanOrEqualTo(8, Math.Abs(rollX - lastX));
            Assert.IsTrue(heading == 3 ? lastX < rollX : lastX > rollX, $"The plane was last seen at {lastX}, past the roll at {rollX}.");
        }

        // A plane turned into an arriving one wherever it was flies its airport's runway row
        [TestMethod]
        public void Arrive_PlaneOffTheRunwayRow_FliesOnTheRunwayRow()
        {
            AirSpace air = AirSpace.Of();
            Sprite plane = air.Sprites.GeneratePlane(WestX, AirportY + 20)!;

            AirplaneSprite.Arrive(air.Sprites, plane, new Position(WestX, AirportY));

            Assert.AreEqual(RunwayRow, plane.Y);
        }

        // Its airport bulldozed before it lands, an arriving plane flies on along the row and leaves the map
        [TestMethod]
        public void Move_ArrivingAirportBulldozed_FliesOnOffTheMap()
        {
            AirSpace air = AirSpace.Of();
            Position airport = air.BuildAirport(WestX, AirportY);
            Sprite plane = Arriving(air, airport);
            air.StepUntil(() => plane.X > 100);
            air.Bulldoze(airport);
            long lastHotX = 0;

            air.StepUntil(() =>
            {
                if (plane.Frame != 0)
                {
                    lastHotX = AirSpace.HotSpot(plane).X;
                }

                return plane.Frame == 0;
            });

            Assert.AreEqual(PlanePhase.Departing, plane.PlaneFlight!.Phase);
            Assert.IsNull(plane.PlaneFlight!.Airport);
            Assert.IsLessThanOrEqualTo(8, 16 * 120 - lastHotX);
        }

        // An airport's flight arrives or departs as the stream's draw says, at even odds
        [TestMethod]
        [DataRow(true, PlanePhase.Arriving)]
        [DataRow(false, PlanePhase.Departing)]
        public void GenerateFlight_Draw_PicksTheFlight(bool draw, PlanePhase phase)
        {
            uint seed = Seeds.First(RandomStream.FromSeed, random => random.GetChance(1) == draw);
            GameMap map = new GameMap(120, 100);
            SpriteManager sprites = new SpriteManager(map, RandomStream.FromSeed(seed));

            sprites.GenerateFlight(WestX, AirportY);

            Assert.AreEqual(phase, sprites.GetSprite(SpriteType.Airplane)!.PlaneFlight!.Phase);
        }

        [TestMethod]
        public void GenerateFlight_PlaneInTheAir_SendsNoOtherAndDrawsNothing()
        {
            AirSpace air = AirSpace.Of();
            Sprite plane = air.Sprites.GeneratePlane(WestX, AirportY)!;
            air.Step();
            (long x, long y) = (plane.X, plane.Y);
            uint[] stream = air.City.Random.GetState();

            air.Sprites.GenerateFlight(EastX, AirportY);

            Assert.AreEqual((x, y), (plane.X, plane.Y));
            CollectionAssert.AreEqual(stream, air.City.Random.GetState());
        }

        // The crash disaster explodes the plane in the air, arriving as well as departing, which reports its crash
        [TestMethod]
        public void MakeCrash_PlaneInTheAir_ExplodesIt()
        {
            AirSpace air = AirSpace.Of();
            Sprite plane = Arriving(air, air.BuildAirport(WestX, AirportY));
            air.StepUntil(() => plane.X > 200);
            List<NewsPlace> crashes = [];
            air.Sprites.Events.AddEventListener(RulesEvents.PlaneCrashed, crashes.Add);

            air.City.DisasterManager.MakeCrash();

            Assert.AreEqual(0, plane.Frame);
            Assert.HasCount(1, crashes);
            Assert.HasCount(1, air.Sprites.GetLiveSprites().Where(sprite => sprite.Type == SpriteType.Explosion));
        }

        // With no plane in the air, the crash disaster makes a departing one over the land away from the edges, which
        // explodes
        [TestMethod]
        public void MakeCrash_NoPlane_ExplodesANewDepartingOne()
        {
            AirSpace air = AirSpace.Of();
            List<NewsPlace> crashes = [];
            air.Sprites.Events.AddEventListener(RulesEvents.PlaneCrashed, crashes.Add);

            air.City.DisasterManager.MakeCrash();

            Sprite plane = air.Sprites.SpriteList.Single(sprite => sprite.Type == SpriteType.Airplane);
            Assert.AreEqual((0L, PlanePhase.Departing), (plane.Frame, plane.PlaneFlight!.Phase));
            Assert.HasCount(1, crashes);
            Assert.IsTrue(crashes[0].X >= 10 && crashes[0].X < 120 && crashes[0].Y >= 5 && crashes[0].Y < 95, $"The crash was at ({crashes[0].X}, {crashes[0].Y}).");
        }

        // A plane that meets a helicopter while disasters are on explodes with it, each reporting its own crash, even
        // as the plane lands at an airport; with disasters off they pass
        [TestMethod]
        [DataRow(true)]
        [DataRow(false)]
        public void Move_PlaneMeetsHelicopter_BothExplodeWhileDisastersAreOn(bool disasters)
        {
            AirSpace air = AirSpace.Of();
            air.City.DisasterManager.DisastersEnabled = disasters;
            Sprite plane = Arriving(air, air.BuildAirport(WestX, AirportY));
            List<string> crashes = [];
            air.Sprites.Events.AddEventListener(RulesEvents.PlaneCrashed, _ => crashes.Add("plane"));
            air.Sprites.Events.AddEventListener(RulesEvents.HelicopterCrashed, _ => crashes.Add("helicopter"));
            // A helicopter on the plane's row, 100 pixels ahead of it and flying west, back to where it took off at the west
            // edge, so the plane closes on it at 13 pixels a step
            air.Traffic.WorldSet(10, AirportY, CopterSprite.HeavyTraffic + 1);
            air.Sprites.GenerateCopter(0, 0, air.Traffic);
            Sprite copter = air.Copter!;
            copter.CopterFlight = CopterFlight.Returning;
            copter.X = plane.X + plane.XHot + 100 - copter.XHot;
            copter.Y = plane.Y + plane.YHot - copter.YHot;
            copter.Frame = 7;

            for (int step = 0; step < 20; step++)
            {
                air.Step();
            }

            if (disasters)
            {
                CollectionAssert.AreEqual(new[] { "helicopter", "plane" }, crashes);
                Assert.AreEqual((0L, 0L), (plane.Frame, copter.Frame));
            }
            else
            {
                Assert.IsEmpty(crashes);
                Assert.AreNotEqual(0L, plane.Frame);
            }
        }

        // A plane saved and loaded flies on as the plane never saved does: departing in its take-off frames, and arriving
        [TestMethod]
        [DataRow(PlanePhase.Departing)]
        [DataRow(PlanePhase.Arriving)]
        public void Save_PlaneInEachPhase_LoadsToTheSameFlight(PlanePhase phase)
        {
            AirSpace air = AirSpace.Of();
            Position airport = air.BuildAirport(WestX, AirportY);
            Sprite plane = phase == PlanePhase.Arriving ? Arriving(air, airport) : air.Sprites.GeneratePlane(airport.X, airport.Y)!;
            air.Step();

            Simulation loaded = Simulation.FromSave(CanonicalJson.Write(air.City.Save()));
            PlaneFlight flight = loaded.SpriteManager.GetSprite(SpriteType.Airplane)!.PlaneFlight!;
            Assert.AreEqual((plane.PlaneFlight!.Phase, plane.PlaneFlight!.Airport), (flight.Phase, flight.Airport));

            for (int step = 0; step < 400; step++)
            {
                air.Step();
                loaded.SpriteManager.MoveObjects(loaded.ConstructSimData());
            }

            Assert.AreEqual(CanonicalJson.Write(air.City.Save()), CanonicalJson.Write(loaded.Save()));
        }

        private static Sprite Arriving(AirSpace air, Position airport)
        {
            Sprite plane = air.Sprites.GeneratePlane(airport.X, airport.Y)!;
            AirplaneSprite.Arrive(air.Sprites, plane, airport);
            return plane;
        }
    }
}
