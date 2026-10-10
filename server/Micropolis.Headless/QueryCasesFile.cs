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
using Micropolis.Conformance;
using Micropolis.Rules;
using static Micropolis.Headless.ConformanceText;

namespace Micropolis.Headless
{
    /// <summary>
    /// <c>conformance/queries.json</c>: what the simulation answers to queries, and the records it produces, over the
    /// fixtures' saves. It holds the category of each tile value; the names of a zone's growth outlooks and blockers, in
    /// the order a report lists them, which the client's vocabulary is held to; each save's records, then those of new cities the
    /// fixtures never make; and each query with its answer: about each save, a tile's report the first time its
    /// category is met, at the city's centre, and at a zone's centre the first time an outlook, a blocker or a want of a
    /// road of its growth is met, the forecasts, and each overlay layer once, from the first save
    /// where it holds a value other than 0; then about the first save, the far corner's report and the queries it
    /// rejects; the queries asked before any city has started; and forecasts of a year whose cash pays only some
    /// services. A map preview's answer is the map <c>maps.json</c> holds, so none is listed.
    /// </summary>
    internal static class QueryCasesFile
    {
        public const string FileName = "queries.json";

        // Records the fixtures never produce: a city at the hardest level, with disasters on, auto-budget off and the
        // game paused
        private static readonly IReadOnlyList<(uint Seed, Level Level, IReadOnlyList<string> Commands)> VariedRecords =
        [
            (7, Level.Hard, ["""{"type":"setDisasters","on":true}""", """{"type":"setAutoBudget","on":false}""", """{"type":"setSpeed","speed":0}"""]),
        ];

        // The fundings and tax rates a forecast is asked about in each save: none named, every service named, one, the
        // lowest and highest tax rates, and a tax rate with a service
        private static readonly IReadOnlyList<string> Forecasts =
        [
            """{"type":"budgetForecast"}""",
            """{"type":"budgetForecast","road":0,"fire":50,"police":100}""",
            """{"type":"budgetForecast","fire":33}""",
            """{"type":"budgetForecast","tax":0}""",
            """{"type":"budgetForecast","tax":20}""",
            """{"type":"budgetForecast","road":50,"tax":9}""",
        ];

        // Queries the simulation rejects on the game's map, one or more for each reason it gives
        private static readonly IReadOnlyList<string> RejectedQueries =
        [
            "null", "[]", "\"overlay\"", "{}", """{"type":"weather"}""", """{"type":7}""",
            """{"type":"overlay"}""", """{"type":"overlay","layer":"crime","extra":1}""",
            """{"type":"tileReport","x":1}""", """{"type":"budgetForecast","taxes":7}""", """{"type":"mapPreview"}""",
            """{"type":"overlay","layer":"weather"}""", """{"type":"overlay","layer":3}""",
            """{"type":"tileReport","x":-1,"y":0}""", """{"type":"tileReport","x":120,"y":0}""", """{"type":"tileReport","x":0,"y":100}""",
            """{"type":"tileReport","x":1.5,"y":0}""",
            """{"type":"tileReport","x":"1","y":0}""",
            """{"type":"budgetForecast","road":101}""", """{"type":"budgetForecast","fire":-1}""", """{"type":"budgetForecast","police":50.5}""",
            """{"type":"budgetForecast","road":"50"}""",
            """{"type":"budgetForecast","tax":21}""", """{"type":"budgetForecast","tax":-1}""", """{"type":"budgetForecast","tax":7.5}""",
            """{"type":"budgetForecast","tax":"7"}""", """{"type":"budgetForecast","tax":null}""",
            """{"type":"mapPreview","seed":-1}""", """{"type":"mapPreview","seed":0.5}""", """{"type":"mapPreview","seed":4294967296}""",
            """{"type":"mapPreview","seed":"1"}""",
        ];

        // Queries asked before any city has started, every one rejected
        private static readonly IReadOnlyList<string> QueriesWithoutCity =
        [
            """{"type":"tileReport","x":1,"y":1}""", """{"type":"overlay","layer":"crime"}""", "\"mapPreview\"", "null",
            """{"type":"mapPreview","seed":-1}""", """{"type":"mapPreview","seed":1,"extra":true}""",
        ];

