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

namespace Micropolis.Server
{
    /// <summary>
    /// Whether this build answers the debug channel: holding, advancing and flushing a city, its city time, and the
    /// clock the tests move. A development build does, so the client's contract tests run against the real server; a
    /// release build, which is what publishing makes, refuses every request on it.
    /// </summary>
    internal static class DebugChannel
    {
        // Read-only rather than constant, so both builds compile every branch that reads it
#if DEBUG
        public static readonly bool IsBuiltIn = true;
#else
        public static readonly bool IsBuiltIn = false;
#endif
    }
}
