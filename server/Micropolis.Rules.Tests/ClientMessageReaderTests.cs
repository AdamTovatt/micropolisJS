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
using System.Text.Json.Nodes;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The reader of what a player sends, which is untrusted: every message the protocol has is read, at the limits of
    /// its fields, and anything else is refused, saying why.
    /// </summary>
    [TestClass]
    public sealed class ClientMessageReaderTests
    {
        [TestMethod]
        // The JSON reader's own words, which name what is invalid
        [DataRow("not JSON", "invalid", DisplayName = "text that isn't JSON")]
        [DataRow("[]", "an object whose type is one a player sends", DisplayName = "a list")]
        [DataRow("{\"id\":1}", "an object whose type is one a player sends", DisplayName = "no type")]
        [DataRow("{\"type\":7,\"id\":1}", "an object whose type is one a player sends", DisplayName = "a type that isn't a string")]
        [DataRow("{\"type\":\"hello\",\"you\":\"a\",\"players\":[]}", "an object whose type is one a player sends", DisplayName = "a message the server sends")]
        [DataRow("{\"type\":\"save\"}", "the save message has exactly the fields type, id", DisplayName = "a request without its id")]
        [DataRow("{\"type\":\"save\",\"id\":1,\"extra\":true}", "the save message has exactly the fields type, id", DisplayName = "a field the message doesn't have")]
        [DataRow("{\"type\":\"save\",\"id\":-1}", "A request's id is a whole number from 0.", DisplayName = "a negative id")]
        [DataRow("{\"type\":\"save\",\"id\":0.5}", "A request's id is a whole number from 0.", DisplayName = "an id that isn't whole")]
        [DataRow("{\"type\":\"save\",\"id\":\"1\"}", "A request's id is a whole number from 0.", DisplayName = "an id that is a string")]
        [DataRow("{\"type\":\"save\",\"id\":9007199254740992}", "A request's id is a whole number from 0.", DisplayName = "an id a browser can't count to")]
        [DataRow("{\"type\":\"start\",\"id\":1,\"name\":7,\"seed\":1,\"level\":0}", "The name is a string.", DisplayName = "a name that isn't a string")]
        [DataRow("{\"type\":\"start\",\"id\":1,\"name\":\"Town\",\"seed\":-1,\"level\":0}", "The seed is a uint32.", DisplayName = "a negative seed")]
        [DataRow("{\"type\":\"start\",\"id\":1,\"name\":\"Town\",\"seed\":4294967296,\"level\":0}", "The seed is a uint32.", DisplayName = "a seed past a uint32")]
        [DataRow("{\"type\":\"start\",\"id\":1,\"name\":\"Town\",\"seed\":1.5,\"level\":0}", "The seed is a uint32.", DisplayName = "a seed that isn't whole")]
        [DataRow("{\"type\":\"start\",\"id\":1,\"name\":\"Town\",\"seed\":1,\"level\":3}", "The level is a whole number from 0 to 2.", DisplayName = "a level past the hardest")]
        [DataRow("{\"type\":\"join\",\"id\":1,\"city\":null}", "The city is a string.", DisplayName = "a city that isn't a string")]
        [DataRow("{\"type\":\"upload\",\"id\":1,\"save\":{}}", "The save is a string.", DisplayName = "a save that isn't text")]
        [DataRow("{\"type\":\"advance\",\"id\":1,\"steps\":\"96\"}", "The steps is a number.", DisplayName = "steps that aren't a number")]
        [DataRow("{\"type\":\"advance\",\"id\":1,\"steps\":1e400}", "The steps is a number.", DisplayName = "steps past any double")]
        [DataRow("{\"type\":\"turn\",\"id\":1}", "the turn message has exactly the fields type, id, milliseconds", DisplayName = "a turn without its time")]
        [DataRow("{\"type\":\"command\"}", "the command message has exactly the fields type, command", DisplayName = "a command message without its command")]
        [DataRow("{\"type\":\"cursor\"}", "the cursor message has exactly the fields type, cursor", DisplayName = "a cursor message without its box")]
        [DataRow("{\"type\":\"cursor\",\"cursor\":[]}", "A hover box is null or has exactly the fields tool, x, y, size.", DisplayName = "a hover box that is a list")]
        [DataRow("{\"type\":\"cursor\",\"cursor\":{\"tool\":\"road\",\"x\":1,\"y\":1}}", "A hover box is null or has exactly the fields tool, x, y, size.", DisplayName = "a hover box without its size")]
        [DataRow("{\"type\":\"cursor\",\"cursor\":{\"tool\":\"road\",\"x\":1,\"y\":1,\"size\":1,\"colour\":\"red\"}}", "A hover box is null or has exactly the fields tool, x, y, size.", DisplayName = "a hover box with a field it doesn't have")]
        [DataRow("{\"type\":\"cursor\",\"cursor\":{\"tool\":\"crane\",\"x\":1,\"y\":1,\"size\":1}}", "A hover box's tool is one of airport", DisplayName = "a hover box whose tool no tool names")]
        [DataRow("{\"type\":\"cursor\",\"cursor\":{\"tool\":\"road, rail\",\"x\":1,\"y\":1,\"size\":1}}", "A hover box's tool is one of airport", DisplayName = "a hover box whose tool is two tool names")]
        [DataRow("{\"type\":\"cursor\",\"cursor\":{\"tool\":\"road\",\"x\":1.5,\"y\":1,\"size\":1}}", "A hover box's x is a whole number.", DisplayName = "a hover box on a tile that isn't whole")]
        [DataRow("{\"type\":\"cursor\",\"cursor\":{\"tool\":\"road\",\"x\":1,\"y\":\"1\",\"size\":1}}", "A hover box's y is a whole number.", DisplayName = "a hover box whose row is a string")]
        [DataRow("{\"type\":\"cursor\",\"cursor\":{\"tool\":\"road\",\"x\":1,\"y\":1,\"size\":2147483648}}", "A hover box's size is a whole number.", DisplayName = "a hover box past an int")]
        public void Read_NoMessageAPlayerSends_IsRefusedSayingWhy(string text, string reason)
        {
            // The JSON reader's own exceptions are JsonExceptions of a type of its own
            JsonException refused = Assert.Throws<JsonException>(() => ClientMessageReader.Read(text));

            StringAssert.Contains(refused.Message, reason);
        }

        [TestMethod]
        public void Read_StartAtTheLimits_IsTheRequest()
        {
            ClientMessage read = ClientMessageReader.Read(
                "{\"type\":\"start\",\"id\":9007199254740991,\"name\":\"Town\",\"seed\":4294967295,\"level\":2}");

            Assert.AreEqual(new StartRequest(9007199254740991, "Town", uint.MaxValue, 2), read);
        }

        [TestMethod]
        public void Read_StartFromTheLowestSeed_IsTheRequest()
        {
            Assert.AreEqual(new StartRequest(0, "Town", 0, 0), ClientMessageReader.Read("{\"type\":\"start\",\"id\":0,\"name\":\"Town\",\"seed\":0,\"level\":0}"));
        }

        // The simulation validates a command or a query, as it does one in a log, so the reader takes any JSON for it
        [TestMethod]
        [DataRow("null", DisplayName = "null")]
        [DataRow("\"road\"", DisplayName = "a string")]
        [DataRow("{\"type\":\"tool\",\"\\ud800\":1}", DisplayName = "a key with a lone surrogate")]
        public void Read_CommandOfAnyJson_CarriesItAsItArrived(string command)
        {
            CommandMessage read = (CommandMessage)ClientMessageReader.Read($"{{\"type\":\"command\",\"command\":{command}}}");

            Assert.AreEqual(CanonicalJson.Write(JsonText.Parse(command)), CanonicalJson.Write(read.Command));
        }

        // Whether the box fits the city's map, and has a size a tool has, is the city's to say
        [TestMethod]
        public void Read_HoverBoxOffAnyMap_IsTheReport()
        {
            Assert.AreEqual(new CursorReport(new Cursor(CursorTool.Airport, -1, 100000, 0)),
                ClientMessageReader.Read("{\"type\":\"cursor\",\"cursor\":{\"tool\":\"airport\",\"x\":-1,\"y\":100000,\"size\":0}}"));
        }

        [TestMethod]
        public void Read_NullHoverBox_IsTheReportThatItWent()
        {
            Assert.AreEqual(new CursorReport(null), ClientMessageReader.Read("{\"type\":\"cursor\",\"cursor\":null}"));
        }

        [TestMethod]
        public void Read_KeyWrittenTwice_TakesTheLastAsJsonParseDoes()
        {
            Assert.AreEqual(new SaveRequest(2), ClientMessageReader.Read("{\"type\":\"save\",\"id\":1,\"id\":2}"));
        }
    }
}
