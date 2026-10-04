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

namespace Micropolis.Server.Tests
{
    [TestClass]
    public sealed class LoadedCityTests
    {
        private static readonly TimeSpan WorkTimeout = TimeSpan.FromSeconds(5);

        [TestMethod]
        public async Task RunAsync_WorkThatThrows_FailsTheCityClosingEveryPlayerAndReleasingWhatWaits()
        {
            TaskCompletionSource<Exception> failed = new TaskCompletionSource<Exception>(TaskCreationOptions.RunContinuationsAsynchronously);
            LoadedCity city = NewCity((_, exception) => failed.SetResult(exception));
            CityConnection connection = new CityConnection(new PlayerInfo("a", "Ada"));
            await city.JoinAsync(new Joining(connection, 0, Hold: false));
            InvalidOperationException thrown = new InvalidOperationException("the work threw");

            Task throwing = city.RunAsync(_ => throw thrown);
            Task<string> waiting = city.RunAsync(host => host.Save());

            Assert.AreSame(thrown, await failed.Task.WaitAsync(WorkTimeout));
            Assert.AreSame(thrown, (await Assert.ThrowsExactlyAsync<CityStoppedException>(() => throwing)).InnerException);
            Assert.AreSame(thrown, (await Assert.ThrowsExactlyAsync<CityStoppedException>(() => waiting)).InnerException);
            Assert.IsNull((await Assert.ThrowsExactlyAsync<CityStoppedException>(() => city.RunAsync(host => host.Save()))).InnerException);
            Assert.AreEqual(WebSocketCloseStatus.InternalServerError, await CloseStatusAsync(connection));
        }

        [TestMethod]
        public async Task RunAsync_AfterTheCityStopped_FailsAsStopped()
        {
            LoadedCity city = NewCity((_, exception) => Assert.Fail($"The city failed: {exception}"));
            await city.StopAsync();

            CityStoppedException stopped = await Assert.ThrowsExactlyAsync<CityStoppedException>(() => city.RunAsync(host => host.Save()));

            Assert.IsNull(stopped.InnerException);
        }

        [TestMethod]
        public async Task LeaveAsync_Member_IsSentNothingMoreOfTheCity()
        {
            LoadedCity city = NewCity((_, exception) => Assert.Fail($"The city failed: {exception}"));
            CityConnection ada = new CityConnection(new PlayerInfo("a", "Ada"));
            CityConnection grace = new CityConnection(new PlayerInfo("g", "Grace"));
            await city.JoinAsync(new Joining(ada, 0, Hold: true));
            await city.JoinAsync(new Joining(grace, 0, Hold: false));

            await city.LeaveAsync(ada);
            await city.RunAsync(host => host.Send("g", new JsonObject { ["type"] = "addFunds" }));
            await city.RunAsync(host => host.Flush());
            ada.Close(WebSocketCloseStatus.NormalClosure, null);
            grace.Close(WebSocketCloseStatus.NormalClosure, null);

            // Each joined to a batch of the whole city and an answer; only Grace then hears of the command
            Assert.AreEqual(2, await MessagesBeforeTheCloseAsync(ada));
            Assert.AreEqual(3, await MessagesBeforeTheCloseAsync(grace));
        }

        private static LoadedCity NewCity(Action<LoadedCity, Exception> failed)
        {
            return new LoadedCity(CityId.New(), StartingCity.New("Town", 2026, Level.Easy), new CityClock(TimeProvider.System, Manual: true), failed);
        }

        // Writes what the connection sends as the server would, which ends once it is closed, and gives the close's
        // status as a client reads it
        private static async Task<WebSocketCloseStatus?> CloseStatusAsync(CityConnection connection)
        {
            return (await ReadBackAsync(connection)).Status;
        }

        private static async Task<int> MessagesBeforeTheCloseAsync(CityConnection connection)
        {
            return (await ReadBackAsync(connection)).Messages;
        }

        private static async Task<(int Messages, WebSocketCloseStatus? Status)> ReadBackAsync(CityConnection connection)
        {
            using MemoryStream wire = new MemoryStream();
            using WebSocket server = WebSocket.CreateFromStream(wire, isServer: true, subProtocol: null, keepAliveInterval: Timeout.InfiniteTimeSpan);
            await connection.SendAllAsync(server, CancellationToken.None).WaitAsync(WorkTimeout);

            using WebSocket client = WebSocket.CreateFromStream(new MemoryStream(wire.ToArray()), isServer: false, subProtocol: null, keepAliveInterval: Timeout.InfiniteTimeSpan);
            byte[] buffer = new byte[256 * 1024];
            int messages = 0;

            while (true)
            {
                WebSocketReceiveResult result = await client.ReceiveAsync(buffer, CancellationToken.None);

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    return (messages, result.CloseStatus);
                }

                if (result.EndOfMessage)
                {
                    messages++;
                }
            }
        }
    }
}
