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

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The year end's funding of the services, tested directly: the fixtures' cities run into only some of the
    /// shortfalls.
    /// </summary>
    [TestClass]
    public sealed class ServiceFundingTests
    {
        private static readonly ServiceAmounts<long> Maintenance = new ServiceAmounts<long>(100, 100, 200);
        private static readonly ServiceAmounts<double> FullFunding = new ServiceAmounts<double>(1, 1, 1);
        private static readonly ServiceAmounts<double> NoFunding = new ServiceAmounts<double>(0, 0, 0);
        private static readonly ServiceAmounts<long> NothingPaid = new ServiceAmounts<long>(0, 0, 0);

        [TestMethod]
        [DataRow(240L, 1.0, 240L)]
        [DataRow(101L, 0.5, 50L)]
        [DataRow(240L, 0.0, 0L)]
        // 100 * 0.57 is 56.99999 in double, and 57 in float
        [DataRow(100L, 0.57, 57L)]
        public void CostAt_MaintenanceAtAPercentage_DropsTheFractionOfTheFloatProduct(long maintenance, double percent, long cost)
        {
            Assert.AreEqual(cost, ServiceFunding.CostAt(maintenance, percent));
        }

        [TestMethod]
        [DataRow(32L, 57L, 100L, 18L)]
        [DataRow(1000L, 93L, 300L, 310L)]
        [DataRow(1000L, 300L, 300L, 1000L)]
        [DataRow(1000L, 0L, 300L, 0L)]
        // In double, 1000 * 27431 / 32773 is 836.99...; in float it is 837
        [DataRow(1000L, 27431L, 32773L, 837L)]
        public void FundEffect_SpendOfMaintenance_ScalesTheFullEffectInFloat(long maxEffect, long spend, long maintenance, long effect)
        {
            Assert.AreEqual(effect, ServiceFunding.FundEffect(maxEffect, spend, maintenance));
        }

        [TestMethod]
        public void FundServices_MoreThanEnoughCash_PaysWhatEachWantsAndKeepsThePercentages()
        {
            ServiceAmounts<double> percents = new ServiceAmounts<double>(1, 0.5, 0.57);

            Funding funding = ServiceFunding.FundServices(1000, Maintenance, percents);

            Assert.AreEqual(new Funding(new ServiceAmounts<long>(100, 50, 114), new ServiceAmounts<long>(100, 50, 114), percents), funding);
        }

        // Police, left with exactly the $114 it wants, is scaled back to 114 / 200 in float, not kept at 0.57
        [TestMethod]
        public void FundServices_CashExactlyWhatTheServicesWant_ScalesBackTheLast()
        {
            Funding funding = ServiceFunding.FundServices(314, Maintenance, new ServiceAmounts<double>(1, 1, 0.57));

            Assert.AreEqual(new ServiceAmounts<long>(100, 100, 114), funding.Paid);
            Assert.AreEqual((double)(float)0.57, funding.Percents.Police);
            Assert.AreNotEqual(0.57, funding.Percents.Police);
        }

        [TestMethod]
        public void FundServices_CashRunsOutAtFire_FundsRoadsThenPartOfFireAndNoPolice()
        {
            Funding funding = ServiceFunding.FundServices(150, Maintenance, FullFunding);

            Assert.AreEqual(new Funding(new ServiceAmounts<long>(100, 100, 200), new ServiceAmounts<long>(100, 50, 0),
                                        new ServiceAmounts<double>(1, 0.5, 0)), funding);
        }

        [TestMethod]
        public void FundServices_CashShortOfTheRoads_FundsPartOfTheRoadsAndNothingElse()
        {
            Funding funding = ServiceFunding.FundServices(60, Maintenance, FullFunding);

            Assert.AreEqual(new ServiceAmounts<long>(60, 0, 0), funding.Paid);
            Assert.AreEqual(new ServiceAmounts<double>((float)0.6, 0, 0), funding.Percents);
        }

        // The roads take all $100, so fire and police reach the end of the cash with no maintenance cost to divide by
        [TestMethod]
        public void FundServices_ServiceCostingNothingAfterTheCashRanOut_IsAtZero()
        {
            Funding funding = ServiceFunding.FundServices(100, new ServiceAmounts<long>(100, 0, 0), FullFunding);

            Assert.AreEqual(new ServiceAmounts<long>(100, 0, 0), funding.Paid);
            Assert.AreEqual(new ServiceAmounts<double>(1, 0, 0), funding.Percents);
        }

        [TestMethod]
        public void FundServices_NoCash_PaysNothingAtZero()
        {
            Funding funding = ServiceFunding.FundServices(0, Maintenance, FullFunding);

            Assert.AreEqual(NothingPaid, funding.Paid);
            Assert.AreEqual(NoFunding, funding.Percents);
        }

        [TestMethod]
        public void FundServices_NothingFunded_PaysNothingAndKeepsZero()
        {
            Funding funding = ServiceFunding.FundServices(500, Maintenance, NoFunding);

            Assert.AreEqual(new Funding(NothingPaid, NothingPaid, NoFunding), funding);
        }

        [TestMethod]
        public void FundServices_NeitherCashNorAnythingWanted_PaysNothingAndGoesBackToFullFunding()
        {
            Funding funding = ServiceFunding.FundServices(0, new ServiceAmounts<long>(0, 0, 0), FullFunding);

            Assert.AreEqual(NothingPaid, funding.Paid);
            Assert.AreEqual(FullFunding, funding.Percents);
        }

        [TestMethod]
        public void ForecastYear_CashCoversTheServices_AddsTaxesAndSubtractsThem()
        {
            ServiceAmounts<long> maintenance = new ServiceAmounts<long>(300, 200, 100);

            Assert.AreEqual(new YearForecast(maintenance, 3000, 2400, 12757), ServiceFunding.ForecastYear(10357, 3000, maintenance, FullFunding));
        }

        // The services are paid from funds and taxes together: funds alone would pay only the $100 of the roads
        [TestMethod]
        public void ForecastYear_FundsShortButTaxesMakeUpTheRest_PaysEveryService()
        {
            ServiceAmounts<long> maintenance = new ServiceAmounts<long>(300, 200, 100);

            Assert.AreEqual(new YearForecast(maintenance, 600, 0, 100), ServiceFunding.ForecastYear(100, 600, maintenance, FullFunding));
        }

        [TestMethod]
        public void ForecastYear_ServicesAtSomeFunding_ChargesEachAtItsPercentage()
        {
            ServiceAmounts<long> maintenance = new ServiceAmounts<long>(300, 200, 100);

            Assert.AreEqual(new YearForecast(new ServiceAmounts<long>(150, 0, 100), 0, -250, 750),
                ServiceFunding.ForecastYear(1000, 0, maintenance, new ServiceAmounts<double>(0.5, 0, 1)));
        }

        // $150 pays the $100 of roads and $50 of the fire department; police goes unpaid
        [TestMethod]
        public void ForecastYear_CashShort_SubtractsOnlyWhatItPays()
        {
            Assert.AreEqual(new YearForecast(Maintenance, 50, -100, 0), ServiceFunding.ForecastYear(100, 50, Maintenance, FullFunding));
        }
    }
}
