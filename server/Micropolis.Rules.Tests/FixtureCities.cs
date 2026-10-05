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

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The fixtures' cities, from the saves the fixture tool writes under <c>conformance/saves/</c>.
    /// </summary>
    internal static class FixtureCities
    {
        /// <summary>
        /// A fixture's city by the name its save has in <c>conformance/saves/</c>, such as <c>town.built</c>.
        /// </summary>
        public static Simulation City(string save)
        {
            int dot = save.LastIndexOf('.');
            return City(save[..dot], save[(dot + 1)..]);
        }

        /// <summary>
        /// A fixture's city from its save at the point, <c>built</c> or <c>run</c>, with any change to the save made
        /// before it loads.
        /// </summary>
        public static Simulation City(string fixture, string point, Action<JsonObject>? change = null)
        {
            string text = FixtureSaves.At(fixture, point).ReadCommitted();

            if (change is null)
            {
                return Simulation.FromSave(text);
            }

            JsonObject saveData = JsonNode.Parse(text)!.AsObject();
            change(saveData);

            return Simulation.FromSave(CanonicalJson.Write(saveData));
        }
    }
}
