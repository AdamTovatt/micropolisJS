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
    [TestClass]
    public sealed class CityStateMessagesTests
    {
        [TestMethod]
        public void NewMessages_NothingChanged_IsEmpty()
        {
            CityStateMessages messages = new CityStateMessages(City("suburb", "run"));

            Assert.IsEmpty(messages.NewMessages());
        }

        [TestMethod]
        public void NewMessages_TileChanged_SendsItOnce()
        {
            Simulation city = City("suburb", "run");
            CityStateMessages messages = new CityStateMessages(city);

            city.Map.SetTileValue(3, 4, TileValues.RUBBLE);

            Assert.AreEqual($$"""{"type":"tiles","changes":[{"x":3,"y":4,"value":{{city.Map.GetTile(3, 4).GetRawValue()}}}]}""",
                            Batch(messages, city).Single());
            Assert.IsEmpty(messages.NewMessages());
        }

        [TestMethod]
        public void NewMessages_Sprite_SendsItWhereTheClientDrawsIt()
        {
            Simulation city = City("suburb", "run");
            CityStateMessages messages = new CityStateMessages(city);

            Sprite copter = city.SpriteManager.MakeSprite(SpriteType.Helicopter, 100, 200);

            // A helicopter is drawn 32 wide, 32 right of and 16 above its position
            Assert.AreEqual($$"""{"type":"sprites","sprites":[{"type":{{(int)SpriteType.Helicopter}},"frame":{{copter.Frame}},"x":132,"y":184,"width":32}]}""",
                            Batch(messages, city).Single());
        }

        [TestMethod]
        public void NewMessages_OverlayUpdatedTwice_SendsEachLayerOnceInOrder()
        {
            Simulation city = City("suburb", "run");
            CityStateMessages messages = new CityStateMessages(city);

            city.Events.Emit(RulesEvents.OverlayUpdated, new OverlayUpdatedMessage("crime"));
            city.Events.Emit(RulesEvents.OverlayUpdated, new OverlayUpdatedMessage("pollution"));
            city.Events.Emit(RulesEvents.OverlayUpdated, new OverlayUpdatedMessage("crime"));

            CollectionAssert.AreEqual(
                new[] { """{"type":"overlayUpdated","layer":"crime"}""", """{"type":"overlayUpdated","layer":"pollution"}""" },
                Batch(messages, city));
        }

        [TestMethod]
        public void NewMessages_RecordChanged_SendsItOnceBeforeTheEvents()
        {
            Simulation city = City("suburb", "run");
            CityStateMessages messages = new CityStateMessages(city);

            SetSpeed(city, Speed.Fast);

            CollectionAssert.AreEqual(new[] { "settings", "commandResult", "clock" }, Types(messages.NewMessages()));
            Assert.IsEmpty(messages.NewMessages());
        }

        [TestMethod]
        public void NewMessages_TilesRecordsAndEvents_SendsTilesThenRecordsThenEventsInTheOrderTheyCame()
        {
            Simulation city = City("suburb", "run");
            CityStateMessages messages = new CityStateMessages(city);

            city.Events.Emit(RulesEvents.FrontEndMessage, new NewsMessage(Messages.NO_MONEY));
            SetSpeed(city, Speed.Fast);
            city.Events.Emit(RulesEvents.BudgetReviewDue);
            city.Map.SetTileValue(3, 4, TileValues.RUBBLE);

            List<string> sent = Wire(messages.NewMessages());

            CollectionAssert.AreEqual(new[] { "tiles", "settings", "news", "commandResult", "budgetReviewDue", "clock" },
                                      sent.Select(text => (string)JsonNode.Parse(text)!["type"]!).ToList());
            Assert.AreEqual($$"""{"type":"news","subject":"{{Messages.NO_MONEY}}"}""", sent[2]);
            StringAssert.StartsWith(sent[3], """{"type":"commandResult","result":{"player":"ada","command":{"type":"setSpeed",""");
        }

        // Eight whole cycles at fast speed, in which the status is published each cycle and the demand every other
        [TestMethod]
        public void NewMessages_SomeCycles_SendsTheLatestStatusAndDemandAfterTheRecordsAndBeforeTheEvents()
        {
            CityStateMessages messages = AfterSomeCycles();

            List<int> ranks = Types(messages.NewMessages()).Select(Rank).ToList();

            CollectionAssert.IsSubsetOf(new[] { 2, 3 }, ranks);
            CollectionAssert.AreEqual(ranks.Order().ToList(), ranks);
        }

        [TestMethod]
        public void NewMessages_TripsAndRidesOffered_SendsThemOnceLastInTheOrderOffered()
        {
            List<Trip> offered = new List<Trip>();
            List<Ride> ridden = new List<Ride>();
            CityStateMessages messages = AfterSomeCycles(city =>
            {
                city.Trips.RunOffered += offered.Add;
                city.Trips.RideOffered += ridden.Add;
            }, "commuters");

            IReadOnlyList<StateMessage> sent = messages.NewMessages();

            Assert.IsGreaterThan(1, offered.Count, "Too few trips offered to check.");
            Assert.IsGreaterThan(1, ridden.Count, "Too few rides offered to check.");
            Assert.AreEqual(ProtocolJson.Serialize(new TripsMessage(offered, ridden)), ProtocolJson.Serialize(sent[^1]));
            Assert.AreEqual(1, Types(sent).Count(type => type == "trips"));
            CollectionAssert.DoesNotContain(Types(messages.NewMessages()), "trips");
        }

        // A batch whose trips are rides alone sends its runs by road as an empty list
        [TestMethod]
        public void NewMessages_RidesAloneOffered_SendsNoRoutes()
        {
            Simulation city = City("town", "built");
            CityStateMessages messages = new CityStateMessages(city);

            city.Trips.Routed([new RouteStep(new Position(25, 15), TravelMode.Rail), new RouteStep(new Position(26, 15), TravelMode.Rail)]);

            long departure = Timetable.NextDeparture(25, 15, city.StepClock);
            Assert.AreEqual($"{{\"type\":\"trips\",\"routes\":[],\"rides\":[[25,15,\"E\",{departure}]]}}", ProtocolJson.Serialize(messages.NewMessages()[^1]));
        }

        // A batch with anything to carry ends with the step clock, as it stands, when it has no trips
        [TestMethod]
        public void NewMessages_ACommandApplied_EndsWithTheStepClock()
        {
            Simulation city = QuietCity();
            CityStateMessages messages = new CityStateMessages(city);

            SetSpeed(city, Speed.Paused);
            List<string> sent = Wire(messages.NewMessages());

            Assert.AreEqual($"{{\"type\":\"clock\",\"steps\":{city.StepClock}}}", sent[^1]);
        }

        // A step that changed nothing a player is sent makes no batch for the step clock alone, though it moved
        [TestMethod]
        public void NewMessages_AStepThatChangedNothingSent_SendsNothing()
        {
            Simulation city = QuietCity();
            CityStateMessages messages = new CityStateMessages(city);
            messages.NewMessages();
            long before = city.StepClock;

            city.Step();
            IReadOnlyList<StateMessage> sent = messages.NewMessages();

            Assert.AreEqual(before + 1, city.StepClock);
            Assert.IsEmpty(sent, string.Join(", ", Wire(sent)));
        }

        // The step clock comes just before the trips, so the client lines the departures up with its own clock
        [TestMethod]
        public void NewMessages_RidesOffered_SendsTheStepClockJustBeforeThem()
        {
            Simulation city = QuietCity();
            CityStateMessages messages = new CityStateMessages(city);
            messages.NewMessages();

            city.Trips.Routed([new RouteStep(new Position(25, 15), TravelMode.Rail), new RouteStep(new Position(26, 15), TravelMode.Rail)]);
            List<string> sent = Wire(messages.NewMessages());

            Assert.AreEqual($"{{\"type\":\"clock\",\"steps\":{city.StepClock}}}", sent[^2]);
            StringAssert.StartsWith(sent[^1], "{\"type\":\"trips\"");
        }

        // A city without sprites, whose next step at medium speed runs no phase
        private static Simulation QuietCity()
        {
            return City("suburb", "built", save => save["simulation"]!["speedCycle"] = 0);
        }

        // A player who joins is sent no trips offered before
        [TestMethod]
        public void FullState_TripsOfferedAndNotYetSent_SendsNone()
        {
            CityStateMessages messages = AfterSomeCycles();

            CollectionAssert.DoesNotContain(Types(messages.FullState()), "trips");
            CollectionAssert.Contains(Types(messages.NewMessages()), "trips");
        }

        [TestMethod]
        public void NewMessages_StatusSent_DoesNotSendItAgain()
        {
            CityStateMessages messages = AfterSomeCycles();
            messages.NewMessages();

            CollectionAssert.DoesNotContain(Types(messages.NewMessages()), "status");
        }

        [TestMethod]
        public void FullState_AfterSomeCycles_IsTheWholeMapThenTheRecordsThenTheLatestStatusAndDemand()
        {
            CityStateMessages messages = AfterSomeCycles();
            messages.NewMessages();

            CollectionAssert.AreEqual(
                new[] { "map", "sprites", "date", "population", "evaluation", "budget", "settings", "status", "demand", "clock" },
                Types(messages.FullState()));
        }

        [TestMethod]
        public void FullState_NoStatusOrDemandPublished_EndsAtTheRecords()
        {
            CityStateMessages messages = new CityStateMessages(City("suburb", "run"));

            CollectionAssert.AreEqual(new[] { "map", "sprites", "date", "population", "evaluation", "budget", "settings", "clock" },
                                      Types(messages.FullState()));
        }

        [TestMethod]
        public void NewMessages_EachStep_LeaveTheCityAsItWouldBe()
        {
            Simulation watched = City("disasters", "run", save => save["disasters"]!["disastersEnabled"] = true);
            Simulation alone = City("disasters", "run", save => save["disasters"]!["disastersEnabled"] = true);
            CityStateMessages messages = new CityStateMessages(watched);

            for (int step = 0; step < 8 * 48; step++)
            {
                watched.Step();
                messages.NewMessages();
                messages.FullState();
                alone.Step();
            }

            Assert.AreEqual(StateHash.HashSavedState(alone.Save()), StateHash.HashSavedState(watched.Save()));
        }

        // The messages of a city that has run eight whole cycles since they were built, watched first by what is given
        private static CityStateMessages AfterSomeCycles(Action<Simulation>? watch = null, string fixture = "suburbFast")
        {
            Simulation city = City(fixture, "run");
            CityStateMessages messages = new CityStateMessages(city);
            watch?.Invoke(city);

            for (int step = 0; step < 8 * 16; step++)
            {
                city.Step();
            }

            return messages;
        }

        private static void SetSpeed(Simulation city, Speed speed)
        {
            city.ApplyCommands([new ReceivedCommand("ada", new JsonObject { ["type"] = "setSpeed", ["speed"] = (int)speed })]);
        }

        // Where a message goes in a batch: the tiles, the records, the status, the demand, the events, the step clock, then
        // the trips
        private static int Rank(string type)
        {
            return type switch
            {
                "tiles" => 0,
                "sprites" or "date" or "population" or "evaluation" or "budget" or "settings" => 1,
                "status" => 2,
                "demand" => 3,
                "clock" => 5,
                "trips" => 6,
                _ => 4,
            };
        }

        // The new messages' wire text, each but the step clock, which ends a batch that carries any
        private static List<string> Batch(CityStateMessages messages, Simulation city)
        {
            List<string> sent = Wire(messages.NewMessages());
            Assert.AreEqual($"{{\"type\":\"clock\",\"steps\":{city.StepClock}}}", sent[^1]);
            return sent[..^1];
        }

        private static List<string> Wire(IReadOnlyList<StateMessage> messages)
        {
            return messages.Select(message => ProtocolJson.Serialize(message)).ToList();
        }

        private static List<string> Types(IReadOnlyList<StateMessage> messages)
        {
            return messages.Select(message => message.Type).ToList();
        }
    }
}
