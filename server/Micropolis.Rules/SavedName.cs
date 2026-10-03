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

using System.Text;

namespace Micropolis.Rules
{
    /// <summary>
    /// The name a save gives a member of a closed set, such as <see cref="CityClass.Megalopolis"/> or
    /// <see cref="ScoreReason.ResOversupply"/>: its C# name in capitals, with an underscore between words, as
    /// <c>"MEGALOPOLIS"</c> and <c>"RES_OVERSUPPLY"</c> in <c>src/protocol.ts</c>.
    /// </summary>
    internal static class SavedName
    {
        public static string Of<T>(T member) where T : struct, Enum
        {
            string name = member.ToString();
            StringBuilder saved = new StringBuilder(name.Length + 4);

            for (int i = 0; i < name.Length; i++)
            {
                if (i > 0 && char.IsUpper(name[i]))
                {
                    saved.Append('_');
                }

                saved.Append(char.ToUpperInvariant(name[i]));
            }

            return saved.ToString();
        }

        /// <summary>
        /// Every member's name, in the members' order.
        /// </summary>
        public static IReadOnlyList<string> All<T>() where T : struct, Enum
        {
            return Enum.GetValues<T>().Select(Of).ToList();
        }

        public static T Parse<T>(string name) where T : struct, Enum
        {
            return Enum.GetValues<T>().Single(member => Of(member) == name);
        }
    }
}
