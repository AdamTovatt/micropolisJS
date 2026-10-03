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

namespace Micropolis.Rules
{
    /// <summary>
    /// A unit of work the C# port does not have yet, reached by a run. A unit that skipped its work instead would let
    /// the city diverge from the TypeScript reference silently; this stops the run and names the unit.
    /// </summary>
    public sealed class NotPortedException : Exception
    {
        public NotPortedException(string unit)
            : base($"{unit} is not ported yet.")
        {
            Unit = unit;
        }

        /// <summary>
        /// The unit's TypeScript name, its module and function as <c>src/</c> names them, such as
        /// <c>census.take10Census</c> or <c>residential.residentialFound</c>: the name a unit snapshot records it under,
        /// for every unit a snapshot can reach. <c>spriteManager.moveObjects</c>, which the step loop calls, is outside
        /// the snapshots: they are recorded from cities without sprites, where moving them does nothing.
        /// </summary>
        public string Unit { get; }
    }
}
