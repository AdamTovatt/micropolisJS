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
    /// <summary>
    /// The guards in the vector reader, so the random stream's tests cannot pass over vectors the file lost.
    /// </summary>
    [TestClass]
    public sealed class RandomVectorsTests
    {
        private static readonly string FileText = File.ReadAllText(RepositoryFiles.GetPath("conformance/random.json"));

        [TestMethod]
        public void Parse_SharedFile_ReadsIt()
        {
            RandomVectors vectors = RandomVectors.Parse(FileText);

            Assert.HasCount(4, vectors.Seeds[0].Seeded);
            Assert.AreEqual(42u, vectors.GetChance.Seed);
        }

        [TestMethod]
        [DataRow("no seeds", "no-seeds", "seeds is empty")]
        [DataRow("a seed with no outputs", "seed-without-outputs", "outputs is empty")]
        [DataRow("a state of three words", "three-word-state", "Expected 4")]
        [DataRow("a word in upper case", "upper-case-word", "eight lowercase hex digits")]
        [DataRow("a decimal seed", "decimal-seed", "eight lowercase hex digits")]
        [DataRow("no getRandom outputs", "no-get-random-outputs", "getRandom.outputs is empty")]
        [DataRow("no getChance outputs", "no-get-chance-outputs", "getChance.outputs is empty")]
        [DataRow("no getERandom section", "no-get-e-random", "getERandom")]
        public void Parse_BrokenFile_Throws(string description, string change, string message)
        {
            JsonObject file = JsonNode.Parse(FileText)!.AsObject();
            Break(file, change);

            Exception exception = Assert.Throws<Exception>(() => RandomVectors.Parse(file.ToJsonString()), description);

            Assert.IsTrue(exception is InvalidDataException or JsonException, $"Unexpected {exception.GetType().Name}.");
            StringAssert.Contains(exception.Message, message);
        }

        private static void Break(JsonObject file, string change)
        {
            JsonArray seeds = file["seeds"]!.AsArray();

            switch (change)
            {
                case "no-seeds":
                    file["seeds"] = new JsonArray();
                    break;
                case "seed-without-outputs":
                    seeds[0]!["outputs"] = new JsonArray();
                    break;
                case "three-word-state":
                    seeds[1]!["jumped"]!.AsArray().RemoveAt(3);
                    break;
                case "upper-case-word":
                    seeds[2]!["seeded"]![0] = "0x2FEB6E95";
                    break;
                case "decimal-seed":
                    file["getRandom"]!["seed"] = "42";
                    break;
                case "no-get-random-outputs":
                    file["getRandom"]!["outputs"] = new JsonArray();
                    break;
                case "no-get-chance-outputs":
                    file["getChance"]!["outputs"] = new JsonArray();
                    break;
                case "no-get-e-random":
                    file.Remove("getERandom");
                    break;
                default:
                    throw new ArgumentException($"No change named {change}.", nameof(change));
            }
        }
    }
}
