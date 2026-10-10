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
    /// Finds the stream a test needs: the first seed whose stream passes a test that draws from it as the code under
    /// test will. A trip's draws are the router's own, which <see cref="Trip"/> takes by routing the trip on the test's
    /// map, so no test copies how the router draws.
    /// </summary>
    internal static class Seeds
    {
        public static uint First(Func<uint, RandomStream> streamOf, Func<RandomStream, bool> test)
        {
            uint seed = 1;
            while (!test(streamOf(seed)))
            {
                seed++;
            }

            return seed;
        }

        /// <summary>
        /// Takes from the stream what a trip from the zone centred at (<paramref name="x"/>, <paramref name="y"/>)
        /// takes, routing it on the map as the trip will be, and says what it came to.
        /// </summary>
        public static TrafficResult Trip(GameMap map, BlockMaps blockMaps, int x, int y, TrafficDestination destination,
                                         RandomStream random)
        {
            return new TripRouter(map).Route(new Position(x, y), destination, blockMaps, random, new TripRoute());
        }
    }
}
