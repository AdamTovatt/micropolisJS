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
    /// The city-name rule protocol/README.md states: 1 to 15 UTF-16 code units, as the start form's field allows, with
    /// no control, format, line separator or paragraph separator characters. The server keeps a city's name and sends
    /// it to every player who joins, so it enforces the rule on a city that starts and on a saved game uploaded alike.
    /// </summary>
    internal static class CityName
    {
        public const int MaximumLength = 15;

        /// <summary>
        /// Why the name breaks the rule, or null when it keeps it.
        /// </summary>
        public static string? Rejection(string name)
        {
            if (name.Length == 0 || name.Length > MaximumLength)
            {
                return $"A city's name is 1 to {MaximumLength} characters long.";
            }

            if (ShownText.HasInvisibleOrControl(name))
            {
                return "A city's name cannot contain control or invisible formatting characters.";
            }

            return null;
        }
    }
}
