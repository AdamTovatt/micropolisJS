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

namespace Micropolis.Rules
{
    /// <summary>
    /// The disasters' state: how long a flood has left, and whether random disasters happen.
    /// </summary>
    public sealed class DisasterManager
    {
        public long FloodCount { get; internal set; }

        public bool DisastersEnabled { get; internal set; }

        internal void Save(JsonObject saveData)
        {
            saveData["disasters"] = new JsonObject
            {
                ["floodCount"] = FloodCount,
                ["disastersEnabled"] = DisastersEnabled,
            };
        }

        internal void Load(SavedObject saveData)
        {
            saveData.ReadObject("disasters", disasters =>
            {
                FloodCount = disasters.ReadSafeInteger("floodCount");
                DisastersEnabled = disasters.ReadBool("disastersEnabled");
            });
        }
    }
}
