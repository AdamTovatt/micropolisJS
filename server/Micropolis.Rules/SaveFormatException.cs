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

namespace Micropolis.Rules
{
    /// <summary>
    /// A save that <c>docs/state-hash.md</c> does not allow: a key missing or unknown, or a value of the wrong type or
    /// outside its documented range.
    /// </summary>
    public sealed class SaveFormatException : Exception
    {
        public SaveFormatException(string path, string problem)
            : base($"The save's {path} {problem}.")
        {
            Path = path;
        }

        /// <summary>
        /// Where in the save the problem is, such as <c>sprites.list[2].type</c>, or <c>state</c> for the save itself.
        /// </summary>
        public string Path { get; }
    }
}
