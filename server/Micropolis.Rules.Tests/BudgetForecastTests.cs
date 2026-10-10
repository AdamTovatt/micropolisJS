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

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The budget forecast's taxes: at a tax rate asked about, what the year's collection would take from the census
    /// now, and without one, the last collection's. <c>conformance/queries.json</c> pins the answers themselves.
    /// </summary>
    [TestClass]
    public sealed class BudgetForecastTests
    {
        // A town with people in it: the town fixture after its run
        private const string Town = "town";
        private const string AfterItsRun = "run";

        [TestMethod]
        public void AnswerQuery_HigherTaxRate_ForecastsMoreTaxesAndFunds()
        {
            Simulation city = FixtureCities.City(Town, AfterItsRun);
            Assert.IsGreaterThan(0L, city.Census.TotalPop);

            BudgetForecastAnswer low = Forecast(city, """{"type":"budgetForecast","tax":3}""");
            BudgetForecastAnswer high = Forecast(city, """{"type":"budgetForecast","tax":9}""");

            Assert.IsGreaterThan(low.Taxes, high.Taxes);
            Assert.IsGreaterThan(low.FundsAfterYear, high.FundsAfterYear);
            Assert.AreEqual(high.Taxes - low.Taxes, high.FundsChange - low.FundsChange);
        }

        // The stored taxFund is set apart from what the census would collect now, so only an answer from it matches
        [TestMethod]
        public void AnswerQuery_NoTaxRate_ForecastsTheLastCollection()
        {
            Simulation city = FixtureCities.City(Town, AfterItsRun, save => save["budget"]!["taxFund"] = 1234);

            BudgetForecastAnswer forecast = Forecast(city, """{"type":"budgetForecast"}""");

            Assert.AreEqual(1234L, forecast.Taxes);
            Assert.AreEqual(1234L, forecast.Budget.TaxesCollected);
        }

        // The collection at the city's own rate, run on the same city, takes what the forecast at that rate said
        [TestMethod]
        public void AnswerQuery_TheCitysTaxRate_ForecastsWhatTheCollectionTakes()
        {
            Simulation city = FixtureCities.City(Town, AfterItsRun, save => save["budget"]!["taxFund"] = 0);
            long rate = city.Budget.CityTax;

            BudgetForecastAnswer forecast = Forecast(city, $$"""{"type":"budgetForecast","tax":{{rate}}}""");
            city.Budget.CollectTax(city.GameLevel, city.Census, city.Map.WalkwayNinths);

            Assert.IsGreaterThan(0L, forecast.Taxes);
            Assert.AreEqual(city.Budget.TaxFund, forecast.Taxes);
        }

        [TestMethod]
        [DataRow("-1")]
        [DataRow("21")]
        [DataRow("7.5")]
        [DataRow("\"7\"")]
        [DataRow("null")]
        public void AnswerQuery_TaxRateOutOfRange_IsRejected(string tax)
        {
            QueryAnswer answer = FixtureCities.City(Town, AfterItsRun).AnswerQuery(JsonNode.Parse($$"""{"type":"budgetForecast","tax":{{tax}}}"""));

            Assert.AreEqual(new QueryRejection("the tax rate is a whole percent from 0 to 20"), answer);
        }

        private static BudgetForecastAnswer Forecast(Simulation city, string query)
        {
            return (BudgetForecastAnswer)city.AnswerQuery(JsonNode.Parse(query));
        }
    }
}