        // The reasons a query is rejected for, told apart by their words, with each number they quote written #. The
        // queries must reach every one, and a reason they reach that isn't listed fails too, so a reason the
        // simulation gains is listed here, with a query.
        private static readonly IReadOnlyList<string> RejectionReasons =
        [
            "not a query",
            "no city has started",
            "the overlay query has exactly the fields type, layer",
            "the tileReport query has exactly the fields type, x, y",
            "the budgetForecast query has exactly the fields type, and may have fire, police, road, tax",
            "the mapPreview query has exactly the fields type, seed",
            $"the layer is one of {string.Join(", ", Queries.Layers.Select(layer => layer.Name))}",
            "the tile is an x from # to # and a y from # to #, in whole numbers",
            "road funding is a whole percent from # to #",
            "fire funding is a whole percent from # to #",
            "police funding is a whole percent from # to #",
            "the tax rate is a whole percent from # to #",
            "the seed is a uint#",
        ];

        // What a forecast's year end leaves its cash short of
        private enum Shortfall
        {
            None,
            Partly,
            Wholly,
        }

        /// <summary>
        /// The file's text, about the fixtures' <paramref name="saves"/>, in their order.
        /// </summary>
        public static string Write(IReadOnlyList<FixtureSave> saves)
        {
            EnsureCovers(saves.Count > 0, "a save to ask about");

            List<JsonNode?> categories = Enumerable.Range(0, TileValues.TILE_COUNT).Select(value => (JsonNode?)Queries.ZoneCategory(value)).ToList();
            List<JsonNode?> records = new List<JsonNode?>();
            List<JsonNode?> answers = new List<JsonNode?>();
            HashSet<string> reported = new HashSet<string>(StringComparer.Ordinal);
            HashSet<string> growthsMet = new HashSet<string>(StringComparer.Ordinal);
            HashSet<string> overlaid = new HashSet<string>(StringComparer.Ordinal);

            foreach (FixtureSave save in saves)
            {
                Simulation city = Simulation.FromSave(save.Text);
                records.Add(Recorded(save.At.Name, [], city));

                answers.AddRange(TileReports(save.At.Name, city, reported, growthsMet));
                answers.AddRange(Forecasts.Select(query => Answered(save.At.Name, null, query, city)));

                foreach (string layer in Queries.Layers.Select(layer => layer.Name).Where(layer => !overlaid.Contains(layer)).ToList())
                {
                    JsonObject answered = Answered(save.At.Name, null, CanonicalJson.Stringify(new JsonObject { ["type"] = "overlay", ["layer"] = layer }), city);

                    // A layer the city never computed holds only 0
                    if (answered["answer"]!["values"]!.AsArray().Any(value => (double)value! != 0))
                    {
                        overlaid.Add(layer);
                        answers.Add(answered);
                    }
                }
            }

            foreach ((uint seed, Level level, IReadOnlyList<string> commands) in VariedRecords)
            {
                JsonObject start = new JsonObject { ["seed"] = seed, ["level"] = (int)level };
                records.Add(Recorded(start, commands, Simulation.NewCity(seed, level, Speed.Medium)));
            }

            FixtureSave first = saves[0];
            Simulation firstCity = Simulation.FromSave(first.Text);

            // The far corner of the map, the last tile a report is given for
            answers.Add(Answered(first.At.Name, null, """{"type":"tileReport","x":119,"y":99}""", firstCity));
            answers.AddRange(RejectedQueries.Select(query => Answered(first.At.Name, null, query, firstCity)));
            answers.AddRange(QueriesWithoutCity.Select(query => Answered(null, null, query, null)));
            answers.AddRange(ShortForecasts(saves));

            EnsureCoverage(categories, records, answers, overlaid);

            return JsonLines.FileOf([
                "{",
                .. JsonLines.ListMember("categories", categories, false),
                .. JsonLines.ListMember("growthOutlooks", Names<GrowthOutlook>(), false),
                .. JsonLines.ListMember("growthBlockers", Names<GrowthBlocker>(), false),
                .. JsonLines.ListMember("records", records, false),
                .. JsonLines.ListMember("answers", answers, true),
                "}",
            ]);
        }

        // The protocol's names of the enumeration's members, in their order, which a growth report lists blockers in
        private static List<JsonNode?> Names<TEnum>() where TEnum : struct, Enum
        {
            return Enum.GetValues<TEnum>().Select(value => (JsonNode?)ProtocolJson.Name(value)).ToList();
        }

