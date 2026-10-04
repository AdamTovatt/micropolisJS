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

using System.Text.Json;
using System.Text.Json.Nodes;

namespace Micropolis.Rules.Tests
{
    [TestClass]
    public sealed class JsonTextTests
    {
        [TestMethod]
        public void Parse_KeyThatIsALoneSurrogate_KeepsItsCodeUnit()
        {
            JsonObject value = JsonText.Parse("{\"\\ud800\":1,\"type\":\"x\"}")!.AsObject();

            CollectionAssert.AreEqual(new[] { "\ud800", "type" }, value.Select(member => member.Key).ToArray());
        }

        [TestMethod]
        public void Parse_NestedAsDeepAsItReads_KeepsTheShape()
        {
            string text = new string('[', JsonText.MaxDepth) + new string(']', JsonText.MaxDepth);

            Assert.AreEqual(text, JsonText.Parse(text)!.ToJsonString());
        }

        [TestMethod]
        public void Parse_NestedDeeperThanItReads_Throws()
        {
            string text = new string('[', JsonText.MaxDepth + 1) + new string(']', JsonText.MaxDepth + 1);

            Assert.Throws<JsonException>(() => JsonText.Parse(text));
        }

        [TestMethod]
        public void Parse_StringWithEscapes_DecodesEachCodeUnit()
        {
            Assert.AreEqual("a\"\\/\b\f\n\r\t\u0001\udfff\ud83d\ude00é", JsonString.Get(JsonText.Parse("\"a\\\"\\\\\\/\\b\\f\\n\\r\\t\\u0001\\udfff\\ud83d\\ude00é\"")!.AsValue()));
        }

        // As JSON.parse, which keeps the last value of a key written twice, in the place of its first
        [TestMethod]
        public void Parse_KeyWrittenTwice_KeepsItsLastValueInItsFirstPlace()
        {
            Assert.AreEqual("{\"a\":3,\"b\":2}", JsonText.Parse("{\"a\":1,\"b\":2,\"a\":3}")!.ToJsonString());
        }

        [TestMethod]
        [DataRow("1e400", double.PositiveInfinity)]
        [DataRow("-1e400", double.NegativeInfinity)]
        [DataRow("2.0", 2.0)]
        [DataRow("1E2", 100.0)]
        [DataRow("-0", -0.0)]
        public void Parse_Number_IsTheDoubleJavaScriptReads(string text, double expected)
        {
            double number = JsonText.Parse(text)!.GetValue<double>();

            Assert.AreEqual(expected, number);
            Assert.AreEqual(double.IsNegative(expected), double.IsNegative(number));
        }

        // As JSON.parse, whose object puts the keys that are array indices first, ascending: "01", "-1" and 2^32 − 1
        // are not array indices, and "4294967294", 2^32 − 2, is the last
        [TestMethod]
        public void Parse_KeysThatAreArrayIndices_ComeFirstAscending()
        {
            JsonNode parsed = JsonText.Parse(
                "{\"b\":0,\"10\":1,\"01\":2,\"2\":3,\"-1\":4,\"4294967295\":5,\"4294967294\":6,\"a\":{\"1\":7,\"0\":8}}")!;

            Assert.AreEqual("{\"2\":3,\"10\":1,\"4294967294\":6,\"b\":0,\"01\":2,\"-1\":4,\"4294967295\":5,\"a\":{\"0\":8,\"1\":7}}",
                CanonicalJson.Stringify(parsed));
        }

        [TestMethod]
        public void Parse_NestedValues_KeepTheirShapeAndOrder()
        {
            const string text = "{\"b\":[1,{\"c\":null,\"d\":[true,false]},\"s\"],\"a\":{}}";

            Assert.AreEqual(text, JsonText.Parse(text)!.ToJsonString());
        }

        [TestMethod]
        public void Parse_Null_IsNoNode()
        {
            Assert.IsNull(JsonText.Parse(" null "));
        }

        [TestMethod]
        [DataRow("")]
        [DataRow("{")]
        [DataRow("{\"a\":1}x")]
        [DataRow("[1,]")]
        public void Parse_NotJson_Throws(string text)
        {
            Assert.Throws<JsonException>(() => JsonText.Parse(text));
        }
    }
}
