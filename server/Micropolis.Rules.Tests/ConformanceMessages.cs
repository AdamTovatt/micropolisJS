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
    /// <c>conformance/messages.json</c>: every name <c>src/messages.ts</c> exports, with its string or list of strings.
    /// </summary>
    public sealed record ConformanceMessages(IReadOnlyDictionary<string, JsonElement> Messages)
    {
        public static ConformanceMessages Load()
        {
            return Parse(ConformanceFile.Read("messages.json"));
        }

        public static ConformanceMessages Parse(string json)
        {
            ConformanceMessages messages = ConformanceFile.Parse<ConformanceMessages>(json);
            ConformanceFile.NonEmpty("messages", messages.Messages.Keys.ToList());
            return messages;
        }
    }
}
