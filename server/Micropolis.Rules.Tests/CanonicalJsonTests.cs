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

using System.Text.Json.Nodes;
using Micropolis.Conformance;

namespace Micropolis.Rules.Tests
{
    [TestClass]
    public sealed class CanonicalJsonTests
    {
        private static readonly CanonicalJsonVectors Vectors = CanonicalJsonVectors.Load();

        public static IEnumerable<object[]> NumberVectors => Vectors.Numbers.Select(vector => new object[] { vector });

        public static IEnumerable<object[]> StringVectors => Vectors.Strings.Select(vector => new object[] { vector });

        public static IEnumerable<object[]> DocumentVectors => Vectors.Documents.Select(vector => new object[] { vector });

        [TestMethod]
        [DynamicData(nameof(NumberVectors))]
        public void Write_ReferenceDouble_WritesItsCanonicalText(NumberVector vector)
        {
            Assert.AreEqual(vector.Text, CanonicalJson.Write(JsonValue.Create(vector.Value)));
        }

        [TestMethod]
        [DynamicData(nameof(StringVectors))]
        public void Write_ReferenceString_EscapesAsJsonStringify(StringVector vector)
        {
            Assert.AreEqual(vector.Text, CanonicalJson.Write(JsonValue.Create(vector.Value)));
        }

        // Each code unit escaped in the text, so a lone surrogate reaches the parser as JSON.parse would read it
        [TestMethod]
        [DynamicData(nameof(StringVectors))]
        public void Write_ParsedReferenceString_EscapesAsJsonStringify(StringVector vector)
        {
            string json = "\"" + string.Concat(vector.Value.Select(c => $"\\u{(int)c:x4}")) + "\"";

            Assert.AreEqual(vector.Text, CanonicalJson.Write(JsonNode.Parse(json)));
        }

        [TestMethod]
        [DynamicData(nameof(DocumentVectors))]
        public void Write_ParsedReferenceDocument_WritesItsCanonicalText(DocumentVector vector)
        {
            Assert.AreEqual(vector.Text, CanonicalJson.Write(JsonNode.Parse(vector.Json)));
        }

        // Each save under conformance/saves/, parsed, whose numbers the writer reads from the text: it writes the save
        // as the file holds it. SimulationSaveTests writes each from the model's numbers.
        [TestMethod]
        [DynamicData(nameof(ConformanceSaves.AllSaves), typeof(ConformanceSaves))]
        public void Write_ParsedConformanceSave_WritesItsText(FixtureSavePoint save)
        {
            string text = save.ReadCommitted();

            Assert.AreEqual(text, CanonicalJson.Write(JsonNode.Parse(text)));
        }

        [TestMethod]
        public void Write_NumbersTheModelWrites_WritesThemAsDoubles()
        {
            JsonArray numbers = [JsonValue.Create(-7), JsonValue.Create(4294967295u), JsonValue.Create(-9007199254740992L), JsonValue.Create(0.5299999713897705)];

            Assert.AreEqual("[-7,4294967295,-9007199254740992,0.5299999713897705]", CanonicalJson.Write(numbers));
        }

        // An integer the model holds that no double is exactly: the C# has gone where JavaScript's numbers can't
        [TestMethod]
        [DataRow(9007199254740993L)]
        [DataRow(-9007199254740993L)]
        [DataRow(long.MaxValue)]
        [DataRow(long.MinValue)]
        public void Write_ModelIntegerNoDoubleHolds_ThrowsNamingIt(long value)
        {
            JsonObject state = new JsonObject { ["a"] = value };

            InvalidOperationException exception = Assert.Throws<InvalidOperationException>(() => CanonicalJson.Write(state));

            Assert.AreEqual($"Cannot canonicalize the state.a: the integer {value} is beyond 2^53, so no double holds it exactly.", exception.Message);
        }

        // Integers either side of 2^53, where a double stops holding each exactly, parsed from text as JSON.parse reads
        // them
        [TestMethod]
        [DataRow("9007199254740992", "9007199254740992")]
        [DataRow("9007199254740993", "9007199254740992")]
        [DataRow("-9007199254740993", "-9007199254740992")]
        [DataRow("2147483648", "2147483648")]
        public void Write_ParsedIntegerAtTheEdgeOfDoubles_WritesItAsADouble(string json, string text)
        {
            Assert.AreEqual(text, CanonicalJson.Write(JsonNode.Parse(json)));
        }

        // Numbers written otherwise than as an integer's digits, whose value is one
        [TestMethod]
        [DataRow("-0", "0")]
        [DataRow("1e2", "100")]
        [DataRow("1.0", "1")]
        public void Write_ParsedIntegralNumber_WritesItsDigits(string json, string text)
        {
            Assert.AreEqual(text, CanonicalJson.Write(JsonNode.Parse(json)));
        }

        [TestMethod]
        [DataRow(9007199254740992L, "9007199254740992")]
        [DataRow(-9007199254740992L, "-9007199254740992")]
        [DataRow(-2147483648L, "-2147483648")]
        public void Write_ModelIntegerAtTheEdgeOfDoubles_WritesIt(long value, string text)
        {
            Assert.AreEqual(text, CanonicalJson.Write(JsonValue.Create(value)));
        }

        [TestMethod]
        [DataRow(double.NaN)]
        [DataRow(double.PositiveInfinity)]
        [DataRow(double.NegativeInfinity)]
        public void Write_NonFiniteNumber_ThrowsNamingWhereItIs(double value)
        {
            JsonObject state = new JsonObject { ["a"] = new JsonArray(1, value) };

            InvalidOperationException exception = Assert.Throws<InvalidOperationException>(() => CanonicalJson.Write(state));

            Assert.AreEqual($"Cannot canonicalize the state.a[1]: {value} is not a finite number.", exception.Message);
        }

        [TestMethod]
        public void Write_ParsedLoneSurrogateKey_SortsByCodeUnitAndEscapesIt()
        {
            Assert.AreEqual("{\"type\":\"x\",\"\\ud800\":1}", CanonicalJson.Write(JsonText.Parse("{\"\\ud800\":1,\"type\":\"x\"}")));
        }

        // As JSON.stringify writes a command as it arrived: keys in their order, and a number JSON can't hold as null
        [TestMethod]
        public void Stringify_ParsedValue_WritesAsJsonStringify()
        {
            JsonNode? value = JsonText.Parse("{\"b\":1e400,\"a\":[-1e400,\"\\ud800\",1E2,-0]}");

            Assert.AreEqual("{\"b\":null,\"a\":[null,\"\\ud800\",100,0]}", CanonicalJson.Stringify(value));
        }

        [TestMethod]
        public void Write_NumberOfAnUnsupportedType_Throws()
        {
            JsonObject state = new JsonObject { ["a"] = JsonValue.Create(1.5m) };

            InvalidOperationException exception = Assert.Throws<InvalidOperationException>(() => CanonicalJson.Write(state));

            Assert.AreEqual("Cannot canonicalize the state.a: a number of this type has no canonical form.", exception.Message);
        }

        // The state itself, with no key or index on the way to it
        [TestMethod]
        public void Write_RootWithoutCanonicalForm_ThrowsNamingTheState()
        {
            InvalidOperationException exception = Assert.Throws<InvalidOperationException>(() => CanonicalJson.Write(JsonValue.Create(1.5m)));

            Assert.AreEqual("Cannot canonicalize the state: a number of this type has no canonical form.", exception.Message);
        }
    }
}
