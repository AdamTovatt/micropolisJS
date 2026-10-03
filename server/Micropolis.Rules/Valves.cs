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
    /// Residential, commercial and industrial demand, and whether the advisor has capped each.
    /// </summary>
    public sealed class Valves
    {
        public long ResValve { get; internal set; }

        public long ComValve { get; internal set; }

        public long IndValve { get; internal set; }

        public bool ResCap { get; internal set; }

        public bool ComCap { get; internal set; }

        public bool IndCap { get; internal set; }

        /// <summary>
        /// Raises <see cref="Messages.VALVES_UPDATED"/>, as <c>src/valves.js</c> does.
        /// </summary>
        internal EventEmitter Events { get; } = new EventEmitter();

        public void SetValves(Level gameLevel, Census census, Budget budget)
        {
            throw new NotPortedException("valves.setValves");
        }

        internal void Save(JsonObject saveData)
        {
            saveData["valves"] = new JsonObject
            {
                ["resValve"] = ResValve,
                ["comValve"] = ComValve,
                ["indValve"] = IndValve,
                ["resCap"] = ResCap,
                ["comCap"] = ComCap,
                ["indCap"] = IndCap,
            };
        }

        internal void Load(SavedObject saveData)
        {
            saveData.ReadObject("valves", valves =>
            {
                ResValve = valves.ReadSafeInteger("resValve");
                ComValve = valves.ReadSafeInteger("comValve");
                IndValve = valves.ReadSafeInteger("indValve");
                ResCap = valves.ReadBool("resCap");
                ComCap = valves.ReadBool("comCap");
                IndCap = valves.ReadBool("indCap");
            });
        }
    }
}
