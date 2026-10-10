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

using System.Text.Json;
using static Micropolis.Rules.Tests.TripRoutes;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The trips offered for the client's cars, trains and walkers: that each run of a route by road, each ride and each
    /// walk is offered as it is routed, in order, the ninths a walk goes through, how a trip is written, and that a
    /// city's run offers the same trips every time, its runs by road on road, its rides on rail from station to station
    /// and its walks on walkway or open land.
    /// </summary>
    [TestClass]
    public sealed class TripsTests
    {
        // Computed once, as each run takes 3,000 steps
        private static readonly Lazy<CityRun> Commuters = new Lazy<CityRun>(RunCommuters);

        [TestMethod]
        public void Routed_SeveralTripsByRoad_OffersEachAsItIsRoutedInOrder()
        {
            Trips trips = new Trips(() => 0);
            List<Trip> offered = new List<Trip>();
            trips.RunOffered += offered.Add;

            trips.Routed(RouteBy(TravelMode.Road, (9, 8), (9, 7), (9, 6)));
            Assert.HasCount(1, offered);
            trips.Routed(RouteBy(TravelMode.Road, (30, 20), (31, 20)));

            CollectionAssert.AreEqual(new[] { new Trip(9, 8, "NN"), new Trip(30, 20, "E") }, offered);
        }

        // East along row 10 from (10, 10): a walk of two tiles, a ride from (12, 10) to (15, 10), a run by road to
        // (17, 10), a ride from (18, 10) north to (18, 8), a lone tile by road, and a walk. Each run by road of two
        // tiles or more is a trip, each ride a ride, in the route's order; the walks and the lone tile are nothing.
        [TestMethod]
        public void Routed_RouteRidingAndWalking_OffersItsRunsByRoadAndItsRidesInOrder()
        {
            Trips trips = new Trips(() => 0);
            List<string> heard = new List<string>();
            trips.RunOffered += trip => heard.Add($"road {JsonSerializer.Serialize(trip)}");
            trips.RideOffered += ride => heard.Add($"ride {JsonSerializer.Serialize(ride)}");

            trips.Routed(RidingAndWalking());

            CollectionAssert.AreEqual(new[]
            {
                $"ride [12,10,\"EEE\",{Timetable.NextDeparture(12, 10, 0)}]",
                "road [16,10,\"E\"]",
                $"ride [18,10,\"NN\",{Timetable.NextDeparture(18, 10, 0)}]",
            }, heard);
        }

        // The same route, walks heard too: the first walk across open land from the middle of its first tile's side
        // facing the zone, west of it, along the middle row to the side facing the station it gets on at; the last from
        // the middle of the side facing the road it came by to the side facing the zone, east of it
        [TestMethod]
        public void Routed_RouteRidingAndWalking_OffersItsWalksOverNinthsInTheRoutesOrder()
        {
            Trips trips = new Trips(() => 0);
            List<string> heard = new List<string>();
            trips.RunOffered += trip => heard.Add($"road {JsonSerializer.Serialize(trip)}");
            trips.RideOffered += ride => heard.Add($"ride {JsonSerializer.Serialize(ride)}");
            trips.WalkOffered += walk => heard.Add($"walk {JsonSerializer.Serialize(walk)}");

            trips.Routed(RidingAndWalking());

            CollectionAssert.AreEqual(new[]
            {
                "walk [30,31,\"EEEEE\"]",
                $"ride [12,10,\"EEE\",{Timetable.NextDeparture(12, 10, 0)}]",
                "road [16,10,\"E\"]",
                $"ride [18,10,\"NN\",{Timetable.NextDeparture(18, 10, 0)}]",
                "walk [60,25,\"EE\"]",
            }, heard);
        }

        // A walk over one tile of open land goes from the middle of its side facing the zone it comes from to the nearest
        // ninth along its side facing the zone it goes to
        [TestMethod]
        [DataRow(TileUtils.WestSide, TileUtils.EastSide, "[30,31,\"EE\"]")]
        [DataRow(TileUtils.NorthSide, TileUtils.SouthSide, "[31,30,\"SS\"]")]
        [DataRow(TileUtils.NorthSide, TileUtils.EastSide, "[31,30,\"E\"]")]
        [DataRow(TileUtils.EastSide, TileUtils.WestSide, "[32,31,\"WW\"]")]
        public void Routed_WalkOverOneTile_GoesFromTheSideFacingOneZoneToTheSideFacingTheOther(int fromSide, int toSide,
                                                                                                string expected)
        {
            Assert.AreEqual(expected, JsonSerializer.Serialize(Walked(TripRoutes.Route(fromSide, toSide, By(TravelMode.Walk, (10, 10))))));
        }

        // Two tiles east, each with a path along its north row of ninths: the walk keeps to the path, from the zone west
        // of it to the zone east of it
        [TestMethod]
        public void Routed_WalkOnAPath_KeepsToThePathsNinths()
        {
            TripRoute route = TripRoutes.Route(TileUtils.WestSide, TileUtils.EastSide, Walking([0, 1, 2], (10, 10), (11, 10)));

            Assert.AreEqual(new Trip(30, 30, "EEEEE"), Walked(route));
        }

        // Open land at (10, 10), then a path east onto (11, 10), from its west side's middle turning south through its
        // middle, and on down the middle of (11, 11) to the zone south of it: the walk crosses the open land along the
        // middle to the path's end, and keeps to the path from there
        [TestMethod]
        public void Routed_WalkFromOpenLandOntoAPath_JoinsThePathWhereItTouches()
        {
            TripRoute route = TripRoutes.Route(TileUtils.WestSide, TileUtils.SouthSide,
                                               By(TravelMode.Walk, (10, 10)), Walking([3, 4, 7], (11, 10)), Walking([1, 4, 7], (11, 11)));

            Assert.AreEqual(new Trip(30, 31, "EEEESSSS"), Walked(route));
        }

        // A ride east to a station at (11, 10), then a path along the north row of (12, 10), east to the zone beside it:
        // the walk starts at the path's ninth along the side facing the station
        [TestMethod]
        public void Routed_WalkFromAStationOntoAPath_StartsAlongTheSideFacingTheStation()
        {
            TripRoute route = TripRoutes.Route(TileUtils.WestSide, TileUtils.EastSide,
                                               By(TravelMode.Rail, (10, 10), (11, 10)), Walking([0, 1, 2], (12, 10)));

            Assert.AreEqual(new Trip(36, 30, "EE"), Walked(route));
        }

        // East along row 10 from (10, 10), from a zone west of it to one east of it: a walk of two tiles, a ride from
        // (12, 10) to (15, 10), a run by road to (17, 10), a ride from (18, 10) north to (18, 8), a lone tile by road,
        // and a walk. Each run by road of two tiles or more is a trip, each ride a ride, in the route's order.
        private static TripRoute RidingAndWalking()
        {
            return TripRoutes.Route(TileUtils.WestSide, TileUtils.EastSide,
                                    By(TravelMode.Walk, (10, 10), (11, 10)),
                                    By(TravelMode.Rail, (12, 10), (13, 10), (14, 10), (15, 10)),
                                    By(TravelMode.Road, (16, 10), (17, 10)),
                                    By(TravelMode.Rail, (18, 10), (18, 9), (18, 8)),
                                    By(TravelMode.Road, (19, 8)),
                                    By(TravelMode.Walk, (20, 8)));
        }

        // The one walk a route offers
        private static Trip Walked(TripRoute route)
        {
            Trips trips = new Trips(() => 0);
            List<Trip> walked = new List<Trip>();
            trips.WalkOffered += walked.Add;

            trips.Routed(route);

            return walked.Single();
        }

        // A ride routed on a step boards the next departure from its station after it: one routed on the step a train
        // leaves boards the one after
        [TestMethod]
        [DataRow(0, 1)]
        [DataRow(1, 0)]
        [DataRow(Timetable.DepartureInterval - 1, 0)]
        public void Routed_Ride_IsStampedWithTheStationsNextDeparture(int stepsBeforeDeparture, int intervalsLater)
        {
            long departure = 5 * Timetable.DepartureInterval + Timetable.Offset(12, 10);
            Trips trips = new Trips(() => departure - stepsBeforeDeparture);
            List<Ride> offered = new List<Ride>();
            trips.RideOffered += offered.Add;

            trips.Routed(RouteBy(TravelMode.Rail, (12, 10), (13, 10)));

            Assert.AreEqual(new Ride(new Trip(12, 10, "E"), departure + intervalsLater * Timetable.DepartureInterval),
                            offered.Single());
        }

        // A car on one tile would go nowhere
        [TestMethod]
        public void Routed_RouteOfOneRoadTile_OffersNothing()
        {
            Trips trips = new Trips(() => 0);
            List<Trip> offered = new List<Trip>();
            trips.RunOffered += offered.Add;

            trips.Routed(RouteBy(TravelMode.Road, (9, 8)));

            Assert.IsEmpty(offered);
        }

        [TestMethod]
        public void Routed_StepEachWay_WritesItsLetter()
        {
            Trips trips = new Trips(() => 0);
            List<Trip> offered = new List<Trip>();
            trips.RunOffered += offered.Add;

            trips.Routed(RouteBy(TravelMode.Road, (5, 5), (5, 4), (6, 4), (6, 5), (5, 5)));

            Assert.AreEqual(new Trip(5, 5, "NESW"), offered.Single());
            Assert.AreEqual("[5,5,\"NESW\"]", JsonSerializer.Serialize(offered.Single()));
        }

        // A route steps only to a tile beside the one before, so one that skips a tile or stands still is a defect
        [TestMethod]
        [DataRow(5, 3)]
        [DataRow(5, 5)]
        [DataRow(6, 4)]
        public void Routed_RouteNotSteppingToATileBeside_Throws(int x, int y)
        {
            Trips trips = new Trips(() => 0);
            trips.RunOffered += _ => { };

            Assert.ThrowsExactly<InvalidOperationException>(() => trips.Routed(RouteBy(TravelMode.Road, (5, 5), (x, y))));
        }

        [TestMethod]
        public void Read_Trip_IsTheTripWritten()
        {
            Assert.AreEqual(new Trip(40, 31, "EESW"), JsonSerializer.Deserialize<Trip>("[40,31,\"EESW\"]"));
        }

        [TestMethod]
        [DataRow("{\"x\":1,\"y\":2,\"steps\":\"N\"}")]
        [DataRow("[1,2]")]
        [DataRow("[1,2,\"N\",3]")]
        [DataRow("[1.5,2,\"N\"]")]
        [DataRow("[1,\"2\",\"N\"]")]
        [DataRow("[1,2,\"NX\"]")]
        [DataRow("[1,2,\"n\"]")]
        [DataRow("[1,2,null]")]
        public void Read_NotATrip_Fails(string json)
        {
            Assert.ThrowsExactly<JsonException>(() => JsonSerializer.Deserialize<Trip>(json));
        }

        [TestMethod]
        public void Read_Ride_IsTheRideWritten()
        {
            Ride ride = new Ride(new Trip(40, 31, "EESW"), 1234567);

            Assert.AreEqual("[40,31,\"EESW\",1234567]", JsonSerializer.Serialize(ride));
            Assert.AreEqual(ride, JsonSerializer.Deserialize<Ride>("[40,31,\"EESW\",1234567]"));
        }

        [TestMethod]
        [DataRow("[1,2,\"N\"]")]
        [DataRow("[1,2,\"N\",-1]")]
        [DataRow("[1,2,\"N\",1.5]")]
        [DataRow("[1,2,\"N\",\"3\"]")]
        [DataRow("[1,2,\"N\",3,4]")]
        [DataRow("[1,2,\"NX\",3]")]
        public void Read_NotARide_Fails(string json)
        {
            Assert.ThrowsExactly<JsonException>(() => JsonSerializer.Deserialize<Ride>(json));
        }

        // Trains leave a station only at its departures: every ride the commuters' run offers boards one of its station's
        // departures, the first after the step it was routed on
        [TestMethod]
        public void RideOffered_CommutersRun_BoardsTheNextDepartureFromItsStation()
        {
            Assert.AreEqual("", string.Join(", ", Commuters.Value.Faults.Where(fault => fault.StartsWith("departure"))));
        }

        [TestMethod]
        public void RunOffered_CommutersRun_OnlyRoadTiles()
        {
            Assert.IsGreaterThan(20, Commuters.Value.Trips.Count, "Too few trips offered to check.");
            Assert.AreEqual("", string.Join(", ", Commuters.Value.Faults.Where(fault => fault.StartsWith("trip"))));
        }

        // Each ride starts and ends at a station and runs on rail between
        [TestMethod]
        public void RideOffered_CommutersRun_RunFromStationToStationOnRail()
        {
            Assert.IsGreaterThan(20, Commuters.Value.Rides.Count, "Too few rides offered to check.");
            Assert.AreEqual("", string.Join(", ", Commuters.Value.Faults.Where(fault => fault.StartsWith("ride"))));
        }

        [TestMethod]
        public void RunOffered_CommutersRunAgain_IsTheSame()
        {
            CityRun again = RunCommuters();

            CollectionAssert.AreEqual(Commuters.Value.Trips, again.Trips);
            CollectionAssert.AreEqual(Commuters.Value.Rides, again.Rides);
        }

        // Each walk goes over open land or the ninths of a walkway, as the map had it then, the same every time
        [TestMethod]
        public void WalkOffered_WalkersRun_OnlyOpenLandAndWalkwaysTheSameEveryTime()
        {
            CityRun run = Run("walkers");

            Assert.IsGreaterThan(20, run.Walks.Count, "Too few walks offered to check.");
            Assert.AreEqual("", string.Join(", ", run.Faults.Where(fault => fault.StartsWith("walk"))));
            CollectionAssert.AreEqual(run.Walks, Run("walkers").Walks);
        }

        // The same 600 steps offer trips and rides while the city runs, so none offered while paused is the pause's doing
        [TestMethod]
        public void Step_Paused_OffersNothingWhereRunningOffersTrips()
        {
            Assert.IsGreaterThan(5, CommutersTripsOver600Steps(paused: false), "Too few trips offered running to check against.");
            Assert.AreEqual(0, CommutersTripsOver600Steps(paused: true));
        }

        // The commuters' line with its stations taken back to plain rail carries no one, where with them it carries rides
        [TestMethod]
        public void RideOffered_CommutersLineWithoutStations_CarriesNoOne()
        {
            Assert.IsGreaterThan(5, CommutersRidesOver600Steps(stations: true), "Too few rides with the stations to check against.");
            Assert.AreEqual(0, CommutersRidesOver600Steps(stations: false));
        }

        private static int CommutersRidesOver600Steps(bool stations)
        {
            Simulation city = FixtureCities.City("commuters", "run");
            int ridden = 0;
            city.Trips.RideOffered += _ => ridden++;
            if (!stations)
            {
                RemoveStations(city.Map);
            }

            for (int i = 0; i < 600; i++)
            {
                city.Step();
            }

            return ridden;
        }

        // Takes each station back to the straight rail it stands on
        private static void RemoveStations(GameMap map)
        {
            for (int x = 0; x < map.Width; x++)
            {
                for (int y = 0; y < map.Height; y++)
                {
                    int tile = map.GetTileValue(x, y);
                    if (TileUtils.IsRailStation(tile))
                    {
                        map.SetTile(x, y, TileUtils.TrackUnder(tile), TileFlags.BLBNBIT);
                    }
                }
            }
        }

        private static int CommutersTripsOver600Steps(bool paused)
        {
            Simulation city = FixtureCities.City("commuters", "run");
            int offered = 0;
            city.Trips.RunOffered += _ => offered++;
            city.Trips.RideOffered += _ => offered++;
            if (paused)
            {
                city.SetSpeed(Speed.Paused);
            }

            for (int i = 0; i < 600; i++)
            {
                city.Step();
            }

            return offered;
        }

        private static CityRun RunCommuters()
        {
            return Run("commuters");
        }

        // The trips, rides and walks of the fixture over 3,000 steps from its run save, and each tile of a trip no car
        // drives on, of a ride no train runs on, or a ride's end that is no station, and each ninth of a walk on neither
        // walkway nor open land, as the map had it then
        private static CityRun Run(string fixture)
        {
            Simulation city = FixtureCities.City(fixture, "run");
            List<Trip> trips = new List<Trip>();
            List<Ride> rides = new List<Ride>();
            List<Trip> walks = new List<Trip>();
            List<string> faults = new List<string>();
            int step = 0;

            city.Trips.WalkOffered += walk =>
            {
                walks.Add(walk);
                foreach (TilePosition ninth in TripRoutes.Tiles(walk))
                {
                    (int x, int y, int n) = Walkways.Locate(ninth.X, ninth.Y);
                    int tile = city.Map.GetTileValue(x, y);
                    if (!Walkways.IsOpenLand(tile) && (Walkways.UsableMask(city.Map.GetWalkway(x, y), tile) & (1 << n)) == 0)
                    {
                        faults.Add($"walk off walkway and open land at ninth ({ninth.X}, {ninth.Y}) at step {step}");
                    }
                }
            };

            city.Trips.RunOffered += trip =>
            {
                trips.Add(trip);
                faults.AddRange(TripRoutes.Tiles(trip).Where(tile => !TileUtils.CarriesCars(city.Map.GetTileValue(tile.X, tile.Y)))
                                          .Select(tile => $"trip off road at ({tile.X}, {tile.Y}) at step {step}"));
            };
            city.Trips.RideOffered += ride =>
            {
                rides.Add(ride);
                List<TilePosition> tiles = TripRoutes.Tiles(ride);
                faults.AddRange(tiles.Where(tile => !TileUtils.CarriesTrains(city.Map.GetTileValue(tile.X, tile.Y)))
                                     .Select(tile => $"ride off rail at ({tile.X}, {tile.Y}) at step {step}"));
                faults.AddRange(new[] { tiles[0], tiles[^1] }.Where(tile => !TileUtils.IsRailStation(city.Map.GetTileValue(tile.X, tile.Y)))
                                                             .Select(tile => $"ride ending off a station at ({tile.X}, {tile.Y}) at step {step}"));

                // The clock has counted this step as the scan routes it
                long wait = ride.Departure - city.StepClock;
                if (wait < 1 || wait > Timetable.DepartureInterval ||
                    ride.Departure % Timetable.DepartureInterval != Timetable.Offset(ride.Path.X, ride.Path.Y))
                {
                    faults.Add($"departure {ride.Departure} from ({ride.Path.X}, {ride.Path.Y}) at step clock {city.StepClock}");
                }
            };

            for (; step < 3000; step++)
            {
                city.Step();
            }

            return new CityRun(trips, rides, walks, faults);
        }

        // A route over the tiles in turn, every one the same way, from a zone west of it to one east of it
        private static TripRoute RouteBy(TravelMode mode, params (int X, int Y)[] tiles)
        {
            return Route(TileUtils.WestSide, TileUtils.EastSide, By(mode, tiles));
        }

        private sealed record CityRun(List<Trip> Trips, List<Ride> Rides, List<Trip> Walks, List<string> Faults);
    }
}
