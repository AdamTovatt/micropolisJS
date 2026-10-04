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
using System.Text.RegularExpressions;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// Every command in <c>conformance/commands.json</c> applied in C#: each must come to the result the TypeScript
    /// gave it, the rejection's reason word for word included, and each case must leave the state hash it did.
    /// </summary>
    [TestClass]
    public sealed partial class ConformanceCommandsTests
    {
        // The reasons a command is rejected with, each number they quote written #, as REJECTION_REASONS in
        // conformance/generate.ts lists the TypeScript's
        private static readonly string[] RejectionReasons =
        [
            "a command nests objects and lists at most # deep",
            "a command is at most # characters of JSON",
            "not a command",
            "the tool command has exactly the fields type, autoBulldoze, path, tool",
            "the setBudget command has exactly the fields type, tax, and may have fire, police, road",
            "the setSpeed command has exactly the fields type, speed",
            "the setAutoBudget command has exactly the fields type, on",
            "the setDisasters command has exactly the fields type, on",
            "the triggerDisaster command has exactly the fields type, kind",
            "the addFunds command has exactly the fields type",
            $"the tool is one of {string.Join(", ", ProtocolJson.Names<ToolName>())}",
            "autoBulldoze is true or false",
            "a tool's path is a list of # to # tiles",
            "tile # of the path is not an {x, y} of whole numbers",
            "tile # of the path, (#, #), is off the #x# map",
            "tile # of the path, (#, #), is not next to the tile before it, (#, #)",
            "road funding is a whole percent from # to #",
            "fire funding is a whole percent from # to #",
            "police funding is a whole percent from # to #",
            "the tax rate is a whole percent from # to #",
            "the speed is a whole number from # to #",
            "setAutoBudget takes on, true or false",
            "setDisasters takes on, true or false",
            $"the disaster is one of {string.Join(", ", ProtocolJson.Names<DisasterKind>())}",
        ];

        public static IEnumerable<object[]> Cases => ConformanceCommands.Load().Select(commandCase => new object[] { commandCase });

        public static string DisplayName(System.Reflection.MethodInfo method, object[] data)
        {
            return data[0].ToString()!;
        }

        [TestMethod]
        [DynamicData(nameof(Cases), DynamicDataDisplayName = nameof(DisplayName))]
        public void ApplyCommands_SharedCase_GivesTheTypeScriptResults(CommandCase commandCase)
        {
            Simulation city = Simulation.FromSave(commandCase.ReadStartText());
            List<JsonNode?> emitted = new List<JsonNode?>();
            city.Events.AddEventListener(Messages.COMMAND_RESULT, payload => emitted.Add(payload?.DeepClone()));

            IReadOnlyList<CommandResult> results = city.ApplyCommands(commandCase.Results
                .Select(result => new ReceivedCommand((string)result["player"]!, result["command"]?.DeepClone()))
                .ToList());

            Assert.HasCount(commandCase.Results.Count, emitted);
            for (int i = 0; i < commandCase.Results.Count; i++)
            {
                Assert.AreEqual(CanonicalJson.Write(commandCase.Results[i]), CanonicalJson.Write(emitted[i]), $"Command {i}");
                Assert.AreEqual((string)commandCase.Results[i]["outcome"]!, ProtocolJson.Name(results[i].Outcome), $"Command {i}");
                Assert.AreEqual((string?)commandCase.Results[i]["reason"], results[i].Reason, $"Command {i}");
            }

            Assert.AreEqual(commandCase.Hash, StateHash.HashSavedState(city.Save()));
        }

        // The cases reach every reason listed, as the generator checks the TypeScript's: the reasons the C# gives them,
        // told apart by their words with each number they quote written #, are the list. So a case dropped from the file
        // can't leave a reason untested, and a reason a case reaches that isn't listed fails too. The list is kept by
        // hand: a reason the C# gains that no case reaches is in neither set, so it is listed, with a case, when it is
        // added, as REJECTION_REASONS is
        [TestMethod]
        public void ApplyCommands_SharedCases_GiveEveryRejectionReason()
        {
            HashSet<string> given = Cases.Select(data => (CommandCase)data[0])
                .SelectMany(commandCase => Simulation.FromSave(commandCase.ReadStartText()).ApplyCommands(commandCase.Results
                    .Select(result => new ReceivedCommand((string)result["player"]!, result["command"]?.DeepClone()))
                    .ToList()))
                .Where(result => result.Reason != null)
                .Select(result => QuotedNumber().Replace(result.Reason!, "#"))
                .ToHashSet();

            Assert.AreEqual("", string.Join("; ", RejectionReasons.Where(reason => !given.Contains(reason))), "Reasons no case reaches.");
            Assert.AreEqual("", string.Join("; ", given.Where(reason => !RejectionReasons.Contains(reason))), "Reasons reached but not listed.");
        }

        [TestMethod]
        public void Load_SharedFile_CoversEveryOutcome()
        {
            HashSet<string> outcomes = ConformanceCommands.Load()
                .SelectMany(commandCase => commandCase.Results.Select(result => (string)result["outcome"]!))
                .ToHashSet();

            Assert.IsTrue(outcomes.SetEquals(ProtocolJson.Names<Outcome>()), string.Join(", ", outcomes.Order()));
        }

        [TestMethod]
        [DataRow("no cases", "{\"cases\":[]}", "cases is empty")]
        [DataRow("a case with neither a fixture nor a state",
                 "{\"cases\":[{\"description\":\"d\",\"results\":[{\"player\":\"p\",\"command\":null,\"outcome\":\"rejected\",\"reason\":\"r\"}],\"hash\":\"h\"}]}",
                 "exactly one")]
        [DataRow("a result without its reason",
                 "{\"cases\":[{\"description\":\"d\",\"fixture\":\"suburb\",\"results\":[{\"player\":\"p\",\"command\":null,\"outcome\":\"ok\"}],\"hash\":\"h\"}]}",
                 "lacks reason")]
        [DataRow("a case with an unknown member",
                 "{\"cases\":[{\"description\":\"d\",\"fixture\":\"suburb\",\"results\":[],\"hash\":\"h\",\"seed\":1}]}", "unknown member seed")]
        [DataRow("a case without results", "{\"cases\":[{\"description\":\"d\",\"fixture\":\"suburb\",\"results\":[],\"hash\":\"h\"}]}",
                 "results is empty")]
        public void Parse_BrokenFile_Throws(string description, string json, string message)
        {
            ConformanceAssert.Broken(() => ConformanceCommands.Parse(json), description, message);
        }

        // A number as a reason quotes it, as the generator's /[0-9-][0-9e+.-]*/g finds one
        [GeneratedRegex("[0-9-][0-9e+.-]*")]
        private static partial Regex QuotedNumber();
    }
}
