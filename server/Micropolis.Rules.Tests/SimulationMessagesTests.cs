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

        // Two calm cities, the first with every advisor condition holding that can hold beside the others, the second with
        // the rest: through the city time's 64-unit round the advisor asks about each condition at its own place, as
        // _sendMessages in src/simulation.js lays them out, and sends nothing at any other
        [TestMethod]
        [DataRow(
            "cityTax=13,coalPowerPop=0,comPop=101,comZonePop=6,crimeAverage=101,fireEffect=699,indPop=71,indZonePop=33," +
            "policeEffect=699,pollutionAverage=61,resPop=501,resZonePop=13,roadEffect=19,roadTotal=31,totalPop=61,trafficAverage=61",
            new[]
            {
                "1 " + Messages.NEED_MORE_RESIDENTIAL, "5 " + Messages.NEED_MORE_COMMERCIAL, "14 " + Messages.NEED_MORE_ROADS,
                "18 " + Messages.NEED_MORE_RAILS, "22 " + Messages.NEED_ELECTRICITY, "26 " + Messages.NEED_STADIUM,
                "28 " + Messages.NEED_SEAPORT, "30 " + Messages.NEED_AIRPORT, "35 " + Messages.HIGH_POLLUTION,
                "42 " + Messages.HIGH_CRIME, "45 " + Messages.NEED_FIRE_STATION, "48 " + Messages.NEED_POLICE_STATION,
                "51 " + Messages.TAX_TOO_HIGH, "54 " + Messages.ROAD_NEEDS_FUNDING, "57 " + Messages.FIRE_STATION_NEEDS_FUNDING,
                "60 " + Messages.POLICE_NEEDS_FUNDING, "63 " + Messages.TRAFFIC_JAMS,
            })]
        [DataRow(
            "indZonePop=2,poweredZoneCount=6,unpoweredZoneCount=4",
            new[] { "10 " + Messages.NEED_MORE_INDUSTRIAL, "32 " + Messages.BLACKOUTS_REPORTED })]
        public void SendMessages_TheRound_AsksAboutEachConditionAtItsPlace(string figures, string[] expected)
        {
            List<string> sent = new List<string>();

            for (int place = 0; place < 64; place++)
            {
                Simulation city = AdvisedCity(place, figures);
                List<string> subjects = Subjects(city);

                city.SendMessages();

                sent.AddRange(subjects.Select(subject => $"{place} {subject}"));
            }

            CollectionAssert.AreEqual(expected, sent);
        }

        // The stadium, seaport and airport checks set their zone type's demand cap while the city wants the building,
        // and clear it once it doesn't, leaving the others
        [TestMethod]
        [DataRow(26, "resPop=501", false, true, false, false)]
        [DataRow(28, "indPop=71", false, false, true, false)]
        [DataRow(30, "comPop=101", false, false, false, true)]
        [DataRow(26, "", true, false, true, true)]
        [DataRow(28, "", true, true, false, true)]
        [DataRow(30, "", true, true, true, false)]
        public void SendMessages_CapPlace_SetsTheCapFromTheCondition(int place, string figures, bool capsBefore, bool resCap, bool indCap, bool comCap)
        {
            Simulation city = AdvisedCity(place, figures);
            city.Valves.ResCap = capsBefore;
            city.Valves.IndCap = capsBefore;
            city.Valves.ComCap = capsBefore;

            city.SendMessages();

            Assert.AreEqual((resCap, indCap, comCap), (city.Valves.ResCap, city.Valves.IndCap, city.Valves.ComCap));
        }

        [TestMethod]
        public void SendMessages_HighPollution_SendsWhereThePollutionIsWorst()
        {
            Simulation city = AdvisedCity(35, "pollutionAverage=61");
            city.Map.PollutionMaxX = 17;
            city.Map.PollutionMaxY = 42;
            List<string> events = Record(city);

            city.SendMessages();

            CollectionAssert.AreEqual(
                new[] { $"{Messages.FRONT_END_MESSAGE} {{\"data\":{{\"x\":17,\"y\":42}},\"subject\":\"{Messages.HIGH_POLLUTION}\"}}" },
                events);
        }

        // A village of 1000 people grown to a town of (40 + (5 + 10) * 8) * 20 = 3200, at a growth check: the class is
        // announced unless it was the last announced
        [TestMethod]
        [DataRow(Messages.REACHED_CITY, true)]
        [DataRow(Messages.REACHED_TOWN, false)]
        public void SendMessages_NewClass_AnnouncesItUnlessItWasTheLast(string messageLast, bool announced)
        {
            Simulation city = City("suburb", "built", save =>
            {
                save["simulation"]!["cityTime"] = 64;
                save["simulation"]!["cityPopLast"] = 1000;
                save["simulation"]!["messageLast"] = messageLast;
            });
            city.Census.ResPop = 40;
            city.Census.ComPop = 5;
            city.Census.IndPop = 10;
            List<string> events = Record(city);

            city.SendMessages();

            string[] announcement = announced ? [$"{Messages.FRONT_END_MESSAGE} {{\"subject\":\"{Messages.REACHED_TOWN}\"}}"] : [];
            CollectionAssert.AreEqual(new[] { $"{Messages.POPULATION_UPDATED} 3200" }.Concat(announcement).ToList(), events);
            Assert.AreEqual(Messages.REACHED_TOWN, city.MessageLast);
        }

        // A calm city at a place in the advisor's round, with the figures given changed, whose growth check announces no
        // class and whose power messages aren't held back
        private static Simulation AdvisedCity(long cityTime, string figures)
        {
            Simulation city = City("suburb", "built", save =>
            {
                save["simulation"]!["cityTime"] = cityTime;
                save["simulation"]!["cityPopLast"] = 0;
                save["simulation"]!["lastPowerMessage"] = null;
            });
            CityFigures.CalmIn(city, figures);
            return city;
        }

        // The subject of each front-end message the simulation sends
        private static List<string> Subjects(Simulation city)
        {
            List<string> subjects = new List<string>();
            city.Events.Observer = (name, payload) =>
            {
                if (name == Messages.FRONT_END_MESSAGE)
                {
                    subjects.Add((string)payload!["subject"]!);
                }
            };
            return subjects;
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
