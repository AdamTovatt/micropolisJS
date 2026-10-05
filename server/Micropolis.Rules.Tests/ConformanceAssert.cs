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

using System.Text.Json;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// What the readers of the conformance files do with a file that lost data: fail, saying what is wrong.
    /// </summary>
    internal static class ConformanceAssert
    {
        public static void Broken(Action parse, string description, string message)
        {
            Exception exception = Assert.Throws<Exception>(parse, description);

            Assert.IsTrue(exception is InvalidDataException or JsonException, $"Unexpected {exception.GetType().Name}.");
            StringAssert.Contains(exception.Message, message);
        }
    }
}
