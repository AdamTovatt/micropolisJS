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
    /// The trips offered for the client's cars: which routes are kept, when one is offered, and that a city's run offers
    /// the same trips every time, only at steps whose index is a multiple of six, on road alone.
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
        public void Stepped_TripKeptDuringStepZero_OffersItAsTheStepEnds()
        {
            Watch watch = new Watch(RoadMap(Road));

            watch.Trips.Arrived(Road);
            watch.Step();

            Assert.AreEqual(0, watch.Offered.Single().Step);
            CollectionAssert.AreEqual(Road.Select(Tile).ToList(), watch.Offered.Single().Route.ToList());
        }

        // A trip kept at step 1 waits for step 6, the next whose index is a multiple of six
        [TestMethod]
        public void Stepped_TripKeptBetweenMultiplesOfSix_OffersItAtTheNext()
        {
            Watch watch = new Watch(RoadMap(Road));
            watch.Step();

            watch.Trips.Arrived(Road);
            watch.Steps(5);

            Assert.IsEmpty(watch.Offered);
            watch.Step();
            Assert.AreEqual(6, watch.Offered.Single().Step);
        }

        [TestMethod]
        public void Stepped_SeveralTripsSinceTheLastOffered_OffersOnlyTheLatestOnce()
        {
            Watch watch = new Watch(RoadMap([.. Road, .. OtherRoad]));

            watch.Trips.Arrived(Road);
            watch.Trips.Arrived(OtherRoad);
            // Past the offers at steps 0, 6 and 12
            watch.Steps(13);

            CollectionAssert.AreEqual(OtherRoad.Select(Tile).ToList(), watch.Offered.Single().Route.ToList());
        }

        // A drive may run on rail, where no car drives, so a trip with a rail tile is dropped and the road trip before
        // it stays the latest kept; a road crossing rail is road
        [TestMethod]
        [DataRow(HRAIL, false)]
        [DataRow(RAILVPOWERH, false)]
        [DataRow(VRAILROAD, true)]
        public void Arrived_RouteThroughTheTile_IsKeptOnlyIfACarDrivesOnIt(int tileValue, bool kept)
        {
            GameMap map = RoadMap([.. Road, .. OtherRoad]);
            map.SetTile(31, 20, tileValue, 0);
            Watch watch = new Watch(map);

            watch.Trips.Arrived(Road);
            watch.Trips.Arrived(OtherRoad);
            watch.Step();

            CollectionAssert.AreEqual((kept ? OtherRoad : Road).Select(Tile).ToList(), watch.Offered.Single().Route.ToList());
        }

        // A trip kept at step 1 whose road a bulldozer takes up before step 6 is not offered there
        [TestMethod]
        public void Stepped_RoadTakenUpSinceTheTripArrived_OffersNothing()
        {
            GameMap map = RoadMap(Road);
            Watch watch = new Watch(map);
            watch.Step();

            watch.Trips.Arrived(Road);
            map.SetTile(9, 7, DIRT, 0);
            watch.Steps(6);

            Assert.IsEmpty(watch.Offered);
        }

        [TestMethod]
        public void Arrived_NothingListening_KeepsNothingForALaterListener()
        {
            Trips trips = new Trips(RoadMap(Road));
            trips.Arrived(Road);
            List<IReadOnlyList<TilePosition>> offered = new List<IReadOnlyList<TilePosition>>();

            trips.Offered += offered.Add;
            trips.Stepped();

            Assert.IsEmpty(offered);
        }

        [TestMethod]
        public void Offered_TownRun_OnlyRoadTiles()
        {
            Assert.IsGreaterThan(20, Town.Value.Offers.Count, "Too few trips offered to check.");
            Assert.AreEqual("", string.Join(", ", Town.Value.OffRoad), "Trips offered with a tile no car drives on.");
        }

        [TestMethod]
        public void Offered_TownRun_OnlyAtStepsWhoseIndexIsAMultipleOfSix()
        {
            Assert.IsGreaterThan(20, Town.Value.Offers.Count, "Too few trips offered to check.");
            Assert.AreEqual("", string.Join(", ", Town.Value.Offers.Where(offer => offer.Step % Trips.StepsPerOffer != 0).Select(offer => offer.Step)),
                            "Trips offered at steps whose index is not a multiple of six.");
        }

        [TestMethod]
        public void Offered_TownRun_EachRouteIsContiguous()
        {
            Assert.IsGreaterThan(20, Town.Value.Offers.Count, "Too few trips offered to check.");
            Assert.AreEqual("", string.Join(", ", Town.Value.Offers.Where(offer => !offer.Route.Zip(offer.Route.Skip(1)).All(pair => pair.First.IsNextTo(pair.Second)))
                                                                    .Select(Text)),
                            "Routes that skip a tile.");
        }

        [TestMethod]
        public void Offered_TownRunAgain_IsTheSame()
        {
            CollectionAssert.AreEqual(Town.Value.Offers.Select(Text).ToList(), RunTown().Offers.Select(Text).ToList());
        }

        // Steps taken while paused don't count: three steps, ten paused, then a run, offers only at multiples of six
        // among the steps taken while not paused, where counting the paused ten would offer at 2 more than a multiple
        [TestMethod]
        public void Step_Paused_OffersNothingAndCountsNoStep()
        {
            Simulation city = FixtureCities.City("town", "run");
            Speed speed = city.Speed;
            List<(long Step, bool Paused)> offers = new List<(long, bool)>();
            long step = 0;
            bool paused = false;
            city.Trips.Offered += _ => offers.Add((step, paused));

            for (; step < 3; step++)
            {
                city.Step();
            }

            city.SetSpeed(Speed.Paused);
            paused = true;
            for (int i = 0; i < 10; i++)
            {
                city.Step();
            }

            city.SetSpeed(speed);
            paused = false;
            for (; step < 600; step++)
            {
                city.Step();
            }

            Assert.IsGreaterThan(5, offers.Count, "Too few trips offered to check.");
            Assert.IsFalse(offers.Any(offer => offer.Paused), "A trip offered while paused.");
            Assert.AreEqual("", string.Join(", ", offers.Where(offer => offer.Step % Trips.StepsPerOffer != 0).Select(offer => offer.Step)),
                            "Trips offered at steps whose index, among those not paused, is not a multiple of six.");
        }

        // The trips of the town with rail laid over every third tile of its east-west roads, so many of its drives run
        // on rail, over 3,000 steps from its run save: each with the index of the step that offered it, and each tile of
        // them that no car drives on, as the map had it then
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

            List<(long, IReadOnlyList<TilePosition>)> offered = new List<(long, IReadOnlyList<TilePosition>)>();
            List<string> offRoad = new List<string>();
            long step = 0;

            city.Trips.Offered += route =>
            {
                offered.Add((step, route));
                offRoad.AddRange(route.Where(tile => !TileUtils.CarriesCars(city.Map.GetTileValue(tile.X, tile.Y)))
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

        private static TilePosition Tile(Position position)
        {
            return new TilePosition(position.X, position.Y);
        }

        private static string Text((long Step, IReadOnlyList<TilePosition> Route) offer)
        {
            return $"{offer.Step}: {string.Join(" ", offer.Route)}";
        }

        private sealed record TownRun(List<(long Step, IReadOnlyList<TilePosition> Route)> Offers, List<string> OffRoad);

        // Trips on the map with the steps counted beside them, and each trip offered with the index of the step that
        // offered it
        private sealed class Watch
        {
            private long _step;

            public Watch(GameMap map)
            {
                Trips = new Trips(map);
                Trips.Offered += route => Offered.Add((_step, route));
            }

            public Trips Trips { get; }

            public List<(long Step, IReadOnlyList<TilePosition> Route)> Offered { get; } = new List<(long, IReadOnlyList<TilePosition>)>();

            public void Step()
            {
                Trips.Stepped();
                _step++;
            }

            public void Steps(int count)
            {
                for (int i = 0; i < count; i++)
                {
                    Step();
                }
            }
        }
    }
}
