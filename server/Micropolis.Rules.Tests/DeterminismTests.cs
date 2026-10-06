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
    /// The same start gives one city, and different seeds give different cities: two runs in one process share nothing
    /// that changes how a city evolves, and the seed reaches the map and the stream.
    /// </summary>
    [TestClass]
    public sealed class DeterminismTests
    {
        // Past a year end at fast speed, with the first scans, the census and the evaluation behind it
        private const int Steps = 1000;

        private static string Run(Simulation city, int steps)
        {
            for (int i = 0; i < steps; i++)
            {
                city.Step();
            }

            return StateHash.HashSavedState(city.Save());
        }

        [TestMethod]
        public void NewCity_SameSeedTwice_ReachesOneHash()
        {
            Assert.AreEqual(Run(Simulation.NewCity(3, Level.Hard, Speed.Fast), Steps),
                            Run(Simulation.NewCity(3, Level.Hard, Speed.Fast), Steps));
        }

        [TestMethod]
        public void NewCity_TwoSeeds_ReachTwoHashes()
        {
            Assert.AreNotEqual(Run(Simulation.NewCity(3, Level.Hard, Speed.Fast), Steps),
                               Run(Simulation.NewCity(4, Level.Hard, Speed.Fast), Steps));
        }

        // A city with every kind of sprite, at the hard level with random disasters on, so the run draws from the stream
        // for the sprites and the disasters as well as the zones
        [TestMethod]
        public void FromSave_SameSaveTwice_ReachesOneHash()
        {
            Assert.AreEqual(Run(FixtureCities.City("harbourWithDisasters", "built"), Steps * 3),
                            Run(FixtureCities.City("harbourWithDisasters", "built"), Steps * 3));
        }

        // The underfunded town saved with a plane arriving at its airport and a helicopter on its way to traffic carries
        // on, flights and all, as the town never saved does
        [TestMethod]
        public void FromSave_AircraftInFlight_ReachesTheHashOfTheRunNeverSaved()
        {
            Simulation city = FixtureCities.City("underfunded", "run");
            Position airport = Enumerable.Range(0, city.Map.Width)
                .SelectMany(x => Enumerable.Range(0, city.Map.Height).Select(y => new Position(x, y)))
                .First(tile => city.Map.GetTileValue(tile) == TileValues.AIRPORT);
            city.BlockMaps.TrafficDensityMap.WorldSet(100, 10, CopterSprite.HeavyTraffic + 30);
            city.SpriteManager.GenerateCopter(airport.X, airport.Y, city.BlockMaps.TrafficDensityMap);
            // The town's run ends with a plane in flight, which arrives instead
            Sprite? plane = city.SpriteManager.GetSprite(SpriteType.Airplane);
            Assert.IsNotNull(plane, "Setup: the town's run ends with no plane in flight.");
            AirplaneSprite.Arrive(city.SpriteManager, plane, airport);
            for (int i = 0; i < 20; i++)
            {
                city.Step();
            }

            Assert.AreEqual(PlanePhase.Arriving, city.SpriteManager.GetSprite(SpriteType.Airplane)?.PlaneFlight!.Phase,
                            "Setup: the plane isn't arriving when the town is saved.");
            Assert.AreEqual(CopterPhase.ToTraffic, city.SpriteManager.GetSprite(SpriteType.Helicopter)?.CopterFlight!.Phase,
                            "Setup: the helicopter isn't flying to its traffic when the town is saved.");
            Simulation loaded = Simulation.FromSave(CanonicalJson.Write(city.Save()));

            Assert.AreEqual(Run(city, Steps), Run(loaded, Steps));
        }
    }
}
