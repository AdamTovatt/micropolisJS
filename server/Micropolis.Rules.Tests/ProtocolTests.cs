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

        // Each session body by its example's file name, read and written back by the protocol's own code
        private static readonly Dictionary<string, Func<string, string>> SessionBodies = new Dictionary<string, Func<string, string>>
        {
            ["sign-in-request"] = json => ProtocolJson.Serialize(ProtocolJson.DeserializeSessionBody<SignInRequest>(json)),
            ["session-response"] = json => ProtocolJson.Serialize(ProtocolJson.DeserializeSessionBody<SessionResponse>(json)),
            ["player-response"] = json => ProtocolJson.Serialize(ProtocolJson.DeserializeSessionBody<PlayerResponse>(json)),
            ["error-response"] = json => ProtocolJson.Serialize(ProtocolJson.DeserializeSessionBody<ErrorResponse>(json)),
        };

        public static IEnumerable<object[]> Examples => ExamplePaths(SocketExamples).Select(path => new object[] { Path.GetFileName(path) });

        public static IEnumerable<object[]> SessionExamples => ExamplePaths(SessionBodyExamples).Select(path => new object[] { Path.GetFileName(path) });

        public static IEnumerable<object[]> CommandExamples => ExamplePaths(CommandExampleKind).Select(path => new object[] { Path.GetFileName(path) });

        public static IEnumerable<object[]> RejectedSessionBodies => ReaderCases["rejectedSessionBodies"]!.AsArray()
            .Select(item => new object[] { (string)item!["case"]!, (string)item["body"]!, (string)item["text"]! });

        public static IEnumerable<object[]> RejectedCases => ReaderCases["rejected"]!.AsArray()
            .Select(item => new object[] { (string)item!["case"]!, (string)item["text"]! });

        public static IEnumerable<object[]> AcceptedCases => ReaderCases["accepted"]!.AsArray()
            .Select(item => new object[] { (string)item!["case"]!, (string)item["text"]!, (string)item["canonical"]! });

        [TestMethod]
        [DynamicData(nameof(Examples))]
        public void RoundTrip_SharedExample_WritesIdenticalBytes(string fileName)
        {
            AssertRoundTrip(Path.Combine(ExamplesDirectory(SocketExamples), fileName),
                wire => ProtocolJson.Serialize(ProtocolJson.DeserializeServerMessage(wire)));
        }

        [TestMethod]
        [DynamicData(nameof(SessionExamples))]
        public void RoundTrip_SharedSessionBodyExample_WritesIdenticalBytes(string fileName)
        {
            AssertRoundTrip(Path.Combine(ExamplesDirectory(SessionBodyExamples), fileName), SessionBodies[Path.GetFileNameWithoutExtension(fileName)]);
        }

        [TestMethod]
        public void SessionExamples_EverySessionBody_HasOneAndNoOther()
        {
            int declaredBodies = typeof(SessionBody).Assembly.GetTypes().Count(type => type.IsSubclassOf(typeof(SessionBody)));
            HashSet<string> exampleBodies = ExamplePaths(SessionBodyExamples).Select(path => Path.GetFileNameWithoutExtension(path)).ToHashSet();

            // A body added to the protocol and not to the table above fails here, and one without an example below
            Assert.HasCount(declaredBodies, SessionBodies);
            Assert.IsTrue(exampleBodies.SetEquals(SessionBodies.Keys),
                $"Session bodies [{string.Join(", ", SessionBodies.Keys.Order())}], examples [{string.Join(", ", exampleBodies.Order())}].");
        }

        [TestMethod]
        [DynamicData(nameof(RejectedSessionBodies))]
        public void DeserializeSessionBody_SharedRejectedCase_Throws(string description, string body, string text)
        {
            Assert.ThrowsExactly<JsonException>(() => SessionBodies[body](text), description);
        }

        [TestMethod]
        public void Examples_EveryServerMessageType_HasOne()
        {
            HashSet<string> declaredTypes = typeof(ServerMessage).GetCustomAttributes<JsonDerivedTypeAttribute>()
                .Select(attribute => (string)attribute.TypeDiscriminator!)
                .ToHashSet();
            HashSet<string> exampleTypes = ExamplePaths(SocketExamples)
                .Select(path => JsonDocument.Parse(ReadWireText(File.ReadAllBytes(path))).RootElement.GetProperty("type").GetString()!)
                .ToHashSet();

            Assert.IsNotEmpty(declaredTypes);
            Assert.IsTrue(declaredTypes.SetEquals(exampleTypes),
                $"Message types [{string.Join(", ", declaredTypes.Order())}], example types [{string.Join(", ", exampleTypes.Order())}].");
        }

        // The simulation takes a command as it arrived once it has read it, so writing the command read back pins the
        // example's field order to the protocol's
        [TestMethod]
        [DynamicData(nameof(CommandExamples))]
        public void RoundTrip_SharedCommandExample_IsAcceptedAndWritesIdenticalBytes(string fileName)
        {
            AssertRoundTrip(Path.Combine(ExamplesDirectory(CommandExampleKind), fileName), wire =>
                CommandReader.Read(JsonText.Parse(wire), GameMapWidth, GameMapHeight) switch
                {
                    AcceptedCommand accepted => ProtocolJson.Serialize(accepted.Command),
                    RejectedCommand rejected => throw new AssertFailedException($"The example is rejected: {rejected.Reason}."),
                    _ => throw new AssertFailedException("A command is read as accepted or rejected."),
                });
        }

        [TestMethod]
        public void CommandExamples_EveryCommandType_HasOne()
        {
            HashSet<string> declaredTypes = typeof(Command).GetCustomAttributes<JsonDerivedTypeAttribute>()
                .Select(attribute => (string)attribute.TypeDiscriminator!)
                .ToHashSet();
            HashSet<string> exampleTypes = ExamplePaths(CommandExampleKind)
                .Select(path => JsonDocument.Parse(ReadWireText(File.ReadAllBytes(path))).RootElement.GetProperty("type").GetString()!)
                .ToHashSet();

            Assert.IsNotEmpty(declaredTypes);
            Assert.IsTrue(declaredTypes.SetEquals(exampleTypes),
                $"Command types [{string.Join(", ", declaredTypes.Order())}], example types [{string.Join(", ", exampleTypes.Order())}].");
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

        private const string SocketExamples = "socket";
        private const string SessionBodyExamples = "session";
        private const string CommandExampleKind = "commands";

        // The game's map, which every command example's tiles lie on
        private const int GameMapWidth = 120;
        private const int GameMapHeight = 100;

        private static string ExamplesDirectory(string kind)
        {
            return RepositoryFiles.GetPath($"protocol/examples/{kind}");
        }

        private static IEnumerable<string> ExamplePaths(string kind)
        {
            return Directory.GetFiles(ExamplesDirectory(kind), "*.json").Order(StringComparer.Ordinal);
        }

        private static void AssertRoundTrip(string path, Func<string, string> readAndWrite)
        {
            byte[] fileBytes = File.ReadAllBytes(path);
            string wire = ReadWireText(fileBytes);

            string written = readAndWrite(wire);

            // Both comparisons are needed: the text one shows a readable difference, and the byte one also covers
            // the final newline and the encoding
            Assert.AreEqual(wire, written);
            CollectionAssert.AreEqual(fileBytes, Encoding.UTF8.GetBytes(written + "\n"));
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
