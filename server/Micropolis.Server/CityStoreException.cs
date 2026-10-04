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
    /// The <see cref="CityStore"/> failed to read or write a city's file, such as on a full disk or in a directory the
    /// server may not write.
    /// </summary>
    internal sealed class CityStoreException : Exception
    {
        public CityStoreException(string message, Exception inner)
            : base(message, inner)
        {
        }
    }
}
