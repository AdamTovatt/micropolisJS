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

using Micropolis.Rules;

namespace Micropolis.Server.Tests
{
    /// <summary>
    /// The players' hover boxes, which the server passes on to the city's other players and to nothing else, as
    /// protocol/README.md describes them.
    /// </summary>
    [TestClass]
    public sealed class CursorsTests
    {
        private const int Width = MapGenerator.MapWidth;
        private const int Height = MapGenerator.MapHeight;

        private static readonly Cursor Road = new Cursor(CursorTool.Road, 30, 30, 1);
        private static readonly Cursor Rail = new Cursor(CursorTool.Rail, 40, 40, 1);

        [TestMethod]
        public async Task PassOn_BoxFromOnePlayer_ReachesTheOthersInTheCityAndNotItsSender()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            await using TestPlayer grace = await TestPlayer.ConnectAsync(server, "Grace");
            await using TestPlayer bo = await TestPlayer.ConnectAsync(server, "Bo");
            string city = await ada.StartAsync();
            await grace.JoinAsync(city);
            await bo.JoinAsync(city);

            await ada.ReportCursorAsync(Road);
            await ada.ReportCursorAsync(null);
            await SettleAsync(ada, grace, bo);

            string[] passedOn = [Wire(ada, Road), Wire(ada, null)];
            CollectionAssert.AreEqual(passedOn, grace.Cursors);
            CollectionAssert.AreEqual(passedOn, bo.Cursors);
            Assert.IsEmpty(ada.Cursors);
        }

        [TestMethod]
        public async Task PassOn_BoxInAnotherCity_ReachesNoOneHere()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");
            await using TestPlayer grace = await TestPlayer.ConnectAsync(server, "Grace");
            await ada.StartAsync();
            await grace.StartAsync();

            await ada.ReportCursorAsync(Road);
            await SettleAsync(ada, grace);

