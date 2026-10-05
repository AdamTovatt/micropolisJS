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
    /// The generator's determinism. What it lays for each seed is <c>conformance/maps.json</c>, which the fixture tool's
    /// tests hold to the generator byte for byte.
    /// </summary>
    [TestClass]
    public sealed class MapGeneratorTests
    {
        [TestMethod]
        public void Generate_SameStreamState_GeneratesSameMap()
        {
            Assert.AreEqual(CanonicalJson.Write(SavedMapObject(1234)), CanonicalJson.Write(SavedMapObject(1234)));
        }

        [TestMethod]
        public void Generate_DifferentSeed_GeneratesDifferentMap()
        {
            Assert.AreNotEqual(CanonicalJson.Write(SavedMapObject(1234)), CanonicalJson.Write(SavedMapObject(1235)));
        }

        private static JsonObject SavedMapObject(uint seed)
        {
            JsonObject saveData = new JsonObject();
            MapGenerator.Generate(RandomStream.MapStream(seed)).Save(saveData);
            return saveData["map"]!.AsObject();
        }
    }
}
