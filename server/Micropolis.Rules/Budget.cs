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

namespace Micropolis.Rules
{
    /// <summary>
    /// The city's funds, tax rate and services' funding.
    /// </summary>
    public sealed class Budget
    {
        public long TotalFunds { get; set; }

        public long CityTax { get; set; }

        public bool AutoBudget { get; set; }

        /// <summary>
        /// The share of road upkeep funded, from 0 to 1: the double a single-precision value equals, or any double in
        /// a save written before the budget kept it in single precision.
        /// </summary>
        public double RoadPercent { get; set; }

        /// <summary>
        /// The share of the fire service's upkeep funded, from 0 to 1: the double a single-precision value equals, or
        /// any double in a save written before the budget kept it in single precision.
        /// </summary>
        public double FirePercent { get; set; }

        /// <summary>
        /// The share of the police's upkeep funded, from 0 to 1: the double a single-precision value equals, or any
        /// double in a save written before the budget kept it in single precision.
        /// </summary>
        public double PolicePercent { get; set; }

        public long RoadSpend { get; set; }

        public long FireSpend { get; set; }

        public long PoliceSpend { get; set; }

        public long RoadMaintenanceBudget { get; set; }

        public long FireMaintenanceBudget { get; set; }

        public long PoliceMaintenanceBudget { get; set; }

        public long RoadEffect { get; set; }

        public long FireEffect { get; set; }

        public long PoliceEffect { get; set; }

        public long CashFlow { get; set; }

        public long TaxFund { get; set; }

        public void Save(JsonObject saveData)
        {
            saveData["budget"] = new JsonObject
            {
                ["totalFunds"] = TotalFunds,
                ["cityTax"] = CityTax,
                ["autoBudget"] = AutoBudget,
                ["roadPercent"] = RoadPercent,
                ["firePercent"] = FirePercent,
                ["policePercent"] = PolicePercent,
                ["roadSpend"] = RoadSpend,
                ["fireSpend"] = FireSpend,
                ["policeSpend"] = PoliceSpend,
                ["roadMaintenanceBudget"] = RoadMaintenanceBudget,
                ["fireMaintenanceBudget"] = FireMaintenanceBudget,
                ["policeMaintenanceBudget"] = PoliceMaintenanceBudget,
                ["roadEffect"] = RoadEffect,
                ["fireEffect"] = FireEffect,
                ["policeEffect"] = PoliceEffect,
                ["cashFlow"] = CashFlow,
                ["taxFund"] = TaxFund,
            };
        }

        public void Load(SavedObject saveData)
        {
            saveData.ReadObject("budget", budget =>
            {
                TotalFunds = budget.ReadSafeInteger("totalFunds");
                CityTax = budget.ReadSafeInteger("cityTax");
                AutoBudget = budget.ReadBool("autoBudget");
                RoadPercent = budget.ReadNumber("roadPercent", 0, 1);
                FirePercent = budget.ReadNumber("firePercent", 0, 1);
                PolicePercent = budget.ReadNumber("policePercent", 0, 1);
                RoadSpend = budget.ReadSafeInteger("roadSpend");
                FireSpend = budget.ReadSafeInteger("fireSpend");
                PoliceSpend = budget.ReadSafeInteger("policeSpend");
                RoadMaintenanceBudget = budget.ReadSafeInteger("roadMaintenanceBudget");
                FireMaintenanceBudget = budget.ReadSafeInteger("fireMaintenanceBudget");
                PoliceMaintenanceBudget = budget.ReadSafeInteger("policeMaintenanceBudget");
                RoadEffect = budget.ReadSafeInteger("roadEffect");
                FireEffect = budget.ReadSafeInteger("fireEffect");
                PoliceEffect = budget.ReadSafeInteger("policeEffect");
                CashFlow = budget.ReadSafeInteger("cashFlow");
                TaxFund = budget.ReadSafeInteger("taxFund");
            });
        }
    }
}
