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

using System.Text.Json.Nodes;
using static Micropolis.Rules.Tests.FixtureCities;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// What a query means beyond its answer, which no file of answers shows: asking changes nothing, a map preview is
    /// the map a new city starts on, and the categories are named in the order of their tiles. The answers themselves
    /// are <c>conformance/queries.json</c>, which the fixture tool's tests hold to the rules byte for byte.
    /// </summary>
    [TestClass]
    public sealed class QueriesTests
    {
        // A seed whose map is open land, and the largest seed, asked before any city has started and of a city
        [TestMethod]
        [DataRow(8u, false)]
        [DataRow(8u, true)]
        [DataRow(uint.MaxValue, false)]
        [DataRow(uint.MaxValue, true)]
        public void AnswerQuery_MapPreview_IsTheMapANewCityOnTheSeedStartsOn(uint seed, bool ofACity)
        {
            GameMap map = Simulation.NewCity(seed, Level.Easy, Speed.Medium).Map;
            JsonObject query = new JsonObject { ["type"] = "mapPreview", ["seed"] = seed };

            QueryAnswer answer = ofACity ? City("town", "built").AnswerQuery(query) : Queries.AnswerWithoutCity(query);

            MapPreviewAnswer preview = (MapPreviewAnswer)answer;
            Assert.AreEqual(seed, preview.Seed);
            Assert.AreEqual(map.Width, preview.Width);
            Assert.AreEqual(map.Height, preview.Height);
            CollectionAssert.AreEqual(map.RawValues(), preview.Tiles.ToArray());
        }

        // Every kind of query, and one rejected, about every tile and layer: the city hashes as it did, its stream
        // included, since a query never draws from it
        [TestMethod]
        public void AnswerQuery_EveryKindOfQuery_LeavesTheCityAsItWas()
        {
            Simulation city = City("town", "run");
            string before = StateHash.HashSavedState(city.Save());
            List<JsonNode> queries =
            [
                .. Queries.Layers.Select(layer => new JsonObject { ["type"] = "overlay", ["layer"] = layer.Name }),
                .. Enumerable.Range(0, city.Map.Width * city.Map.Height)
                    .Select(i => new JsonObject { ["type"] = "tileReport", ["x"] = i % city.Map.Width, ["y"] = i / city.Map.Width }),
                new JsonObject { ["type"] = "budgetForecast" },
                new JsonObject { ["type"] = "budgetForecast", ["road"] = 0, ["fire"] = 50, ["police"] = 100 },
                new JsonObject { ["type"] = "mapPreview", ["seed"] = 1 },
                new JsonObject { ["type"] = "weather" },
            ];

            foreach (JsonNode query in queries)
            {
                city.AnswerQuery(query);
            }

            Assert.AreEqual(before, StateHash.HashSavedState(city.Save()));
        }

        // The protocol lists the categories in the order of the first tile each names, so no category is shadowed by
        // one before it
        [TestMethod]
        public void ZoneCategory_EveryTileValue_NamesTheCategoriesInTheirListedOrder()
        {
            List<string> named = Enumerable.Range(0, TileValues.TILE_COUNT).Select(Queries.ZoneCategory).Distinct().ToList();

            CollectionAssert.AreEqual(Queries.ZoneCategories.ToList(), named);
        }
    }
}
