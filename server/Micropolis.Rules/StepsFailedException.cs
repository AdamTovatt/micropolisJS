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
    /// Steps a city was asked to take that it refused, or fell short in: a count that isn't whole, a city that doesn't
    /// step, or city time that didn't keep up with the steps. Anything else that goes wrong while a city steps is the
    /// rules failing.
    /// </summary>
    public sealed class StepsFailedException : Exception
    {
        public StepsFailedException(string message)
            : base(message)
        {
        }
    }
}
