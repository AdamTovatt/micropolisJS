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
    }
}
