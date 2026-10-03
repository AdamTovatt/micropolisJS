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

using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The protocol against the examples and reader cases shared with <c>test/protocol.ts</c>, as
    /// <c>protocol/README.md</c> describes them.
    /// </summary>
    [TestClass]
    public sealed class ProtocolTests
    {
        private static readonly JsonObject ReaderCases = JsonNode.Parse(File.ReadAllText(RepositoryFiles.GetPath("protocol/reader-cases.json")))!.AsObject();

        public static IEnumerable<object[]> Examples => ExamplePaths().Select(path => new object[] { Path.GetFileName(path) });

        public static IEnumerable<object[]> RejectedCases => ReaderCases["rejected"]!.AsArray()
            .Select(item => new object[] { (string)item!["case"]!, (string)item["text"]! });

        public static IEnumerable<object[]> AcceptedCases => ReaderCases["accepted"]!.AsArray()
            .Select(item => new object[] { (string)item!["case"]!, (string)item["text"]!, (string)item["canonical"]! });

        [TestMethod]
        [DynamicData(nameof(Examples))]
        public void RoundTrip_SharedExample_WritesIdenticalBytes(string fileName)
        {
            byte[] fileBytes = File.ReadAllBytes(Path.Combine(ExamplesDirectory(), fileName));
            string wire = ReadWireText(fileBytes);

            string written = ProtocolJson.Serialize(ProtocolJson.DeserializeServerMessage(wire));

            // Both comparisons are needed: the text one shows a readable difference, and the byte one also covers
            // the final newline and the encoding
            Assert.AreEqual(wire, written);
            CollectionAssert.AreEqual(fileBytes, Encoding.UTF8.GetBytes(written + "\n"));
        }

        [TestMethod]
        public void Examples_EveryServerMessageType_HasOne()
        {
            HashSet<string> declaredTypes = typeof(ServerMessage).GetCustomAttributes<JsonDerivedTypeAttribute>()
                .Select(attribute => (string)attribute.TypeDiscriminator!)
                .ToHashSet();
            HashSet<string> exampleTypes = ExamplePaths()
                .Select(path => JsonDocument.Parse(ReadWireText(File.ReadAllBytes(path))).RootElement.GetProperty("type").GetString()!)
                .ToHashSet();

            Assert.IsNotEmpty(declaredTypes);
            Assert.IsTrue(declaredTypes.SetEquals(exampleTypes),
                $"Message types [{string.Join(", ", declaredTypes.Order())}], example types [{string.Join(", ", exampleTypes.Order())}].");
        }

        [TestMethod]
        [DynamicData(nameof(RejectedCases))]
        public void DeserializeServerMessage_SharedRejectedCase_Throws(string description, string text)
        {
            Assert.ThrowsExactly<JsonException>(() => ProtocolJson.DeserializeServerMessage(text), description);
        }

        [TestMethod]
        [DynamicData(nameof(AcceptedCases))]
        public void DeserializeServerMessage_SharedAcceptedCase_WritesItCanonically(string description, string text, string canonical)
        {
            Assert.AreEqual(canonical, ProtocolJson.Serialize(ProtocolJson.DeserializeServerMessage(text)), description);
        }

        private static string ExamplesDirectory()
        {
            return RepositoryFiles.GetPath("protocol/examples");
        }

        private static IEnumerable<string> ExamplePaths()
        {
            return Directory.GetFiles(ExamplesDirectory(), "*.json").Order(StringComparer.Ordinal);
        }

        // An example is one message's exact wire text and a final newline, as protocol/README.md specifies
        private static string ReadWireText(byte[] fileBytes)
        {
            string text = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true).GetString(fileBytes);

            if (!text.EndsWith('\n') || text.IndexOfAny(['\n', '\r']) != text.Length - 1 || text.StartsWith('\uFEFF'))
            {
                throw new InvalidDataException("An example must be one line of UTF-8 without a byte order mark, ending in a newline.");
            }

            return text[..^1];
        }
    }
}
