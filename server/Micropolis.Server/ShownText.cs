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

using System.Globalization;
using System.Text;

namespace Micropolis.Server
{
    /// <summary>
    /// Text one player gives that the server shows other players, such as a name.
    /// </summary>
    internal static class ShownText
    {
        /// <summary>
        /// Whether the text holds a character that draws nothing or breaks the line it is shown on. Format characters
        /// draw nothing and can reorder the text after them, such as a right-to-left override in the list of who is
        /// online, and line and paragraph separators break that list's line.
        /// </summary>
        public static bool HasInvisibleOrControl(string text)
        {
            // A lone surrogate never gets this far: the JSON reader refuses the message
            return text.EnumerateRunes().Any(rune => Rune.GetUnicodeCategory(rune) is UnicodeCategory.Control
                or UnicodeCategory.Format or UnicodeCategory.LineSeparator or UnicodeCategory.ParagraphSeparator);
        }
    }
}
