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

using System.Net.WebSockets;
using System.Text.Json.Nodes;
using Micropolis.Rules;
using Microsoft.Extensions.DependencyInjection;

namespace Micropolis.Server.Tests
{
    /// <summary>
    /// The server's cities over the city's socket: starting, joining, one command stream from every player, the same
    /// state for all, and a city saved and unloaded when its last player leaves.
    /// </summary>
    [TestClass]
    public sealed class CitiesTests
    {
        // How long a test waits for what the server does off the request it answers, such as saving a city a player left
        private static readonly TimeSpan ServerWorkTimeout = TimeSpan.FromSeconds(5);

        // Clear land on seed 2026's map, where a road is built
        private const int ClearX = 30;
        private const int ClearY = 30;

        // What a request fails with when the store can't be reached
        private const string StoreFailed = "The server couldn't reach the store it keeps its cities in";

        // What a save past the client address's limit fails with
        private const string TooManySaves = "Too many saves were made from here. Try again in a few seconds.";

        // A tornado's sprite type, as src/spriteConstants.ts numbers it
        private const int Tornado = (int)SpriteType.Tornado;

        [TestMethod]
        public async Task Start_NewCity_SendsTheWholeStateThenAnswersWithItsId()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");

            JsonObject started = (await ada.RequestAsync(id => new StartRequest(id, "Town", 2026, 0)))!.AsObject();

            Assert.IsTrue(CityId.IsOne((string)started["city"]!));
            Assert.AreEqual("Town", (string)started["name"]!);
            Assert.AreEqual(2026u, (uint)started["seed"]!);
            CollectionAssert.AreEqual(new[] { "map", "sprites", "date", "population", "evaluation", "budget", "settings" },
                ada.StateMessages.Select(message => (string)message["type"]!).ToArray());
        }

        [TestMethod]
        public async Task Start_NewCity_KeepsItInTheStore()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");

            string city = await ada.StartAsync();