            Assert.IsEmpty(grace.Cursors);
        }

        [TestMethod]
        public async Task PassOn_BoxesAtTheEdgesOfTheMap_ArePassedOn()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using InOneCity players = await InOneCity.StartAsync(server);
            Cursor first = new Cursor(CursorTool.Query, 0, 0, 1);
            Cursor last = new Cursor(CursorTool.Airport, Width - 1, Height - 1, CursorBounds.SizeOf(CursorTool.Airport));

            await players.Ada.ReportCursorAsync(first);
            await players.Ada.ReportCursorAsync(last);
            await players.SettleAsync();

            CollectionAssert.AreEqual(new[] { Wire(players.Ada, first), Wire(players.Ada, last) }, players.Grace.Cursors);
        }

        [TestMethod]
        [DataRow(-1, 30, 1, DisplayName = "west of the map")]
        [DataRow(Width, 30, 1, DisplayName = "east of the map")]
        [DataRow(30, -1, 1, DisplayName = "north of the map")]
        [DataRow(30, Height, 1, DisplayName = "south of the map")]
        [DataRow(30, 30, 3, DisplayName = "a zone's size for a road")]
        public async Task PassOn_BoxNoToolMakes_IsDroppedAndTheConnectionKept(int x, int y, int size)
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using InOneCity players = await InOneCity.StartAsync(server);

            await players.Ada.ReportCursorAsync(new Cursor(CursorTool.Road, x, y, size));
            await players.Ada.ReportCursorAsync(Road);
            await players.SettleAsync();

            CollectionAssert.AreEqual(new[] { Wire(players.Ada, Road) }, players.Grace.Cursors);
        }

        [TestMethod]
        public async Task PassOn_BeforeJoiningACity_IsDroppedAndTheConnectionKept()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");

            await ada.ReportCursorAsync(Road);

            Assert.IsTrue(CityId.IsOne(await ada.StartAsync()));
        }

        [TestMethod]
        public async Task PassOn_NullForABoxNotShowing_PassesOnNothing()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using InOneCity players = await InOneCity.StartAsync(server);

            await players.Ada.ReportCursorAsync(null);
            await players.Ada.ReportCursorAsync(Road);
            await players.Ada.ReportCursorAsync(null);
            await players.Ada.ReportCursorAsync(null);
            await players.SettleAsync();

            CollectionAssert.AreEqual(new[] { Wire(players.Ada, Road), Wire(players.Ada, null) }, players.Grace.Cursors);
        }

        [TestMethod]
        public async Task PassOn_MoreInASecondThanTheLimit_DropsTheRestUntilASecondHasPassed()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using InOneCity players = await InOneCity.StartAsync(server);
            Cursor[] boxes = Boxes(CursorLimit.PerSecond + 2);

            await ReportAllAsync(players.Ada, boxes);
            await players.SettleAsync();
            server.Time.Advance(TimeSpan.FromSeconds(1));
            await players.Ada.ReportCursorAsync(Road);
            await players.SettleAsync();

            CollectionAssert.AreEqual(Wires(players.Ada, boxes.Take(CursorLimit.PerSecond).Append(Road)), players.Grace.Cursors);
        }

        [TestMethod]
        public async Task PassOn_BoxesDroppedForNotFitting_DontCountTowardTheLimit()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using InOneCity players = await InOneCity.StartAsync(server);
            Cursor[] boxes = Boxes(CursorLimit.PerSecond);

            await ReportAllAsync(players.Ada, Enumerable.Repeat(new Cursor(CursorTool.Road, Width, 0, 1), CursorLimit.PerSecond));
            await ReportAllAsync(players.Ada, boxes);
            await players.SettleAsync();

            CollectionAssert.AreEqual(Wires(players.Ada, boxes), players.Grace.Cursors);
        }

        [TestMethod]
        public async Task PassOn_FromEachOfAPlayersConnections_IsLimitedPerConnection()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using InOneCity players = await InOneCity.StartAsync(server);
            await using TestPlayer adasOtherTab = await players.Ada.ConnectAgainAsync(server);
            await adasOtherTab.JoinAsync(players.City);
            Cursor[] boxes = Boxes(CursorLimit.PerSecond);

            await ReportAllAsync(players.Ada, boxes);
            await SettleAsync(players.Ada);
            await ReportAllAsync(adasOtherTab, boxes);
            await SettleAsync(adasOtherTab, players.Grace);

            CollectionAssert.AreEqual(Wires(players.Ada, boxes.Concat(boxes)), players.Grace.Cursors);
        }

        [TestMethod]
        public async Task PassOn_BoxFromAnotherOfThePlayersConnections_IsNotSentToThem()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using InOneCity players = await InOneCity.StartAsync(server);
            await using TestPlayer adasOtherTab = await players.Ada.ConnectAgainAsync(server);
            await adasOtherTab.JoinAsync(players.City);

            await players.Ada.ReportCursorAsync(Road);
            await SettleAsync(players.Ada, adasOtherTab, players.Grace);

            Assert.IsEmpty(adasOtherTab.Cursors);
            CollectionAssert.AreEqual(new[] { Wire(players.Ada, Road) }, players.Grace.Cursors);
        }

        [TestMethod]
        public async Task PassOn_NullWhileAnotherOfThePlayersConnectionsShowsABox_PassesOnThatBox()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using InOneCity players = await InOneCity.StartAsync(server);
            await using TestPlayer adasOtherTab = await players.Ada.ConnectAgainAsync(server);
            await adasOtherTab.JoinAsync(players.City);

            await adasOtherTab.ReportCursorAsync(Rail);
            await SettleAsync(adasOtherTab);
            await players.Ada.ReportCursorAsync(Road);
            await players.Ada.ReportCursorAsync(null);
            await SettleAsync(players.Ada, players.Grace);

            CollectionAssert.AreEqual(new[] { Wire(players.Ada, Rail), Wire(players.Ada, Road), Wire(players.Ada, Rail) }, players.Grace.Cursors);
        }

        [TestMethod]
        public async Task Leave_WhileAnotherOfThePlayersConnectionsShowsABox_PassesOnThatBox()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using InOneCity players = await InOneCity.StartAsync(server);
            await using TestPlayer adasOtherTab = await players.Ada.ConnectAgainAsync(server);
            await adasOtherTab.JoinAsync(players.City);

            await adasOtherTab.ReportCursorAsync(Rail);
            await SettleAsync(adasOtherTab);
            await players.Ada.ReportCursorAsync(Road);
            await players.Ada.StartAsync();
            await SettleAsync(players.Grace);

            CollectionAssert.AreEqual(new[] { Wire(players.Ada, Rail), Wire(players.Ada, Road), Wire(players.Ada, Rail) }, players.Grace.Cursors);
        }

        [TestMethod]
        public async Task Leave_ForAnotherCityWithABoxShowing_PassesOnNullForIt()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using InOneCity players = await InOneCity.StartAsync(server);

            await players.Ada.ReportCursorAsync(Road);
            await players.Ada.StartAsync();
            await SettleAsync(players.Grace);

            CollectionAssert.AreEqual(new[] { Wire(players.Ada, Road), Wire(players.Ada, null) }, players.Grace.Cursors);
        }

        [TestMethod]
        public async Task Leave_ForAnotherCityWithNoBoxShowing_PassesOnNothing()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using InOneCity players = await InOneCity.StartAsync(server);

            await players.Ada.ReportCursorAsync(Road);
            await players.Ada.ReportCursorAsync(null);
            await players.Ada.StartAsync();
            await SettleAsync(players.Grace);

            CollectionAssert.AreEqual(new[] { Wire(players.Ada, Road), Wire(players.Ada, null) }, players.Grace.Cursors);
        }

        [TestMethod]
        public async Task Leave_ConnectionClosingWithABoxShowing_PassesOnNullForIt()
        {
            await using ServerUnderTest server = await ServerUnderTest.StartAsync(manualClock: true);
            await using InOneCity players = await InOneCity.StartAsync(server);
            string adaId = players.Ada.Session.PlayerId;

            await players.Ada.ReportCursorAsync(Road);
            await players.Ada.CityTimeAsync();
            // The fixture disposes Ada again, which does nothing more
            await players.Ada.DisposeAsync();

            // The players message that Ada went offline may come before or after
            string? text = null;
            while (text is null || ProtocolJson.DeserializeServerMessage(text) is not CursorMessage { Cursor: null })
            {
                text = await players.Grace.Socket.ReceiveTextAsync();
            }

            Assert.AreEqual(ProtocolJson.Serialize(new CursorMessage(adaId, null)), text);
        }

        // Each player's request is answered after what the city did before it, and each player's hover boxes are passed
        // on before the city takes the player's next request, so once each has been answered in turn, every box sent
        // before has reached every player
        private static async Task SettleAsync(params TestPlayer[] players)
        {
            foreach (TestPlayer player in players)
            {
                await player.CityTimeAsync();
            }
        }

        // Road boxes along the map's first row, each different from the last
        private static Cursor[] Boxes(int count)
        {
            return Enumerable.Range(0, count).Select(x => new Cursor(CursorTool.Road, x, 0, 1)).ToArray();
        }

        private static async Task ReportAllAsync(TestPlayer player, IEnumerable<Cursor> boxes)
        {
            foreach (Cursor box in boxes)
            {
                await player.ReportCursorAsync(box);
            }
        }

        private static string Wire(TestPlayer from, Cursor? cursor)
        {
            return ProtocolJson.Serialize(new CursorMessage(from.Session.PlayerId, cursor));
        }

        private static string[] Wires(TestPlayer from, IEnumerable<Cursor> boxes)
        {
            return boxes.Select(box => Wire(from, box)).ToArray();
        }

        // Ada, who started a city, and Grace, who joined it, each disposed with the fixture, or as soon as starting it
        // fails
        private sealed class InOneCity : IAsyncDisposable
        {
            private InOneCity(TestPlayer ada, TestPlayer grace, string city)
            {
                Ada = ada;
                Grace = grace;
                City = city;
            }

            public TestPlayer Ada { get; }

            public TestPlayer Grace { get; }

            public string City { get; }

            public static async Task<InOneCity> StartAsync(ServerUnderTest server)
            {
                TestPlayer ada = await TestPlayer.ConnectAsync(server, "Ada");

                try
                {
                    TestPlayer grace = await TestPlayer.ConnectAsync(server, "Grace");

                    try
                    {
                        string city = await ada.StartAsync();
                        await grace.JoinAsync(city);
                        return new InOneCity(ada, grace, city);
                    }
                    catch
                    {
                        await grace.DisposeAsync();
                        throw;
                    }
                }
                catch
                {
                    await ada.DisposeAsync();
                    throw;
                }
            }

            public Task SettleAsync()
            {
                return CursorsTests.SettleAsync(Ada, Grace);
            }

            public async ValueTask DisposeAsync()
            {
                await Ada.DisposeAsync();
                await Grace.DisposeAsync();
            }
        }
    }
}
