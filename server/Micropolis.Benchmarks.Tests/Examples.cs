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

using Micropolis.Rules;
using Micropolis.SourceTree;

namespace Micropolis.Benchmarks.Tests
{
    /// <summary>
    /// The examples under <c>server/Micropolis.Benchmarks/examples/</c> of the two files the C# and TypeScript halves
    /// hand each other, which both test suites read in place: the case list the C# writes, and the bytes the TypeScript
    /// measures for it.
    /// </summary>
    internal static class Examples
    {
        /// <summary>
        /// The settings and cases <c>caseList.json</c> lists.
        /// </summary>
        public static readonly BenchmarkSettings Settings = new BenchmarkSettings(Warmup: 16, Steps: 32, Repeats: 1);

        public static readonly BenchmarkCase[] Cases =
        [
            new FixtureCase("suburb", Speed.Medium, false),
            new FixtureCase("disasters", Speed.Medium, true),
            new NewCityCase(0, Level.Easy, Speed.Fast),
        ];

        public static string Read(string name)
        {
            return File.ReadAllText(RepositoryFiles.GetPath($"server/Micropolis.Benchmarks/examples/{name}"));
        }
    }
}
