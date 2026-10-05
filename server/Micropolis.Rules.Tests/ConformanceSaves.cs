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

using Micropolis.Conformance;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The saved states the fixture tool writes under <c>conformance/saves/</c> (<see cref="FixtureSaves"/>), as test
    /// data: each fixture's as built and after its golden run.
    /// </summary>
    public static class ConformanceSaves
    {
        public static IEnumerable<object[]> AllSaves => FixtureSaves.All.Select(save => new object[] { save });
    }
}
