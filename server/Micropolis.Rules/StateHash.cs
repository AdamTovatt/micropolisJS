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

using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

namespace Micropolis.Rules
{
    /// <summary>
    /// The state hash, specified in <c>docs/state-hash.md</c>: SHA-256 over the UTF-8 bytes of the canonical text, as
    /// 64 lowercase hexadecimal digits.
    /// </summary>
    public static class StateHash
    {
        public static string HashSavedState(JsonNode saveData)
        {
            return HashCanonicalText(CanonicalJson.Write(saveData));
        }

        /// <summary>
        /// The state hash of a state given as its canonical text, such as a save under <c>conformance/saves/</c>.
        /// </summary>
        public static string HashCanonicalText(string canonicalText)
        {
            byte[] digest = SHA256.HashData(Encoding.UTF8.GetBytes(canonicalText));
            return Convert.ToHexStringLower(digest);
        }
    }
}
