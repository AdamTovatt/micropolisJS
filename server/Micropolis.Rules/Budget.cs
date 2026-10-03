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
    /// <remarks>
    /// Each percent is the share of a service's upkeep funded, from 0 to 1: the double a single-precision value
    /// equals, or any double in a save written before the budget kept it in single precision.
    /// </remarks>
    public sealed class Budget
    {
        public long TotalFunds { get; internal set; }

        public long CityTax { get; internal set; }

        public bool AutoBudget { get; internal set; }

        public double RoadPercent { get; internal set; }

        public double FirePercent { get; internal set; }

        public double PolicePercent { get; internal set; }

        public long RoadSpend { get; internal set; }

        public long FireSpend { get; internal set; }

        public long PoliceSpend { get; internal set; }

        public long RoadMaintenanceBudget { get; internal set; }

        public long FireMaintenanceBudget { get; internal set; }

        public long PoliceMaintenanceBudget { get; internal set; }

        public long RoadEffect { get; internal set; }

        public long FireEffect { get; internal set; }

        public long PoliceEffect { get; internal set; }

        public long CashFlow { get; internal set; }

        public long TaxFund { get; internal set; }

        internal void Save(JsonObject saveData)
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

        internal void Load(SavedObject saveData)
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
