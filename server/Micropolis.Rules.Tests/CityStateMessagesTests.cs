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
                            Wire(messages.NewMessages()).Single());
            Assert.IsEmpty(messages.NewMessages());
        }

        [TestMethod]
        public void NewMessages_Sprite_SendsItWhereTheClientDrawsIt()
        {
            Simulation city = City("suburb", "run");
            CityStateMessages messages = new CityStateMessages(city);

            Sprite train = city.SpriteManager.MakeSprite(SpriteType.Train, 100, 200);

            // A train is drawn 32 wide, 32 right of and 16 above its position
            Assert.AreEqual($$"""{"type":"sprites","sprites":[{"type":{{(int)SpriteType.Train}},"frame":{{train.Frame}},"x":132,"y":184,"width":32}]}""",
                            Wire(messages.NewMessages()).Single());
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
                Wire(messages.NewMessages()));
        }

        [TestMethod]
        public void NewMessages_RecordChanged_SendsItOnceBeforeTheEvents()
        {
            Simulation city = City("suburb", "run");
            CityStateMessages messages = new CityStateMessages(city);

            SetSpeed(city, Speed.Fast);

            CollectionAssert.AreEqual(new[] { "settings", "commandResult" }, Types(messages.NewMessages()));
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

            CollectionAssert.AreEqual(new[] { "tiles", "settings", "news", "commandResult", "budgetReviewDue" },
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
        public void NewMessages_TripsOffered_SendsThemOnceLastInTheOrderOffered()
        {
            List<IReadOnlyList<TilePosition>> offered = new List<IReadOnlyList<TilePosition>>();
            CityStateMessages messages = AfterSomeCycles(city => city.Trips.Offered += offered.Add);

            IReadOnlyList<StateMessage> sent = messages.NewMessages();

            Assert.IsGreaterThan(1, offered.Count, "Too few trips offered to check.");
            Assert.AreEqual(ProtocolJson.Serialize(new TripsMessage(offered)), ProtocolJson.Serialize(sent[^1]));
            Assert.AreEqual(1, Types(sent).Count(type => type == "trips"));
            CollectionAssert.DoesNotContain(Types(messages.NewMessages()), "trips");
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
                new[] { "map", "sprites", "date", "population", "evaluation", "budget", "settings", "status", "demand" },
                Types(messages.FullState()));
        }

        [TestMethod]
        public void FullState_NoStatusOrDemandPublished_EndsAtTheRecords()
        {
            CityStateMessages messages = new CityStateMessages(City("suburb", "run"));

            CollectionAssert.AreEqual(new[] { "map", "sprites", "date", "population", "evaluation", "budget", "settings" },
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
        private static CityStateMessages AfterSomeCycles(Action<Simulation>? watch = null)
        {
            Simulation city = City("suburbFast", "run");
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

        // Where a message goes in a batch: the tiles, the records, the status, the demand, the events, then the trips
        private static int Rank(string type)
        {
            return type switch
            {
                "tiles" => 0,
                "sprites" or "date" or "population" or "evaluation" or "budget" or "settings" => 1,
                "status" => 2,
                "demand" => 3,
                "trips" => 5,
                _ => 4,
            };
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
