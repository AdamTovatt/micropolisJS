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

using System.Text.Json.Nodes;

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

        [TestMethod]
        [DynamicData(nameof(DocumentVectors))]
        public void Write_ParsedReferenceDocument_WritesItsCanonicalText(DocumentVector vector)
        {
            Assert.AreEqual(vector.Text, CanonicalJson.Write(JsonNode.Parse(vector.Json)));
        }

        [TestMethod]
        public void Write_NumbersTheModelWrites_WritesThemAsDoubles()
        {
            JsonArray numbers = [JsonValue.Create(-7), JsonValue.Create(4294967295u), JsonValue.Create(-9007199254740993L), JsonValue.Create(0.5299999713897705)];

            Assert.AreEqual("[-7,4294967295,-9007199254740992,0.5299999713897705]", CanonicalJson.Write(numbers));
        }

        [TestMethod]
        [DataRow(double.NaN)]
        [DataRow(double.PositiveInfinity)]
        [DataRow(double.NegativeInfinity)]
        public void Write_NonFiniteNumber_ThrowsNamingWhereItIs(double value)
        {
            JsonObject state = new JsonObject { ["a"] = new JsonArray(1, value) };

            InvalidOperationException exception = Assert.Throws<InvalidOperationException>(() => CanonicalJson.Write(state));

            StringAssert.Contains(exception.Message, "Cannot canonicalize the state.a[1]");
        }

        [TestMethod]
        public void Write_NumberOfAnUnsupportedType_Throws()
        {
            JsonObject state = new JsonObject { ["a"] = JsonValue.Create(1.5m) };

            InvalidOperationException exception = Assert.Throws<InvalidOperationException>(() => CanonicalJson.Write(state));

            StringAssert.Contains(exception.Message, "Cannot canonicalize the state.a");
        }
    }
}
