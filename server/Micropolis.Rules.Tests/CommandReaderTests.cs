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

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// What <c>conformance/commands.json</c> can't hold, since each command there is a JSON value:
    /// commands only text can carry. The file holds every other case.
    /// </summary>
    [TestClass]
    public sealed class CommandReaderTests
    {
        private const int Width = 8;
        private const int Height = 8;

        // A number too large for a double parses as infinite, which JSON.stringify writes as null: five characters of
        // text that count as four
        [TestMethod]
        [DataRow(0, "not a command")]
        [DataRow(1, "a command is at most 3072 characters of JSON")]
        public void Read_NumberTooLargeForADouble_CountsAsNull(int over, string reason)
        {
            const string frame = "{\"type\":\"x\",\"n\":null,\"s\":\"\"}";
            string padding = new string('x', CommandReader.MaxCommandLength(Width, Height) - frame.Length + over);
            string text = $"{{\"type\":\"x\",\"n\":1e400,\"s\":\"{padding}\"}}";

            CommandReading reading = CommandReader.Read(JsonText.Parse(text), Width, Height);

            Assert.AreEqual(new RejectedCommand(reason), reading);
        }
    }
}
