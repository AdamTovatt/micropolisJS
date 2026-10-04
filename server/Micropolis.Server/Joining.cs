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
    /// A connection joining a city at its request, which is answered once the connection has the whole city. Hold is
    /// whether the connection's debug channel holds the cities it is in, so the city is held before it takes another
    /// step, as a hold the browser's driver takes before a city starts applies from its first step.
    /// </summary>
    internal sealed record Joining(CityConnection Connection, long RequestId, bool Hold);
}
