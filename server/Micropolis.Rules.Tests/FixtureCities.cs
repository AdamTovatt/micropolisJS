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
    /// The fixtures' cities, from the saves the TypeScript reference writes under <c>conformance/saves/</c>.
    /// </summary>
    internal static class FixtureCities
    {
        /// <summary>
        /// A fixture's city from its save at the point, <c>built</c> or <c>run</c>, with any change to the save made
        /// before it loads.
        /// </summary>
        public static Simulation City(string fixture, string point, Action<JsonObject>? change = null)
        {
            ConformanceSave save = ConformanceSaves.Load().Single(save => save.Fixture == fixture && save.Point == point);

            if (change is null)
            {
                return Simulation.FromSave(save.ReadText());
            }

            JsonObject saveData = JsonNode.Parse(save.ReadText())!.AsObject();
            change(saveData);

            return Simulation.FromSave(CanonicalJson.Write(saveData));
        }
    }
}