        // The records the city produces once the commands have applied to it, in order
        private static JsonObject Recorded(JsonNode cityName, IReadOnlyList<string> commands, Simulation city)
        {
            city.ApplyCommands(commands.Select(command => new ReceivedCommand(PlayerIds.Local,JsonText.Parse(command))).ToList());

            return new JsonObject
            {
                ["city"] = cityName,
                ["commands"] = new JsonArray(commands.Select(command => JsonText.Parse(command)).ToArray()),
                ["evaluation"] = ProtocolJson.ToNode(city.EvaluationRecord()),
                ["budget"] = ProtocolJson.ToNode(city.BudgetRecord()),
                ["settings"] = ProtocolJson.ToNode(city.SettingsRecord()),
            };
        }

        // The query, from its JSON text, with its answer about the city, or before any city has started when the city
        // is null. Funds, where given, are those the save was given in place of its own.
        private static JsonObject Answered(string? save, long? funds, string query, Simulation? city)
        {
            QueryAnswer answer = city is null ? Queries.AnswerWithoutCity(JsonText.Parse(query)) : city.AnswerQuery(JsonText.Parse(query));
            JsonObject answered = new JsonObject { ["save"] = save };

            if (funds is long given)
            {
                answered["funds"] = given;
            }

            answered["query"] = JsonText.Parse(query);
            answered["answer"] = ProtocolJson.ToNode(answer);
            return answered;
        }

        // Each tile's report the first time its category is met, in the saves' order, the report at the city's centre,
        // and the report at a zone's centre the first time its growth's outlook, a blocker of it or its want of a road
        // is met
        private static List<JsonNode?> TileReports(string save, Simulation city, HashSet<string> reported, HashSet<string> growthsMet)
        {
            GameMap map = city.Map;
            List<JsonNode?> reports = [Answered(save, null, TileReportQuery(map.CityCentreX, map.CityCentreY), city)];

            for (int y = 0; y < map.Height; y++)
            {
                for (int x = 0; x < map.Width; x++)
                {
                    if (reported.Add(Queries.ZoneCategory(map.GetTileValue(x, y))))
                    {
                        reports.Add(Answered(save, null, TileReportQuery(x, y), city));
                    }
                }
            }

            for (int y = 0; y < map.Height; y++)
            {
                for (int x = 0; x < map.Width; x++)
                {
                    if (map.GetTile(x, y).IsZone() && ZoneGrowth.Report(city, x, y) is ZoneGrowthReport growth && IsNew(growth, growthsMet))
                    {
                        reports.Add(Answered(save, null, TileReportQuery(x, y), city));
                    }
                }
            }

            return reports;
        }

        // Whether the growth meets an outlook, a blocker or a want of a way out at its edge that no report before it met,
        // noting each it meets
        private static bool IsNew(ZoneGrowthReport growth, HashSet<string> growthsMet)
        {
            List<string> met = [ProtocolJson.Name(growth.Outlook), .. growth.Blockers.Select(ProtocolJson.Name)];
            if (!growth.WayAtEdge)
            {
                met.Add("no way out");
            }

            bool isNew = false;
            foreach (string meeting in met)
            {
                isNew |= growthsMet.Add(meeting);
            }

            return isNew;
        }

        private static string TileReportQuery(int x, int y)
        {
            return $$"""{"type":"tileReport","x":{{x}},"y":{{y}}}""";
        }

        // What the cash the year end would have is short of: nothing, as in a broke city, or every service's cost
        private static Shortfall ShortfallOf(JsonNode answer)
        {
            JsonNode costs = answer["costs"]!;
            double cash = (double)answer["budget"]!["funds"]! + (double)answer["taxes"]!;
            double cost = (double)costs["road"]! + (double)costs["fire"]! + (double)costs["police"]!;

            return cash > cost || cost == 0 ? Shortfall.None : cash > 0 ? Shortfall.Partly : Shortfall.Wholly;
        }

