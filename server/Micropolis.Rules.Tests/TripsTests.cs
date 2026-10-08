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

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The trips offered for the client's cars and trains: that each run of a route by road and each ride is offered as
    /// it is routed, in order, how a trip is written, and that a city's run offers the same trips every time, its runs
    /// by road on road and its rides on rail from station to station.
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

            trips.Routed(By(TravelMode.Road, (9, 8), (9, 7), (9, 6)));
            Assert.HasCount(1, offered);
            trips.Routed(By(TravelMode.Road, (30, 20), (31, 20)));

            CollectionAssert.AreEqual(new[] { new Trip(9, 8, "NN"), new Trip(30, 20, "E") }, offered);
        }

        // East along row 10 from (10, 10): a walk of two tiles, a ride from (12, 10) to (15, 10), a run by road to
        // (17, 10), a ride from (18, 10) north to (18, 8), a lone tile by road, and a walk. Each run by road of two
        // tiles or more is a trip, each ride a ride, in the route's order; the walks and the lone tile are nothing.
        [TestMethod]
        public void Routed_RouteRidingAndWalking_OffersItsRunsByRoadAndItsRidesInOrder()
        {
            List<RouteStep> route =
            [
                .. By(TravelMode.Walk, (10, 10), (11, 10)),
                .. By(TravelMode.Rail, (12, 10), (13, 10), (14, 10), (15, 10)),
                .. By(TravelMode.Road, (16, 10), (17, 10)),
                .. By(TravelMode.Rail, (18, 10), (18, 9), (18, 8)),
                .. By(TravelMode.Road, (19, 8)),
                .. By(TravelMode.Walk, (20, 8)),
            ];
            Trips trips = new Trips(() => 0);
            List<string> heard = new List<string>();
            trips.RunOffered += trip => heard.Add($"road {JsonSerializer.Serialize(trip)}");
            trips.RideOffered += ride => heard.Add($"ride {JsonSerializer.Serialize(ride)}");

            trips.Routed(route);

            CollectionAssert.AreEqual(new[]
            {
                $"ride [12,10,\"EEE\",{Timetable.NextDeparture(12, 10, 0)}]",
                "road [16,10,\"E\"]",
                $"ride [18,10,\"NN\",{Timetable.NextDeparture(18, 10, 0)}]",
            }, heard);
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

            trips.Routed(By(TravelMode.Rail, (12, 10), (13, 10)));

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

            trips.Routed(By(TravelMode.Road, (9, 8)));

            Assert.IsEmpty(offered);
        }

        [TestMethod]
        public void Routed_StepEachWay_WritesItsLetter()
        {
            Trips trips = new Trips(() => 0);
            List<Trip> offered = new List<Trip>();
            trips.RunOffered += offered.Add;

            trips.Routed(By(TravelMode.Road, (5, 5), (5, 4), (6, 4), (6, 5), (5, 5)));

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

            Assert.ThrowsExactly<InvalidOperationException>(() => trips.Routed(By(TravelMode.Road, (5, 5), (x, y))));
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

        // The trips and rides of the commuters fixture over 3,000 steps from its run save, and each tile of a trip no car
        // drives on, of a ride no train runs on, or a ride's end that is no station, as the map had it then
        private static CityRun RunCommuters()
        {
            Simulation city = FixtureCities.City("commuters", "run");
            List<Trip> trips = new List<Trip>();
            List<Ride> rides = new List<Ride>();
            List<string> faults = new List<string>();
            int step = 0;

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

            return new CityRun(trips, rides, faults);
        }

        // A route over the tiles in turn, every one the same way
        private static List<RouteStep> By(TravelMode mode, params (int X, int Y)[] tiles)
        {
            return tiles.Select(tile => new RouteStep(new Position(tile.X, tile.Y), mode)).ToList();
        }

        private sealed record CityRun(List<Trip> Trips, List<Ride> Rides, List<string> Faults);
    }
}
