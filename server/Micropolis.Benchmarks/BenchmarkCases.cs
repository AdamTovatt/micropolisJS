/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
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
using Micropolis.Conformance;
using Micropolis.Rules;

namespace Micropolis.Benchmarks
{
    /// <summary>
    /// The cities the benchmark runs, the one list both measurements take: each fixture (<see cref="Fixtures.All"/>), in
    /// name order, from its city after its golden run at the speed it is saved at, with random disasters on for a
    /// fixture made for them (<see cref="Fixture.ForDisasters"/>) and off for every other, as its golden run has them;
    /// then a new city at each running speed.
    /// </summary>
    internal static class BenchmarkCases
    {
        /// <summary>
        /// The seed the new cities are generated from: any generated map would do.
        /// </summary>
        public const uint NewCitySeed = 0;

        public static IReadOnlyList<BenchmarkCase> All()
        {
            return Of(Fixtures.All);
        }

        /// <summary>
        /// The cases of the fixtures given, in name order, then the new cities.
        /// </summary>
        internal static IReadOnlyList<BenchmarkCase> Of(IReadOnlyList<Fixture> fixtures)
        {
            List<BenchmarkCase> cases = new List<BenchmarkCase>();

            foreach (Fixture fixture in fixtures.OrderBy(fixture => fixture.Name, StringComparer.Ordinal))
            {
                cases.Add(new FixtureCase(fixture.Name, SavedSpeed(fixture.Name), fixture.ForDisasters));
            }

            foreach (Speed speed in RunningSpeeds.All)
            {
                cases.Add(new NewCityCase(NewCitySeed, Level.Easy, speed));
            }

            return cases;
        }

        private static Speed SavedSpeed(string fixture)
        {
            JsonNode save = JsonNode.Parse(FixtureSaves.At(fixture, FixtureSaves.Run).ReadCommitted())!;
            return (Speed)(int)save["simulation"]!["speed"]!;
        }
    }
}