        // The forecasts in the first save whose year end has no cash for its services, with the funds set to half of
        // what the services cost and to exactly what they cost: the funds pay some services and scale one back, as no
        // fixture's year end leaves them to
        private static List<JsonNode?> ShortForecasts(IReadOnlyList<FixtureSave> saves)
        {
            FixtureSave? broke = saves.FirstOrDefault(save =>
                ShortfallOf(ProtocolJson.ToNode(Simulation.FromSave(save.Text).AnswerQuery(JsonText.Parse(Forecasts[0])))!) == Shortfall.Wholly);

            if (broke is null)
            {
                return [];
            }

            JsonNode costs = ProtocolJson.ToNode(Simulation.FromSave(broke.Text).AnswerQuery(JsonText.Parse(Forecasts[0])))!["costs"]!;
            long total = (long)(double)costs["road"]! + (long)(double)costs["fire"]! + (long)(double)costs["police"]!;

            return new[] { total / 2, total }.SelectMany(funds =>
            {
                JsonObject save = JsonNode.Parse(broke.Text)!.AsObject();
                save["budget"]!["totalFunds"] = funds;
                Simulation city = Simulation.FromSave(save.ToJsonString());
                return Forecasts.Select(query => (JsonNode?)Answered(broke.At.Name, funds, query, city));
            }).ToList();
        }

        private static void EnsureCoverage(List<JsonNode?> categories, List<JsonNode?> records, List<JsonNode?> answers, HashSet<string> overlaid)
        {
            foreach (OverlayLayer layer in Queries.Layers)
            {
                EnsureCovers(overlaid.Contains(layer.Name), $"an overlay of {layer.Name} holding a value other than 0");
            }

            foreach (string category in Queries.ZoneCategories)
            {
                EnsureCovers(categories.Any(value => (string)value! == category), $"a tile value of the category {category}");
            }

            List<JsonNode> given = answers.Select(answered => answered!["answer"]!).ToList();
            List<JsonNode> reports = given.Where(answer => (string)answer["type"]! == "tileReport").ToList();
            List<JsonNode> forecasts = given.Where(answer => (string)answer["type"]! == "budgetForecast").ToList();

            EnsureCovers(reports.Any(report => (bool)report["powered"]! && (bool)report["zoneCentre"]!), "a tile report of a powered zone centre");
            EnsureCovers(reports.Any(report => (double)report["fireCoverage"]! > 0 && (double)report["policeCoverage"]! > 0),
                         "a tile report covered by fire and police stations");

            List<JsonNode> growths = reports.Select(report => report["growth"]).OfType<JsonNode>().ToList();
            foreach (string zone in new[] { "RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL" })
            {
                EnsureCovers(growths.Any(growth => (string)growth["zone"]! == zone), $"a tile report of the growth of a {zone} zone");
            }

            foreach (GrowthOutlook outlook in Enum.GetValues<GrowthOutlook>())
            {
                EnsureCovers(growths.Any(growth => (string)growth["outlook"]! == ProtocolJson.Name(outlook)),
                             $"a tile report of a zone whose growth is {ProtocolJson.Name(outlook)}");
            }

            EnsureCovers(growths.Any(growth => !(bool)growth["wayAtEdge"]!), "a tile report of a zone with no way out at its edge");
            EnsureCovers(growths.Any(growth => growth["blockers"]!.AsArray().Count > 1), "a tile report of a zone held back by more than one thing");
            EnsureCovers(forecasts.Any(forecast => (double)forecast["fundsChange"]! < 0), "a forecast of a year that takes funds away");
            EnsureCovers(forecasts.Any(forecast => ShortfallOf(forecast) == Shortfall.Partly), "a forecast of a year whose cash pays only some of the services");

            List<JsonNode> written = records.Select(record => record!).ToList();
            EnsureCovers(written.Any(record => record["evaluation"]!["problems"]!.AsArray().Count > 0 && record["evaluation"]!["scoreBreakdown"]!.AsArray().Count > 0),
                         "an evaluation with problems and a score breakdown");
            EnsureCovers(written.Any(record => new[] { "road", "fire", "police" }
                             .Select(service => (double)record["budget"]!["funding"]![service]!)
                             .Any(funding => funding > 0 && funding < 1)),
                         "a budget funding a service in part");
            EnsureCovers(written.Any(record => (double)record["evaluation"]!["level"]! != 0), "an evaluation of a city above the easiest level");
            EnsureCovers(written.Any(record => (bool)record["settings"]!["disasters"]! && !(bool)record["settings"]!["autoBudget"]!
                                               && (double)record["settings"]!["speed"]! == 0),
                         "settings with disasters on, the budget set by hand and the game paused");

            EnsureReasonsCovered(given.Where(answer => (string)answer["type"]! == "rejected").Select(answer => ReasonWords((string)answer["reason"]!)),
                                 RejectionReasons, "the queries are rejected for");
        }
    }
}
