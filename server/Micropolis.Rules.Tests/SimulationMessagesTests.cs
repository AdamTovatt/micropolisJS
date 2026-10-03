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
using static Micropolis.Rules.Tests.FixtureCities;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The events the simulation passes on from its components, as <c>Simulation.init</c> in <c>src/simulation.js</c>
    /// wires them, and those it sends itself.
    /// </summary>
    [TestClass]
    public sealed class SimulationMessagesTests
    {
        // As the TypeScript's test of the throttle: a power message is sent unless one was, three years (144) or less
        // before
        [TestMethod]
        [DataRow(244L, false)]
        [DataRow(245L, true)]
        public void SendPowerMessage_CityTimeSinceTheLast_SendsOnlyAfterThreeYears(long cityTime, bool sent)
        {
            Simulation city = City("suburb", "built", save =>
            {
                save["simulation"]!["cityTime"] = cityTime;
                save["simulation"]!["lastPowerMessage"] = 100;
            });
            List<string> events = Record(city);

            city.PowerManager.Events.Emit(Messages.NOT_ENOUGH_POWER);

            string[] expected = sent ? [$"{Messages.FRONT_END_MESSAGE} {{\"subject\":\"{Messages.NOT_ENOUGH_POWER}\"}}"] : [];
            CollectionAssert.AreEqual(expected, events);
            Assert.AreEqual(sent ? cityTime : 100, city.LastPowerMessage);
        }

        [TestMethod]
        public void SendPowerMessage_NoneSentBefore_Sends()
        {
            Simulation city = City("suburb", "built", save => save["simulation"]!["lastPowerMessage"] = null);
            List<string> events = Record(city);

            city.SendPowerMessage(Messages.NOT_ENOUGH_POWER);

            Assert.HasCount(1, events);
            Assert.AreEqual(city.CityTime, city.LastPowerMessage);
        }

        [TestMethod]
        public void WrapMessage_EventWithoutPayload_SendsTheSubjectAlone()
        {
            Simulation city = City("suburb", "built");
            List<string> events = Record(city);

            city.Budget.Events.Emit(Messages.NO_MONEY);

            CollectionAssert.AreEqual(new[] { $"{Messages.FRONT_END_MESSAGE} {{\"subject\":\"{Messages.NO_MONEY}\"}}" }, events);
        }

        // A payload another object holds, which the message holds too: a JSON node has one parent, so the message's is a
        // copy
        [TestMethod]
        public void WrapMessage_DisasterWithAPayloadHeldElsewhere_SendsItAsTheData()
        {
            Simulation city = City("suburb", "built");
            List<string> events = Record(city);
            string disaster = Messages.DISASTER_MESSAGES[0];
            JsonObject holder = new JsonObject { ["payload"] = new JsonObject { ["x"] = 3, ["y"] = 4 } };

            city.DisasterManager.Events.Emit(disaster, holder["payload"]);

            CollectionAssert.AreEqual(new[] { $"{Messages.FRONT_END_MESSAGE} {{\"data\":{{\"x\":3,\"y\":4}},\"subject\":\"{disaster}\"}}" }, events);
        }

        [TestMethod]
        public void ReflectEvent_FundsChanged_PassesTheEventOnAsItIs()
        {
            Simulation city = City("suburb", "built");
            List<string> events = Record(city);

            city.Budget.Events.Emit(Messages.FUNDS_CHANGED, 1234);

            CollectionAssert.AreEqual(new[] { $"{Messages.FUNDS_CHANGED} 1234" }, events);
        }

        [TestMethod]
        public void OnValveChange_ValvesUpdated_SendsTheValves()
        {
            Simulation city = City("suburb", "built", save =>
            {
                save["valves"]!["resValve"] = 100;
                save["valves"]!["comValve"] = -50;
                save["valves"]!["indValve"] = 25;
            });
            List<string> events = Record(city);

            city.Valves.Events.Emit(Messages.VALVES_UPDATED);

            CollectionAssert.AreEqual(
                new[] { $"{Messages.VALVES_UPDATED} {{\"commercial\":-50,\"industrial\":25,\"residential\":100}}" }, events);
        }

        // The layers each phase recomputes, as LAYER_PHASES in src/queries.ts lists them
        [TestMethod]
        [DataRow(9, new string[0])]
        [DataRow(10, new[] { "trafficDensity", "rateOfGrowth" })]
        [DataRow(11, new[] { "powerGrid" })]
        [DataRow(12, new[] { "landValue", "pollution" })]
        [DataRow(13, new[] { "crime", "policeCoverage" })]
        [DataRow(14, new[] { "populationDensity" })]
        [DataRow(15, new[] { "fireCoverage" })]
        public void OverlaysUpdated_Phase_AnnouncesTheLayersItRecomputes(int phase, string[] layers)
        {
            Simulation city = City("suburb", "built", save => save["simulation"]!["phaseCycle"] = phase);
            List<string> events = Record(city);

            city.OverlaysUpdated();

            CollectionAssert.AreEqual(layers.Select(layer => $"{Messages.OVERLAY_UPDATED} {{\"layer\":\"{layer}\"}}").ToList(), events);
        }

        // Each event the simulation sends, as its name and its payload's canonical text
        private static List<string> Record(Simulation city)
        {
            List<string> events = new List<string>();
            city.Events.Observer = (name, payload) => events.Add(payload is null ? name : $"{name} {CanonicalJson.Write(payload)}");
            return events;
        }
    }
}
