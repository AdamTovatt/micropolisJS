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
using static Micropolis.Rules.TileValues;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The trips offered for the client's cars: that every trip on road alone is offered as it is routed, in order, how a
    /// trip is written, and that a city's run offers the same trips every time, on road alone.
    /// </summary>
    [TestClass]
    public sealed class TripsTests
    {
        // A road three tiles long, north from (9, 8)
        private static readonly IReadOnlyList<Position> Road = [new Position(9, 8), new Position(9, 7), new Position(9, 6)];

        // A road east along row 20, from (30, 20)
        private static readonly IReadOnlyList<Position> OtherRoad = [new Position(30, 20), new Position(31, 20)];

        // Computed once, as each run takes 3,000 steps
        private static readonly Lazy<TownRun> Town = new Lazy<TownRun>(RunTown);

        [TestMethod]
        public void Routed_SeveralTripsOnRoad_OffersEachAsItIsRoutedInOrder()
        {
            Trips trips = new Trips(RoadMap([.. Road, .. OtherRoad]));
            List<Trip> offered = new List<Trip>();
            trips.Offered += offered.Add;

            trips.Routed(Road);
            Assert.HasCount(1, offered);
            trips.Routed(OtherRoad);

            CollectionAssert.AreEqual(new[] { new Trip(9, 8, "NN"), new Trip(30, 20, "E") }, offered);
        }

        // A route may run on rail, where no car drives, so a trip with a rail tile is not offered; a road crossing rail
        // is road
        [TestMethod]
        [DataRow(HRAIL, false)]
        [DataRow(RAILVPOWERH, false)]
        [DataRow(VRAILROAD, true)]
        public void Routed_RouteThroughTheTile_IsOfferedOnlyIfACarDrivesOnIt(int tileValue, bool offered)
        {
            GameMap map = RoadMap(OtherRoad);
            map.SetTile(31, 20, tileValue, 0);
            Trips trips = new Trips(map);
            List<Trip> heard = new List<Trip>();
            trips.Offered += heard.Add;

            trips.Routed(OtherRoad);

            CollectionAssert.AreEqual(offered ? new[] { new Trip(30, 20, "E") } : [], heard);
        }

        [TestMethod]
        public void Routed_StepEachWay_WritesItsLetter()
        {
            IReadOnlyList<Position> loop = [new Position(5, 5), new Position(5, 4), new Position(6, 4), new Position(6, 5),
                                            new Position(5, 5)];
            Trips trips = new Trips(RoadMap(loop));
            List<Trip> offered = new List<Trip>();
            trips.Offered += offered.Add;

            trips.Routed(loop);

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
            IReadOnlyList<Position> route = [new Position(5, 5), new Position(x, y)];
            Trips trips = new Trips(RoadMap(route));
            trips.Offered += _ => { };

            Assert.ThrowsExactly<InvalidOperationException>(() => trips.Routed(route));
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
        public void Offered_TownRun_OnlyRoadTiles()
        {
            Assert.IsGreaterThan(20, Town.Value.Offers.Count, "Too few trips offered to check.");
            Assert.AreEqual("", string.Join(", ", Town.Value.OffRoad), "Trips offered with a tile no car drives on.");
        }

        [TestMethod]
        public void Offered_TownRunAgain_IsTheSame()
        {
            CollectionAssert.AreEqual(Town.Value.Offers, RunTown().Offers);
        }

        // The same 600 steps offer trips while the city runs, so none offered while paused is the pause's doing
        [TestMethod]
        public void Step_Paused_OffersNothingWhereRunningOffersTrips()
        {
            Assert.IsGreaterThan(5, TownTripsOver600Steps(paused: false), "Too few trips offered running to check against.");
            Assert.AreEqual(0, TownTripsOver600Steps(paused: true));
        }

        private static int TownTripsOver600Steps(bool paused)
        {
            Simulation city = FixtureCities.City("town", "run");
            int offered = 0;
            city.Trips.Offered += _ => offered++;
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

        // The trips of the town with rail laid over every third tile of its east-west roads, so many of its trips run
        // on rail, over 3,000 steps from its run save, and each tile of them that no car drives on, as the map had it
        // then
        private static TownRun RunTown()
        {
            Simulation city = FixtureCities.City("town", "run");
            for (int x = 0; x < city.Map.Width; x += 3)
            {
                for (int y = 0; y < city.Map.Height; y++)
                {
                    if (city.Map.GetTileValue(x, y) == ROADS)
                    {
                        city.Map.SetTile(x, y, HRAIL, TileFlags.BULLBIT);
                    }
                }
            }

            List<Trip> offered = new List<Trip>();
            List<string> offRoad = new List<string>();
            int step = 0;

            city.Trips.Offered += trip =>
            {
                offered.Add(trip);
                offRoad.AddRange(TripRoutes.Tiles(trip).Where(tile => !TileUtils.CarriesCars(city.Map.GetTileValue(tile.X, tile.Y)))
                                            .Select(tile => $"({tile.X}, {tile.Y}) at step {step}"));
            };

            for (; step < 3000; step++)
            {
                city.Step();
            }

            return new TownRun(offered, offRoad);
        }

        private static GameMap RoadMap(IEnumerable<Position> road)
        {
            GameMap map = new GameMap(120, 100);
            foreach (Position position in road)
            {
                map.SetTile(position.X, position.Y, ROADS, 0);
            }

            return map;
        }

        private sealed record TownRun(List<Trip> Offers, List<string> OffRoad);
    }
}
