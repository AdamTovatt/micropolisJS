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

using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text.Json.Nodes;
using Micropolis.Rules;

namespace Micropolis.Server.Tests
{
    [TestClass]
    public sealed class LoadedCityTests
    {
        private static readonly TimeSpan WorkTimeout = TimeSpan.FromSeconds(5);

        // What the cities a test made reported failing with, which the city's own work loop reports, so a test asserts
        // on it once it is done rather than inside that loop
        private readonly ConcurrentQueue<Exception> _failures = new ConcurrentQueue<Exception>();

        [TestCleanup]
        public void NoCityFailedUnlessTheTestSaidSo()
        {
            Assert.IsEmpty(_failures, string.Join(Environment.NewLine, _failures));
        }

        [TestMethod]
        public async Task RunAsync_WorkThatThrows_FailsTheCityClosingEveryPlayerAndReleasingWhatWaits()
        {
            TaskCompletionSource<Exception> failed = new TaskCompletionSource<Exception>(TaskCreationOptions.RunContinuationsAsynchronously);
            LoadedCity city = NewCity((_, exception) => failed.SetResult(exception));
            CityConnection connection = new CityConnection(new PlayerInfo("a", "Ada"));
            await city.JoinAsync(new Joining(connection, 0, Hold: false));
            InvalidOperationException thrown = new InvalidOperationException("the work threw");
            // Holds the city's work until both are queued, or the city may fail before the second is, which it then
            // refuses as stopped
            using ManualResetEventSlim gate = new ManualResetEventSlim();
            Task<bool> held = city.RunAsync(_ => gate.Wait(WorkTimeout));

            Task throwing = city.RunAsync(_ => throw thrown);
            Task<string> waiting = city.RunAsync(host => host.Save());
            gate.Set();

            Assert.IsTrue(await held);
            Assert.AreSame(thrown, await failed.Task.WaitAsync(WorkTimeout));
            Assert.AreSame(thrown, (await Assert.ThrowsExactlyAsync<CityStoppedException>(() => throwing)).InnerException);
            Assert.AreSame(thrown, (await Assert.ThrowsExactlyAsync<CityStoppedException>(() => waiting)).InnerException);
            Assert.IsNull((await Assert.ThrowsExactlyAsync<CityStoppedException>(() => city.RunAsync(host => host.Save()))).InnerException);
            Assert.AreEqual(WebSocketCloseStatus.InternalServerError, (await ConnectionWire.ReadBackAsync(connection)).Status);
        }

        [TestMethod]
        public async Task RunAsync_AfterTheCityStopped_FailsAsStopped()
        {
            LoadedCity city = NewCity();
            await city.StopAsync();

            CityStoppedException stopped = await Assert.ThrowsExactlyAsync<CityStoppedException>(() => city.RunAsync(host => host.Save()));

            Assert.IsNull(stopped.InnerException);
        }

        [TestMethod]
        public async Task LeaveAsync_Member_IsSentNothingMoreOfTheCity()
        {
            LoadedCity city = NewCity();
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
            Assert.AreEqual(2, (await ConnectionWire.ReadBackAsync(ada)).Messages);
            Assert.AreEqual(3, (await ConnectionWire.ReadBackAsync(grace)).Messages);
        }

        // A city that reports any failure to the test, which fails it once it is done
        private LoadedCity NewCity()
        {
            return NewCity((_, exception) => _failures.Enqueue(exception));
        }

        private static LoadedCity NewCity(Action<LoadedCity, Exception> failed)
        {
            return new LoadedCity(CityId.New(), StartingCity.New("Town", 2026, Level.Easy), new ServerClock(TimeProvider.System, Manual: true), held: false, failed);
        }
    }
}
