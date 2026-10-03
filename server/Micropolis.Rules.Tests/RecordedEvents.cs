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

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// An event the simulation emitted as the conformance files hold it, a unit snapshot's record and a city run alike:
    /// its name, and its payload unless it was emitted without one.
    /// </summary>
    internal static class RecordedEvents
    {
        public static JsonObject Of(string name, JsonNode? payload)
        {
            JsonObject recorded = new JsonObject { ["name"] = name };

            if (payload is not null)
            {
                recorded["payload"] = payload.DeepClone();
            }

            return recorded;
        }
    }
}
