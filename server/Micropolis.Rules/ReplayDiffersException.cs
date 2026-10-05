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
    /// A log whose replay doesn't reach the state hash it records at a checkpoint: a well-formed log that the rules no
    /// longer play out as it was written, unlike a file that isn't a log at all, which is an
    /// <see cref="InvalidDataException"/>.
    /// </summary>
    public sealed class ReplayDiffersException : Exception
    {
        public ReplayDiffersException(string message)
            : base(message)
        {
        }
    }
}
