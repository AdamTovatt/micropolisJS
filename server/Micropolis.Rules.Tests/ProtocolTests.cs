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

using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Micropolis.SourceTree;

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

        public static IEnumerable<object[]> ClientExamples => ExamplePaths(ClientExampleKind).Select(path => new object[] { Path.GetFileName(path) });

        public static IEnumerable<object[]> QueryExamples => ExamplePaths(QueryExampleKind).Select(path => new object[] { Path.GetFileName(path) });

        public static IEnumerable<object[]> RecordExamples => ExamplePaths(RecordExampleKind).Select(path => new object[] { Path.GetFileName(path) });

        public static IEnumerable<object[]> StateExamples => ExamplePaths(StateExampleKind).Select(path => new object[] { Path.GetFileName(path) });

        public static IEnumerable<object[]> AnswerExamples => ExamplePaths(AnswerExampleKind).Select(path => new object[] { Path.GetFileName(path) });

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

        // CURSOR_TOOLS in src/protocol.ts is built from TOOL_NAMES the same way
        [TestMethod]
        public void CursorToolNames_AreTheToolNamesThenQuery()
        {
            CollectionAssert.AreEqual(ProtocolJson.Names<ToolName>().Append("query").ToList(), ProtocolJson.Names<CursorTool>().ToList());
        }

        [TestMethod]
        [DynamicData(nameof(ClientExamples))]
        public void RoundTrip_SharedClientMessageExample_WritesIdenticalBytes(string fileName)
        {
            AssertRoundTrip(Path.Combine(ExamplesDirectory(ClientExampleKind), fileName), wire => ProtocolJson.Serialize(ClientMessageReader.Read(wire)));
        }

        [TestMethod]
        public void ClientExamples_EveryClientMessageType_HasOne()
        {
            HashSet<string> declaredTypes = typeof(ClientMessage).GetCustomAttributes<JsonDerivedTypeAttribute>()
                .Select(attribute => (string)attribute.TypeDiscriminator!)
                .ToHashSet();

            Assert.IsNotEmpty(declaredTypes);
            Assert.IsTrue(declaredTypes.SetEquals(ExampleTypes(ClientExampleKind)),
                $"Message types [{string.Join(", ", declaredTypes.Order())}].");
        }

        // The simulation reads a query as it arrived by validating it and writes none, so all an example can pin beyond
        // being accepted is that it is canonical JSON, as the browser writes it
        [TestMethod]
        [DynamicData(nameof(QueryExamples))]
        public void Read_SharedQueryExample_IsAcceptedAndCanonical(string fileName)
        {
            AssertRoundTrip(Path.Combine(ExamplesDirectory(QueryExampleKind), fileName), wire =>
            {
                JsonNode? query = JsonText.Parse(wire);
                Assert.IsNull(Queries.Rejection(query, GameMapWidth, GameMapHeight));
                return CanonicalJson.Stringify(query);
            });
        }

        [TestMethod]
        public void QueryExamples_EveryQueryType_HasOne()
        {
            HashSet<string> exampleTypes = ExampleTypes(QueryExampleKind);

            Assert.IsTrue(exampleTypes.SetEquals(["overlay", "tileReport", "budgetForecast", "mapPreview"]),
                $"Example types [{string.Join(", ", exampleTypes.Order())}].");
        }

        // A record is written field by field from the city, so one read from the example's fields and written back
        // pins the C# type's fields and their order to the protocol's
        [TestMethod]
        [DynamicData(nameof(RecordExamples))]
        public void RoundTrip_SharedRecordExample_WritesIdenticalBytes(string fileName)
        {
            AssertRoundTrip(Path.Combine(ExamplesDirectory(RecordExampleKind), fileName), wire =>
                ProtocolJson.Serialize(ReadExample<StateMessage>(wire, RecordTypes, message => message.Type)));
        }

        // That every state message type the rules declare is a record or another state message is the next test's
        [TestMethod]
        public void RecordExamples_EveryRecordType_HasOneAndNoOther()
        {
            HashSet<string> exampleTypes = ExampleTypes(RecordExampleKind);

            Assert.IsTrue(exampleTypes.SetEquals(RecordTypes.Keys), $"Example types [{string.Join(", ", exampleTypes.Order())}].");
        }

        [TestMethod]
        [DynamicData(nameof(StateExamples))]
        public void RoundTrip_SharedStateMessageExample_WritesIdenticalBytes(string fileName)
        {
            AssertRoundTrip(Path.Combine(ExamplesDirectory(StateExampleKind), fileName), wire =>
                ProtocolJson.Serialize(ReadExample<StateMessage>(wire, StateTypes, message => message.Type)));
        }

        [TestMethod]
        public void StateExamples_EveryStateMessageType_HasOneAmongTheseAndTheRecords()
        {
            HashSet<string> declaredTypes = typeof(StateMessage).Assembly.GetTypes()
                .Where(type => type.IsSubclassOf(typeof(StateMessage)))
                .Select(type => StateTypes.Concat(RecordTypes).Single(pair => pair.Value == type).Key)
                .ToHashSet();

            Assert.IsTrue(ExampleTypes(StateExampleKind).Concat(ExampleTypes(RecordExampleKind)).ToHashSet().SetEquals(declaredTypes),
                $"State message types [{string.Join(", ", declaredTypes.Order())}].");
        }

        // As the server writes an answer: the value of the answer message that carries it
        [TestMethod]
        [DynamicData(nameof(AnswerExamples))]
        public void RoundTrip_SharedAnswerExample_WritesIdenticalBytes(string fileName)
        {
            AssertRoundTrip(Path.Combine(ExamplesDirectory(AnswerExampleKind), fileName), wire =>
            {
                QueryAnswer answer = ReadExample<QueryAnswer>(wire, AnswerTypes, read => read.Type);
                string message = ProtocolJson.Serialize(new AnswerMessage(0, ProtocolJson.ToNode(answer)));
                return JsonDocument.Parse(message).RootElement.GetProperty("value").GetRawText();
            });
        }

        [TestMethod]
        public void AnswerExamples_EveryAnswerType_HasOne()
        {
            HashSet<string> declaredTypes = typeof(QueryAnswer).Assembly.GetTypes()
                .Where(type => type.IsSubclassOf(typeof(QueryAnswer)))
                .Select(type => AnswerTypes.Single(pair => pair.Value == type).Key)
                .ToHashSet();

            Assert.IsTrue(ExampleTypes(AnswerExampleKind).SetEquals(declaredTypes),
                $"Answer types [{string.Join(", ", declaredTypes.Order())}].");
        }

        [TestMethod]
        public void Of_StateMessages_WritesTheSharedStateExample()
        {
            AssertRoundTrip(Path.Combine(ExamplesDirectory(SocketExamples), "state.json"),
                _ => ProtocolJson.Serialize(StateBatchMessage.Of([new DateMessage(3, 1901), new PopulationMessage(1240)])));
        }

        // A rejected command's result echoes the command to every player, inside a state batch
        [TestMethod]
        public void Serialize_ValueAsDeepAsAPlayerMaySend_IsWrittenInsideABatch()
        {
            JsonNode command = JsonText.Parse(new string('[', JsonText.MaxDepth) + new string(']', JsonText.MaxDepth))!;
            CommandResultMessage result = new CommandResultMessage(new CommandResult("a", command, Outcome.Rejected, "not a command"));

            string batch = ProtocolJson.Serialize(new StateBatchMessage(new JsonArray(ProtocolJson.ToNode(result))));

            StringAssert.Contains(batch, new string('[', JsonText.MaxDepth));
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
        private const string QueryExampleKind = "queries";
        private const string RecordExampleKind = "records";
        private const string AnswerExampleKind = "answers";
        private const string ClientExampleKind = "client";
        private const string StateExampleKind = "state";

        // The C# type the server writes each state message other than a record as, by its type field
        private static readonly IReadOnlyDictionary<string, Type> StateTypes = new Dictionary<string, Type>
        {
            ["map"] = typeof(MapMessage),
            ["tiles"] = typeof(TilesMessage),
            ["sprites"] = typeof(SpritesMessage),
            ["date"] = typeof(DateMessage),
            ["population"] = typeof(PopulationMessage),
            ["status"] = typeof(StatusRecord),
            ["demand"] = typeof(DemandMessage),
            ["news"] = typeof(NewsMessage),
            ["commandResult"] = typeof(CommandResultMessage),
            ["budgetReviewDue"] = typeof(BudgetReviewDueMessage),
            ["overlayUpdated"] = typeof(OverlayUpdatedMessage),
        };

        // The C# type the server writes each record and answer as, by its type field
        private static readonly IReadOnlyDictionary<string, Type> RecordTypes = new Dictionary<string, Type>
        {
            ["evaluation"] = typeof(EvaluationRecord),
            ["budget"] = typeof(BudgetRecord),
            ["settings"] = typeof(SettingsRecord),
        };

        private static readonly IReadOnlyDictionary<string, Type> AnswerTypes = new Dictionary<string, Type>
        {
            ["overlay"] = typeof(OverlayAnswer),
            ["tileReport"] = typeof(TileReportAnswer),
            ["budgetForecast"] = typeof(BudgetForecastAnswer),
            ["mapPreview"] = typeof(MapPreviewAnswer),
            ["rejected"] = typeof(QueryRejection),
        };

        // Strict, as the protocol's readers are: an unknown field or a missing one fails. The server never reads what
        // it only writes, so its tests read the examples with options of their own.
        private static readonly JsonSerializerOptions StrictReading = new JsonSerializerOptions
        {
            UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
            RespectNullableAnnotations = true,
            RespectRequiredConstructorParameters = true,
        };

        private static HashSet<string> ExampleTypes(string kind)
        {
            return ExamplePaths(kind)
                .Select(path => JsonDocument.Parse(ReadWireText(File.ReadAllBytes(path))).RootElement.GetProperty("type").GetString()!)
                .ToHashSet();
        }

        // The example read into the C# type of its type field, whose own type field must be the example's
        private static TBase ReadExample<TBase>(string wire, IReadOnlyDictionary<string, Type> types, Func<TBase, string> typeOf)
        {
            string type = JsonDocument.Parse(wire).RootElement.GetProperty("type").GetString()!;
            TBase read = (TBase)JsonSerializer.Deserialize(wire, types[type], StrictReading)!;

            Assert.AreEqual(type, typeOf(read));
            return read;
        }

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
