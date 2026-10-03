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
    /// The guards in the reader of <c>conformance/maps.json</c>, so the generator's tests cannot pass over maps the
    /// file lost.
    /// </summary>
    [TestClass]
    public sealed class ConformanceMapsTests
    {
        private static readonly string FileText = ConformanceFile.Read("maps.json");

        [TestMethod]
        public void Parse_SharedFile_ReadsIt()
        {
            Assert.IsNotEmpty(ConformanceMaps.Parse(FileText).Maps);
        }

        [TestMethod]
        [DataRow("no seeds", "no-seeds", "seeds is empty")]
        [DataRow("no listed maps", "no-maps", "maps is empty")]
        [DataRow("a member the reader doesn't know", "unknown-member", "extra")]
        [DataRow("a seed with no hash", "seed-without-hash", "hash")]
        [DataRow("a listed map missing a tile", "missing-tile", "has 11999 tiles")]
        [DataRow("a listed map with no hash", "listed-without-hash", "has no hash")]
        public void Parse_BrokenFile_Throws(string description, string change, string message)
        {
            JsonObject file = JsonNode.Parse(FileText)!.AsObject();
            Break(file, change);

            ConformanceAssert.Broken(() => ConformanceMaps.Parse(file.ToJsonString()), description, message);
        }

        private static void Break(JsonObject file, string change)
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
    }
}
