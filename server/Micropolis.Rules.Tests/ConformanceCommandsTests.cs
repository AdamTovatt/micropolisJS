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
    /// <summary>
    /// Every command in <c>conformance/commands.json</c> applied in C#: each must come to the result the TypeScript
    /// gave it, the rejection's reason word for word included, and each case must leave the state hash it did.
    /// </summary>
    [TestClass]
    public sealed class ConformanceCommandsTests
    {
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
    }
}
