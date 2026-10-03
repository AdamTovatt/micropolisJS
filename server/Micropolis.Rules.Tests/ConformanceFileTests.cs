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
    /// The guards in the readers of <c>conformance/maps.json</c>, <c>conformance/canonicalJson.json</c> and
    /// <c>conformance/saves/hashes.json</c>, so the tests that read them cannot pass over data the files lost.
    /// </summary>
    [TestClass]
    public sealed class ConformanceFileTests
    {
        private static readonly string MapsText = ConformanceFile.Read("maps.json");

        private static readonly string VectorsText = ConformanceFile.Read("canonicalJson.json");

        private static readonly string SavesText = ConformanceFile.Read("saves/hashes.json");

        [TestMethod]
        public void Parse_SharedFiles_ReadsThem()
        {
            Assert.IsNotEmpty(ConformanceMaps.Parse(MapsText).Maps);
            Assert.IsNotEmpty(CanonicalJsonVectors.Parse(VectorsText).Numbers);
            Assert.IsNotEmpty(ConformanceSaves.Parse(SavesText));
        }

        [TestMethod]
        [DataRow("no seeds", "no-seeds", "seeds is empty")]
        [DataRow("no listed maps", "no-maps", "maps is empty")]
        [DataRow("a member the reader doesn't know", "unknown-member", "extra")]
        [DataRow("a seed with no hash", "seed-without-hash", "hash")]
        [DataRow("a listed map missing a tile", "missing-tile", "has 11999 tiles")]
        [DataRow("a listed map with no hash", "listed-without-hash", "has no hash")]
        public void ParseMaps_BrokenFile_Throws(string description, string change, string message)
        {
            JsonObject file = JsonNode.Parse(MapsText)!.AsObject();
            BreakMaps(file, change);

            AssertBroken(() => ConformanceMaps.Parse(file.ToJsonString()), description, message);
        }

        [TestMethod]
        [DataRow("no numbers", "no-numbers", "numbers is empty")]
        [DataRow("no strings", "no-strings", "strings is empty")]
        [DataRow("no documents", "no-documents", "documents is empty")]
        [DataRow("a number with no text", "number-without-text", "text")]
        public void ParseVectors_BrokenFile_Throws(string description, string change, string message)
        {
            JsonObject file = JsonNode.Parse(VectorsText)!.AsObject();
            BreakVectors(file, change);

            AssertBroken(() => CanonicalJsonVectors.Parse(file.ToJsonString()), description, message);
        }

        [TestMethod]
        [DataRow("no fixtures", "{}", "saves is empty")]
        [DataRow("a fixture without its run", "{\"town\":{\"built\":{\"step\":0,\"hash\":\"00\"}}}", "run")]
        [DataRow("a checkpoint with no hash", "{\"town\":{\"built\":{\"step\":0},\"run\":{\"step\":1,\"hash\":\"00\"}}}", "hash")]
        public void ParseSaves_BrokenFile_Throws(string description, string json, string message)
        {
            AssertBroken(() => ConformanceSaves.Parse(json), description, message);
        }

        [TestMethod]
        [DataRow("0x3ff")]
        [DataRow("3ff0000000000000xx")]
        public void NumberVectorValue_MalformedBits_Throws(string bits)
        {
            InvalidDataException exception = Assert.Throws<InvalidDataException>(() => new NumberVector(bits, "1").Value);

            StringAssert.Contains(exception.Message, "sixteen hex digits");
        }

        private static void AssertBroken(Action parse, string description, string message)
        {
            Exception exception = Assert.Throws<Exception>(parse, description);

            Assert.IsTrue(exception is InvalidDataException or JsonException, $"Unexpected {exception.GetType().Name}.");
            StringAssert.Contains(exception.Message, message);
        }

        private static void BreakMaps(JsonObject file, string change)
        {
            JsonArray seeds = file["seeds"]!.AsArray();
            JsonObject listed = file["maps"]![0]!.AsObject();

            switch (change)
            {
                case "no-seeds":
                    file["seeds"] = new JsonArray();
                    break;
                case "no-maps":
                    file["maps"] = new JsonArray();
                    break;
                case "unknown-member":
                    seeds[0]!["extra"] = 1;
                    break;
                case "seed-without-hash":
                    seeds[0]!.AsObject().Remove("hash");
                    break;
                case "missing-tile":
                    listed["map"]!["tiles"]!.AsArray().RemoveAt(0);
                    break;
                case "listed-without-hash":
                    uint seed = listed["seed"]!.GetValue<uint>();
                    file["seeds"] = new JsonArray(seeds.Where(entry => entry!["seed"]!.GetValue<uint>() != seed).Select(entry => entry!.DeepClone()).ToArray());
                    break;
                default:
                    throw new ArgumentException($"No change named {change}.", nameof(change));
            }
        }

        private static void BreakVectors(JsonObject file, string change)
        {
            switch (change)
            {
                case "no-numbers":
                    file["numbers"] = new JsonArray();
                    break;
                case "no-strings":
                    file["strings"] = new JsonArray();
                    break;
                case "no-documents":
                    file["documents"] = new JsonArray();
                    break;
                case "number-without-text":
                    file["numbers"]![0]!.AsObject().Remove("text");
                    break;
                default:
                    throw new ArgumentException($"No change named {change}.", nameof(change));
            }
        }
    }
}