            Assert.AreEqual(await ada.SavedGameAsync(), await server.StoredAsync(city));
        }

        [TestMethod]
        [DataRow("", "A city's name is 1 to 15 characters long.", DisplayName = "an empty name")]
        [DataRow("Sixteen letters!", "A city's name is 1 to 15 characters long.", DisplayName = "a name too long")]
        [DataRow("Town‮", "A city's name cannot contain control or invisible formatting characters.", DisplayName = "a right-to-left override")]
        public async Task Start_NameBreakingTheRule_FailsSayingWhy(string name, string reason)
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");

            RequestFailedException failed = await Assert.ThrowsExactlyAsync<RequestFailedException>(
                () => ada.RequestAsync(id => new StartRequest(id, name, 2026, 0)));

            Assert.AreEqual(reason, failed.Message);
        }

        // A lone surrogate travels escaped, as JSON.stringify writes one, and the socket's reader keeps it as JSON.parse does
        [TestMethod]
        public async Task Start_NameWithALoneSurrogate_FailsSayingWhy()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");

            RequestFailedException failed = await Assert.ThrowsExactlyAsync<RequestFailedException>(() => ada.RequestTextAsync(
                id => $"{{\"type\":\"start\",\"id\":{id},\"name\":\"Town\\ud800\",\"seed\":2026,\"level\":0}}"));

            Assert.AreEqual("A city's name cannot contain control or invisible formatting characters.", failed.Message);
        }

        [TestMethod]
        public async Task Join_SecondPlayer_GetsTheWholeCityAsItStands()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            await using TestPlayer grace = await TestPlayer.ConnectAsync(server, "Grace");
            string city = await ada.StartAsync();
            await ada.SendAsync(Road(ClearX, ClearY));
            await ada.RequestAsync(id => new TurnRequest(id, 0));

            await grace.JoinAsync(city);

            Assert.AreEqual("ok", (string)ada.CommandResults.Single()["outcome"]!);
            JsonObject map = grace.StateMessages.First();
            Assert.AreEqual("map", (string)map["type"]!);
            Assert.AreEqual(CanonicalJson.Write(SavedTiles(await ada.SavedGameAsync())), CanonicalJson.Write(map["tiles"]));
        }

        [TestMethod]
        public async Task Join_CityThatPublishedItsStatus_SendsTheLatestStatusAndDemandToo()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            await using TestPlayer grace = await TestPlayer.ConnectAsync(server, "Grace");
            string city = await ada.StartAsync();
            await ada.RequestAsync(id => new HoldRequest(id));
            // Two cycles of phases at medium speed, each publishing the demand at its start and the status at its end
            await ada.RequestAsync(id => new AdvanceRequest(id, 96));

            await grace.JoinAsync(city);

            CollectionAssert.AreEqual(
                new[] { "map", "sprites", "date", "population", "evaluation", "budget", "settings", "status", "demand" },
                grace.StateMessages.Select(message => (string)message["type"]!).ToArray());
        }

        // test/sharedCity.ts checks the sprites and the news against what the browser's host sends for the same city
        [TestMethod]
        public async Task Advance_CityWithATornado_SendsItsSpriteAndNewsThatFollowsItAndStepsOn()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            await using TestPlayer grace = await TestPlayer.ConnectAsync(server, "Grace");
            string city = await ada.StartAsync();
            await ada.RequestAsync(id => new HoldRequest(id));
            await ada.SendAsync(new JsonObject { ["type"] = "triggerDisaster", ["kind"] = "tornado" });

            await ada.RequestAsync(id => new AdvanceRequest(id, 1));
            await grace.JoinAsync(city);
            string spritesOnJoining = Sprites(ada.StateMessages.Last(message => (string)message["type"]! == "sprites"));
            JsonObject advanced = (await ada.RequestAsync(id => new AdvanceRequest(id, 600)))!.AsObject();

            Assert.IsNull(advanced["error"]);
            Assert.AreEqual(600L, (long)advanced["steps"]!);
            JsonObject news = ada.StateMessages.First(message =>
                (string)message["type"]! == "news" && message["data"] is JsonObject data && data.ContainsKey("trackable"));
            Assert.AreEqual(Tornado, (int)news["data"]!["sprite"]!);
            Assert.IsTrue(ada.StateMessages.Where(message => (string)message["type"]! == "sprites")
                .Any(message => message["sprites"]!.AsArray().Any(sprite => (int)sprite!["type"]! == Tornado)));
            Assert.AreEqual(spritesOnJoining, Sprites(grace.StateMessages.First(message => (string)message["type"]! == "sprites")));
        }

        [TestMethod]
        public async Task Join_WhileInAnotherCity_LeavesItFirst()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            await using TestPlayer grace = await TestPlayer.ConnectAsync(server, "Grace");
            string first = await ada.StartAsync();
            await grace.JoinAsync(first);
            string second = await grace.StartAsync("Second");

            await ada.JoinAsync(second);
            int batches = ada.Batches.Count;
            await grace.JoinAsync(first);
            await grace.SendAsync(Road(ClearX, ClearY));
            await grace.RequestAsync(id => new FlushRequest(id));
            // Answered after anything the first city sent Ada while Grace's command applied there, which comes first on
            // Ada's connection; the second city, on a clock only the debug channel moves, sends nothing
            await ada.CityTimeAsync();

            Assert.AreEqual("ok", (string)grace.CommandResults.Single()["outcome"]!);
            Assert.AreEqual(batches, ada.Batches.Count);
        }

        [TestMethod]
        public async Task Join_StoredCityThatWontLoad_FailsAndKeepsTheCity()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            await ada.StartAsync();
            string before = await ada.SavedGameAsync();
            string broken = CityId.New();
            await server.Store.WriteAsync(broken, "not a save");

            RequestFailedException failed = await Assert.ThrowsExactlyAsync<RequestFailedException>(() => ada.JoinAsync(broken));

            StringAssert.StartsWith(failed.Message, $"The city with the id {broken} won't load: The save's state is not JSON");
            Assert.AreEqual(before, await ada.SavedGameAsync());
        }

        [TestMethod]
        public async Task Join_NoSuchCity_FailsSayingSo()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync();
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            string missing = CityId.New();

            RequestFailedException failed = await Assert.ThrowsExactlyAsync<RequestFailedException>(() => ada.JoinAsync(missing));

            Assert.AreEqual($"No city has the id {missing}", failed.Message);
        }

        [TestMethod]
        public async Task Join_NotACityId_FailsSayingSo()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync();
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");

            RequestFailedException failed = await Assert.ThrowsExactlyAsync<RequestFailedException>(() => ada.JoinAsync("../secrets"));

            Assert.AreEqual("That is not a city's id", failed.Message);
        }

        [TestMethod]
        public async Task Send_CommandsFromTwoPlayers_ApplyInArrivalOrderAndBothGetTheSameState()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            await using TestPlayer grace = await TestPlayer.ConnectAsync(server, "Grace");
            string city = await ada.StartAsync();
            await ada.RequestAsync(id => new HoldRequest(id));
            await grace.JoinAsync(city);
            int adaBefore = ada.Batches.Count;
            int graceBefore = grace.Batches.Count;
            JsonObject[] sent = [Road(ClearX, ClearY), Road(ClearX + 1, ClearY), new JsonObject { ["type"] = "setAutoBudget", ["on"] = false }];

            // Each command reaches the city before the next is sent: an answered request comes after it
            await ada.SendAsync(sent[0]);
            await ada.CityTimeAsync();
            await grace.SendAsync(sent[1]);
            await grace.CityTimeAsync();
            await ada.SendAsync(sent[2]);
            await ada.RequestAsync(id => new FlushRequest(id));
            await grace.CityTimeAsync();

            string[] players = [ada.Session.PlayerId, grace.Session.PlayerId, ada.Session.PlayerId];
            CollectionAssert.AreEqual(ada.Batches.Skip(adaBefore).ToArray(), grace.Batches.Skip(graceBefore).ToArray());
            CollectionAssert.AreEqual(
                players.Zip(sent, (player, command) => $"{player} {CanonicalJson.Write(command)} ok").ToArray(),
                ada.CommandResults.Select(result => $"{(string)result["player"]!} {CanonicalJson.Write(result["command"])} {(string)result["outcome"]!}").ToArray());
            CollectionAssert.AreEqual(players,
                (await grace.CommandLogAsync())["entries"]!.AsArray().Select(entry => (string)entry!["player"]!).ToArray());
        }

        [TestMethod]
        public async Task Send_DeepestCommandAllowed_IsRejectedAndEchoedToEveryPlayer()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            await ada.StartAsync();

            await ada.Socket.SendAsync(new CommandMessage(Nested(CommandReader.MaxCommandDepth)));
            await ada.RequestAsync(id => new FlushRequest(id));

            JsonObject result = ada.CommandResults.Single();
            Assert.AreEqual("rejected", (string)result["outcome"]!);
            Assert.AreEqual(CanonicalJson.Write(Nested(CommandReader.MaxCommandDepth)), CanonicalJson.Write(result["command"]));
        }

        // JSON.parse reads a lone surrogate, which System.Text.Json's writer would turn into U+FFFD
        [TestMethod]
        public async Task Send_CommandHoldingALoneSurrogate_IsEchoedAndLoggedAsItArrived()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            await ada.StartAsync();

            await ada.Socket.SendTextAsync("{\"type\":\"command\",\"command\":{\"type\":\"\\ud800\"}}");
            await ada.RequestAsync(id => new FlushRequest(id));
            // The log as the wire carries it, which nothing else is waiting to come before
            await ada.Socket.SendAsync(new CommandLogRequest(99));
            string log = await ada.Socket.ReceiveTextAsync();

            StringAssert.Contains(ada.Batches.Last(), "\"command\":{\"type\":\"\\ud800\"}");
            StringAssert.Contains(log, "\"command\":{\"type\":\"\\ud800\"}");
        }

        [TestMethod]
        public async Task Send_CommandDeeperThanAnyCommand_ClosesTheConnection()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            await ada.StartAsync();

            await ada.Socket.SendAsync(new CommandMessage(Nested(CommandReader.MaxCommandDepth + 1)));

            Assert.AreEqual(WebSocketCloseStatus.PolicyViolation, await ada.Socket.ReceiveCloseAsync());
        }

        [TestMethod]
        public async Task Send_CommandLongerThanAnyCommand_ClosesTheConnection()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            await ada.StartAsync();
            int maxLength = CommandReader.MaxCommandLength(MapGenerator.MapWidth, MapGenerator.MapHeight);

            await ada.Socket.SendAsync(new CommandMessage(new JsonObject { ["type"] = new string('x', maxLength) }));

            Assert.AreEqual(WebSocketCloseStatus.PolicyViolation, await ada.Socket.ReceiveCloseAsync());
        }

        [TestMethod]
        public async Task Leave_LastPlayer_SavesAndUnloadsTheCityWhichAJoinLoadsAgain()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            string city;
            string saved;

            await using (TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada"))
            {
                city = await ada.StartAsync();
                await ada.SendAsync(Road(ClearX, ClearY));
                await PlaySecondAsync(ada);
                saved = await ada.SavedGameAsync();
                await ada.Socket.CloseAsync();
            }

            await WaitForStoreAsync(server, city, saved);
            await using TestPlayer grace = await TestPlayer.ConnectAsync(server, "Grace");
            await grace.JoinAsync(city);

            Assert.AreEqual(saved, await grace.SavedGameAsync());
            // A city loaded again starts a new log, from its saved state, which a city that stayed loaded wouldn't
            JsonObject log = await grace.CommandLogAsync();
            Assert.AreEqual(0, log["entries"]!.AsArray().Count);
            Assert.IsTrue(log.ContainsKey("save"));
        }

        [TestMethod]
        public async Task Stop_Server_KeepsItsCitiesForTheNextToLoad()
        {
            string database = TestCityDatabase.NewFile();

            try
            {
                string city;
                string saved;

                await using (ServerUnderTest first = await ServerUnderTest.StartAsync(manualClock: true, database: database))
                {
                    await using TestPlayer ada = await TestPlayer.ConnectAsync(first, "Ada");
                    city = await ada.StartAsync();
                    await PlaySecondAsync(ada);
                    saved = await ada.SavedGameAsync();
                }

                await using ServerUnderTest second = await ServerUnderTest.StartAsync(manualClock: true, database: database);
                await using TestPlayer grace = await TestPlayer.ConnectAsync(second, "Grace");
                await grace.JoinAsync(city);

                Assert.AreEqual(saved, await grace.SavedGameAsync());
            }
            finally
            {
                TestCityDatabase.Delete(database);
            }
        }

        [TestMethod]
        public async Task Turn_ServerClock_StepsTheCityAsTimePasses()
        {
            ServerUnderTest.RequireDebugChannel();
            await using ServerUnderTest server = await ServerUnderTest.StartAsync();
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            await ada.StartAsync();
            int before = ada.Batches.Count;

            // The clock's moving queues the turns it makes due before the move returns, and a request after them
            // answers once they are done. The first turn starts the step driver's clock; the second takes a second's
            // steps, 60, in which a new city's time advances at steps 3 and 51 at medium speed.
            server.Time.Advance(TimerTicker.FrameInterval);
            Assert.AreEqual(0, await ada.CityTimeAsync());
            server.Time.Advance(TimeSpan.FromSeconds(1));

            Assert.AreEqual(2, await ada.CityTimeAsync());
            Assert.AreEqual(1, ada.Batches.Count - before);
        }

        [TestMethod]
        public async Task StartAndUpload_StoreThatCantKeepTheCity_FailSayingSoAndKeepTheCity()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            await ada.StartAsync();
            string before = await ada.SavedGameAsync();
            TestCityDatabase.MakeReadOnly(server.Database);

            RequestFailedException started = await Assert.ThrowsExactlyAsync<RequestFailedException>(() => ada.StartAsync());
            RequestFailedException uploaded = await Assert.ThrowsExactlyAsync<RequestFailedException>(
                () => ada.RequestAsync(id => new UploadRequest(id, before)));

            Assert.AreEqual(StoreFailed, started.Message);
            Assert.AreEqual(StoreFailed, uploaded.Message);
            Assert.AreEqual(before, await ada.SavedGameAsync());
        }

        [TestMethod]
        public async Task Save_CityChangedSinceItStarted_KeepsItInTheStore()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            string city = await ada.StartAsync();
            string? started = await server.StoredAsync(city);
            await PlaySecondAsync(ada);

            await ada.SaveAsync();

            string saved = await ada.SavedGameAsync();
            Assert.AreNotEqual(started, saved, "The city didn't change from its start");
            Assert.AreEqual(saved, await server.StoredAsync(city));
        }

        [TestMethod]
        public async Task Save_StoreThatCantKeepTheCity_FailsSayingSoAndKeepsTheCityLoaded()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            string city = await ada.StartAsync();
            await PlaySecondAsync(ada);
            TestCityDatabase.MakeReadOnly(server.Database);

            RequestFailedException failed = await Assert.ThrowsExactlyAsync<RequestFailedException>(() => ada.SaveAsync());

            Assert.AreEqual(StoreFailed, failed.Message);
            // The city plays on, and the next save keeps it once the store can
            await PlaySecondAsync(ada);
            TestCityDatabase.MakeWritable(server.Database);
            await ada.SaveAsync();
            Assert.AreEqual(await ada.SavedGameAsync(), await server.StoredAsync(city));
        }

        [TestMethod]
        public async Task Save_MoreThanAnAddressMay_FailsSayingSoAndKeepsTheConnection()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            await using TestPlayer grace = await TestPlayer.ConnectAsync(server, "Grace");
            string city = await ada.StartAsync();
            await grace.JoinAsync(city);

            for (int i = 0; i < CityLimits.SaveBurst; i++)
            {
                await ada.SaveAsync();
            }

            await PlaySecondAsync(ada);
            // Another player from the same address shares its limit
            RequestFailedException failed = await Assert.ThrowsExactlyAsync<RequestFailedException>(() => grace.SaveAsync());

            Assert.AreEqual(TooManySaves, failed.Message);
            Assert.AreNotEqual(await grace.SavedGameAsync(), await server.StoredAsync(city));
            // Still connected, and still in the city
            await PlaySecondAsync(grace);
        }

        [TestMethod]
        public async Task Join_StoredCityTheStoreCantRead_FailsSayingSo()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            string city;
            string saved;

            await using (TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada"))
            {
                city = await ada.StartAsync();
                // Changed from its start, so the store holds the save of its leaving once that is kept
                await PlaySecondAsync(ada);
                saved = await ada.SavedGameAsync();
                await ada.Socket.CloseAsync();
            }

            await WaitForStoreAsync(server, city, saved);
            TestCityDatabase.MakeUnreadable(server.Database);
            await using TestPlayer grace = await TestPlayer.ConnectAsync(server, "Grace");

            RequestFailedException failed = await Assert.ThrowsExactlyAsync<RequestFailedException>(() => grace.JoinAsync(city));

            Assert.AreEqual(StoreFailed, failed.Message);
        }

        // A city whose work fails stops before the registry hears of it, so a join may find it listed but stopped
        [TestMethod]
        public async Task Join_CityThatStoppedAsItIsJoined_FailsAndLeavesTheConnectionInNoCity()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            await using TestPlayer grace = await TestPlayer.ConnectAsync(server, "Grace");
            await ada.StartAsync();
            string city = await grace.StartAsync("Stopping");
            // Counted in, so the registry keeps it listed while it stops
            LoadedCity stopping = (await server.App.Services.GetRequiredService<CityRegistry>().EnterAsync(city, held: false))!;
            await stopping.StopAsync();

            RequestFailedException failed = await Assert.ThrowsExactlyAsync<RequestFailedException>(() => ada.JoinAsync(city));
            RequestFailedException inNoCity = await Assert.ThrowsExactlyAsync<RequestFailedException>(() => ada.SavedGameAsync());

            Assert.AreEqual("The city failed", failed.Message);
            Assert.AreEqual("No city has started", inNoCity.Message);
        }

        [TestMethod]
        public async Task Start_MoreCitiesThanAnAddressMay_FailsSayingSo()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");

            for (int i = 0; i < CityLimits.CitiesPerWindow; i++)
            {
                await ada.StartAsync();
            }

            RequestFailedException failed = await Assert.ThrowsExactlyAsync<RequestFailedException>(() => ada.StartAsync());

            Assert.AreEqual("Too many cities were started from here. Try again in a few minutes.", failed.Message);
        }

        [TestMethod]
        public async Task Send_CommandsFasterThanAPlayerSendsThem_ClosesTheConnection()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            await ada.StartAsync();
            // No command, but as long as one may be: three are past what one client address may send at once
            JsonObject padded = new JsonObject { ["type"] = "padded", ["pad"] = new string('a', CityLimits.CommandBurstCharacters * 2 / 5) };

            for (int i = 0; i < 3; i++)
            {
                await ada.SendAsync(padded);
            }

            Assert.AreEqual(WebSocketCloseStatus.PolicyViolation, await ada.Socket.ReceiveCloseAsync());
        }

        [TestMethod]
        public async Task Upload_NotASave_FailsAndKeepsTheCity()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            await ada.StartAsync();
            string before = await ada.SavedGameAsync();

            RequestFailedException failed = await Assert.ThrowsExactlyAsync<RequestFailedException>(
                () => ada.RequestAsync(id => new UploadRequest(id, "not a save")));

            StringAssert.StartsWith(failed.Message, "The save's state is not JSON");
            Assert.AreEqual(before, await ada.SavedGameAsync());
        }

        [TestMethod]
        [DataRow(null, "The save's name must be a string.", DisplayName = "no name")]
        [DataRow("Sixteen letters!", "A city's name is 1 to 15 characters long.", DisplayName = "a name too long")]
        public async Task Upload_SaveWhoseNameBreaksTheRule_FailsSayingWhy(string? name, string reason)
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            await ada.StartAsync();
            JsonObject save = JsonNode.Parse(await ada.SavedGameAsync())!.AsObject();
            save.Remove("name");

            if (name is not null)
            {
                save["name"] = name;
            }

            RequestFailedException failed = await Assert.ThrowsExactlyAsync<RequestFailedException>(
                () => ada.RequestAsync(id => new UploadRequest(id, save.ToJsonString())));

            Assert.AreEqual(reason, failed.Message);
        }

        [TestMethod]
        public async Task Upload_Save_StartsTheCityItHoldsUnderANewId()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            string first = await ada.StartAsync("Saved");
            await ada.SendAsync(Road(ClearX, ClearY));
            await ada.RequestAsync(id => new TurnRequest(id, 1000));
            string saved = await ada.SavedGameAsync();

            JsonObject started = (await ada.RequestAsync(id => new UploadRequest(id, saved)))!.AsObject();

            Assert.AreNotEqual(first, (string)started["city"]!);
            Assert.AreEqual("Saved", (string)started["name"]!);
            Assert.AreEqual(saved, await ada.SavedGameAsync());
        }

        [TestMethod]
        public async Task Query_BeforeAnyCity_AnswersOnlyAMapPreview()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync();
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");

            JsonObject preview = await ada.AskAsync(new JsonObject { ["type"] = "mapPreview", ["seed"] = 2026 });
            JsonObject report = await ada.AskAsync(new JsonObject { ["type"] = "tileReport", ["x"] = 1, ["y"] = 1 });

            Assert.AreEqual("mapPreview", (string)preview["type"]!);
            Assert.AreEqual("no city has started", (string)report["reason"]!);
        }

        [TestMethod]
        public async Task Query_InACity_AnswersFromIt()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            await ada.StartAsync();
            await ada.SendAsync(Road(ClearX, ClearY));
            await ada.RequestAsync(id => new FlushRequest(id));

            JsonObject report = await ada.AskAsync(new JsonObject { ["type"] = "tileReport", ["x"] = ClearX, ["y"] = ClearY });

            Assert.AreEqual("tileReport", (string)report["type"]!);
            Assert.AreEqual("ROAD", (string)report["category"]!);
        }

        [TestMethod]
        public async Task Command_BeforeJoiningACity_ClosesTheConnection()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync();
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");

            await ada.SendAsync(Road(ClearX, ClearY));

            Assert.AreEqual(WebSocketCloseStatus.PolicyViolation, await ada.Socket.ReceiveCloseAsync());
        }

        [TestMethod]
        [DataRow("not JSON", DisplayName = "text that isn't JSON")]
        [DataRow("{\"type\":\"hello\",\"you\":\"a\",\"players\":[]}", DisplayName = "a message no player sends")]
        [DataRow("{\"type\":\"save\"}", DisplayName = "a request without its id")]
        [DataRow("{\"type\":\"save\",\"id\":0.5}", DisplayName = "an id that isn't whole")]
        [DataRow("{\"type\":\"save\",\"id\":1,\"extra\":true}", DisplayName = "a field the message doesn't have")]
        public async Task Receive_NotAMessage_ClosesTheConnection(string text)
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync();
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");

            await ada.Socket.SendTextAsync(text);

            Assert.AreEqual(WebSocketCloseStatus.PolicyViolation, await ada.Socket.ReceiveCloseAsync());
        }

        [TestMethod]
        public async Task Receive_CommandAfterTheConnectionCloses_NeverReachesTheCity()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            await using TestPlayer grace = await TestPlayer.ConnectAsync(server, "Grace");
            string city = await ada.StartAsync();
            await grace.JoinAsync(city);

            // A binary message closes the connection, which then reads nothing more of what the client sends
            await ada.Socket.SendBinaryAsync([1]);
            await ada.SendAsync(Road(ClearX, ClearY));
            await ada.Socket.ReceiveCloseAsync();
            // Ada goes offline once the server has stopped reading her connection: anything it read went to the city
            PlayersMessage left = await grace.Socket.ReceiveAsync<PlayersMessage>();
            await grace.RequestAsync(id => new FlushRequest(id));

            CollectionAssert.DoesNotContain(left.Players.Select(player => player.Name).ToList(), "Ada");

            Assert.AreEqual(0, grace.CommandResults.Count());
        }

        [TestMethod]
        public async Task Advance_DriverNotHeld_FailsSayingSo()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            await ada.StartAsync();

            JsonObject unheld = (await ada.RequestAsync(id => new AdvanceRequest(id, 1)))!.AsObject();

            Assert.AreEqual("Advance needs the driver held, or the driver's steps would land at times of its own", (string)unheld["error"]!);
            Assert.AreEqual(0, (long)unheld["steps"]!);
        }

        [TestMethod]
        [DataRow(0.5, "0.5", DisplayName = "a fraction")]
        [DataRow(-1.0, "-1", DisplayName = "a negative number")]
        public async Task Advance_StepsNotWhole_FailsSayingSoAndTakesNone(double steps, string written)
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            await ada.StartAsync();
            await ada.RequestAsync(id => new HoldRequest(id));

            JsonObject refused = (await ada.RequestAsync(id => new AdvanceRequest(id, steps)))!.AsObject();

            Assert.AreEqual($"Steps are taken in whole numbers from 0, got {written}", (string)refused["error"]!);
            Assert.AreEqual(0, (long)refused["steps"]!);
        }

        [TestMethod]
        public async Task Advance_DriverHeld_TakesExactlyTheStepsAsked()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            await ada.StartAsync();
            await ada.RequestAsync(id => new HoldRequest(id));

            JsonObject advanced = (await ada.RequestAsync(id => new AdvanceRequest(id, 96)))!.AsObject();

            Assert.AreEqual(96, (long)advanced["steps"]!);
            Assert.IsNull(advanced["error"]);
            Assert.AreEqual(96, (long)(await ada.CommandLogAsync())["checkpoints"]!.AsArray().Last()!["step"]!);
        }

        [TestMethod]
        public async Task Hold_BeforeAnyCity_HoldsTheCityItStartsFromItsFirstStep()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");

            await ada.RequestAsync(id => new HoldRequest(id));
            await ada.StartAsync();
            await PlaySecondAsync(ada);

            Assert.AreEqual(0, await ada.CityTimeAsync());
        }

        [TestMethod]
        public async Task Turn_CityOnTheServersClock_Fails()
        {
            ServerUnderTest.RequireDebugChannel();
            await using ServerUnderTest server = await ServerUnderTest.StartAsync();
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            await ada.StartAsync();

            RequestFailedException failed = await Assert.ThrowsExactlyAsync<RequestFailedException>(
                () => ada.RequestAsync(id => new TurnRequest(id, 1000)));

            Assert.AreEqual("The city runs on the server's clock", failed.Message);
        }

        [TestMethod]
        [DataRow("save", DisplayName = "save")]
        [DataRow("commandLog", DisplayName = "commandLog")]
        [DataRow("flush", DisplayName = "flush")]
        [DataRow("advance", DisplayName = "advance")]
        [DataRow("cityTime", DisplayName = "cityTime")]
        [DataRow("turn", DisplayName = "turn")]
        [DataRow("savedGame", DisplayName = "savedGame")]
        public async Task Request_BeforeAnyCity_FailsSayingSo(string type)
        {
            ServerUnderTest.RequireDebugChannel();
            await using ServerUnderTest server = await ServerUnderTest.StartAsync();
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");

            RequestFailedException failed = await Assert.ThrowsExactlyAsync<RequestFailedException>(() => ada.RequestAsync(id => type switch
            {
                "save" => new SaveRequest(id),
                "commandLog" => new CommandLogRequest(id),
                "flush" => new FlushRequest(id),
                "advance" => new AdvanceRequest(id, 1),
                "cityTime" => new CityTimeRequest(id),
                "turn" => new TurnRequest(id, 1),
                "savedGame" => new SavedGameRequest(id),
                _ => throw new ArgumentException(type),
            }));

            Assert.AreEqual("No city has started", failed.Message);
        }

        [TestMethod]
        [TestCategory(ReleaseBuild.Category)]
        public async Task Debug_ReleaseBuild_FailsSayingSo()
        {
            if (DebugChannel.IsBuiltIn)
            {
                Assert.Inconclusive("A Debug build answers the debug channel.");
            }

            await using ServerUnderTest server = await ServerUnderTest.StartAsync();
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");

            RequestFailedException failed = await Assert.ThrowsExactlyAsync<RequestFailedException>(() => ada.RequestAsync(id => new HoldRequest(id)));

            Assert.AreEqual("This server has no debug channel", failed.Message);
        }

        // A second of play on the server's manual clock. The first turn only starts the city's step driver, which owes
        // nothing until it has a time to count from; the second takes a second's steps.
        private static async Task PlaySecondAsync(TestPlayer player)
        {
            await player.RequestAsync(id => new TurnRequest(id, 1000));
            await player.RequestAsync(id => new TurnRequest(id, 1000));
        }

        private static string Sprites(JsonObject message)
        {
            return message["sprites"]!.ToJsonString();
        }

        private static JsonObject Road(int x, int y)
        {
            return new JsonObject
            {
                ["type"] = "tool",
                ["tool"] = "road",
                ["path"] = new JsonArray(new JsonObject { ["x"] = x, ["y"] = y }),
                ["autoBulldoze"] = true,
            };
        }

        // Lists nested this deep, the outermost the first
        private static JsonNode Nested(int depth)
        {
            JsonArray innermost = new JsonArray();
            JsonNode nested = innermost;

            for (int i = 1; i < depth; i++)
            {
                nested = new JsonArray(nested);
            }

            return nested;
        }

        private static JsonNode SavedTiles(string savedGame)
        {
            return JsonNode.Parse(savedGame)!["map"]!["tiles"]!;
        }

        // Waits until the store holds the city's save, which the server writes as the last player leaves
        private static async Task WaitForStoreAsync(ServerUnderTest server, string city, string saved)
        {
            DateTime giveUp = DateTime.UtcNow + ServerWorkTimeout;

            while (await server.StoredAsync(city) != saved)
            {
                if (DateTime.UtcNow > giveUp)
                {
                    Assert.Fail($"The store didn't hold the city's save within {ServerWorkTimeout}.");
                }

                await Task.Delay(20);
            }
        }
    }
}
