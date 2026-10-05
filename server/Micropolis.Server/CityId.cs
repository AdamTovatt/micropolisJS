/* micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
 * Copyright (C) 2026 Adam Tovatt
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

namespace Micropolis.Server
{
    /// <summary>
    /// A city's id on the server, which any player joins it by and the store keeps it under: 128 random bits as
    /// lower-case hex, which no one can guess.
    /// </summary>
    internal static class CityId
    {
        public const int Length = 32;

        public static string New()
        {
            return Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(Length / 2));
        }

        /// <summary>
        /// Whether the text is an id as <see cref="New"/> writes one, which is safe to quote.
        /// </summary>
        public static bool IsOne(string text)
        {
            return text.Length == Length && text.All(char.IsAsciiHexDigitLower);
        }
    }
}
