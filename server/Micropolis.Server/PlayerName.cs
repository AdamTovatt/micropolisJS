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

using System.Diagnostics.CodeAnalysis;

namespace Micropolis.Server
{
    /// <summary>
    /// The display-name rule protocol/README.md states: 1 to 32 UTF-16 code units once surrounding whitespace is
    /// trimmed, with no control, format, line separator or paragraph separator characters. Every player sees every
    /// other player's name, so the server enforces it.
    /// </summary>
    internal static class PlayerName
    {
        public const int MaximumLength = 32;

        /// <summary>
        /// Gives the trimmed name, or the reason the name breaks the rule.
        /// </summary>
        public static bool TryNormalize(string? name, [NotNullWhen(true)] out string? normalized, [NotNullWhen(false)] out string? error)
        {
            string trimmed = (name ?? "").Trim();
            normalized = null;

            if (trimmed.Length == 0 || trimmed.Length > MaximumLength)
            {
                error = $"A name is 1 to {MaximumLength} characters long.";
                return false;
            }

            if (ShownText.HasInvisibleOrControl(trimmed))
            {
                error = "A name cannot contain control or invisible formatting characters.";
                return false;
            }

            normalized = trimmed;
            error = null;
            return true;
        }
    }
}
