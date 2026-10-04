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

using System.Text.Json;
using System.Text.Json.Nodes;
using Micropolis.Repository;
using Micropolis.Rules;

namespace Micropolis.Benchmarks
{
    /// <summary>
    /// The cities the benchmark runs, the one list both measurements take: each fixture <c>conformance/saves/</c>
    /// holds, from its city after its golden run at the speed it is saved at, then a new city at each running speed.
    /// </summary>
    internal static class BenchmarkCases
    {
        /// <summary>
        /// The fixtures made for the disasters, whose cities run with random disasters on, as issue #61 decides. Every
        /// other fixture runs with them off, as its golden run does.
        /// </summary>
        public static readonly IReadOnlySet<string> DisasterFixtures =
            new HashSet<string> { "disasters", "forestFire", "harbourWithDisasters" };

        /// <summary>
        /// The seed the new cities are generated from: any generated map would do, as long as both measurements take
        /// the same one.
        /// </summary>
        public const uint NewCitySeed = 0;

        public static IReadOnlyList<BenchmarkCase> All()
        {
            return Of(FixtureNames(File.ReadAllText(RepositoryFiles.GetPath("conformance/saves/checkpoints.json"))));
        }

        /// <summary>
        /// The cases of the fixtures given, then the new cities.
        /// </summary>
        internal static IReadOnlyList<BenchmarkCase> Of(IReadOnlyList<string> fixtures)
        {
            List<BenchmarkCase> cases = new List<BenchmarkCase>();

            foreach (string fixture in fixtures)
            {
                cases.Add(new FixtureCase(fixture, SavedSpeed(fixture), DisasterFixtures.Contains(fixture)));
            }

            foreach (Speed speed in new[] { Speed.Slow, Speed.Medium, Speed.Fast })
            {
                cases.Add(new NewCityCase(NewCitySeed, Level.Easy, speed));
            }

            return cases;
        }

        /// <summary>
        /// The case list the TypeScript measurement reads: the cases, with the steps to warm each up and to measure.
        /// </summary>
        public static string ToJson(IReadOnlyList<BenchmarkCase> cases, BenchmarkSettings settings)
        {
            JsonObject caseList = new JsonObject
            {
                ["warmup"] = settings.Warmup,
                ["steps"] = settings.Steps,
                ["cases"] = new JsonArray(cases.Select(benchmarkCase => (JsonNode)benchmarkCase.ToJson()).ToArray()),
            };

            return caseList.ToJsonString(new JsonSerializerOptions { WriteIndented = true });
        }

        /// <summary>
        /// The fixtures <c>checkpoints.json</c>'s text lists, in name order.
        /// </summary>
        internal static IReadOnlyList<string> FixtureNames(string checkpointsJson)
        {
            JsonObject checkpoints = JsonNode.Parse(checkpointsJson)!.AsObject();

            if (checkpoints.Count == 0)
            {
                throw new InvalidDataException("conformance/saves/checkpoints.json lists no fixtures.");
            }

            return checkpoints.Select(fixture => fixture.Key).Order(StringComparer.Ordinal).ToList();
        }

        private static Speed SavedSpeed(string fixture)
        {
            JsonNode save = JsonNode.Parse(File.ReadAllText(RepositoryFiles.GetPath($"conformance/saves/{fixture}.run.json")))!;
            return (Speed)(int)save["simulation"]!["speed"]!;
        }
    }
}
