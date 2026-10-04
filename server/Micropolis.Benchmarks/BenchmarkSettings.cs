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

namespace Micropolis.Benchmarks
{
    /// <summary>
    /// How much each case runs: the steps that warm it up, then the steps measured, over a number of repeats.
    /// </summary>
    internal sealed record BenchmarkSettings(int Warmup, int Steps, int Repeats)
    {
        /// <summary>
        /// The committed report's. Both step counts are whole cycles of the city's 16 phases at every speed, a cycle
        /// taking 80 steps at slow, 48 at medium and 16 at fast, so no row times a part of a cycle. A timed run lasts tens
        /// of milliseconds or more, far past the timer's resolution, while the bytes, which the TypeScript host measures
        /// over the same steps, take minutes rather than hours.
        /// </summary>
        public static readonly BenchmarkSettings Default = new BenchmarkSettings(Warmup: 4800, Steps: 24000, Repeats: 5);
    }
}
