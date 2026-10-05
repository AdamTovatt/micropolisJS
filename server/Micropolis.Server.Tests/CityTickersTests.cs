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

using Microsoft.Extensions.Time.Testing;

namespace Micropolis.Server.Tests
{
    [TestClass]
    public sealed class CityTickersTests
    {
        [TestMethod]
        public void TimerTickerLater_AFrameOn_PostsTheCallbackOnce()
        {
            FakeTimeProvider time = new FakeTimeProvider();
            List<Action> posted = new List<Action>();
            TimerTicker ticker = new TimerTicker(time, posted.Add, CancellationToken.None);

            ticker.Later(() => { });
            Assert.AreEqual(0, posted.Count);
            time.Advance(TimerTicker.FrameInterval);
            time.Advance(TimeSpan.FromSeconds(1));

            Assert.AreEqual(1, posted.Count);
        }

        [TestMethod]
        public void TimerTickerLater_CityStoppedFirst_PostsNothing()
        {
            FakeTimeProvider time = new FakeTimeProvider();
            List<Action> posted = new List<Action>();
            using CancellationTokenSource stopped = new CancellationTokenSource();
            TimerTicker ticker = new TimerTicker(time, posted.Add, stopped.Token);

            ticker.Later(() => { });
            stopped.Cancel();
            time.Advance(TimeSpan.FromSeconds(1));

            Assert.AreEqual(0, posted.Count);
        }

        [TestMethod]
        public void TimerTickerNow_TimePassed_IsTheMillisecondsSinceItStarted()
        {
            FakeTimeProvider time = new FakeTimeProvider();
            TimerTicker ticker = new TimerTicker(time, _ => { }, CancellationToken.None);

            time.Advance(TimeSpan.FromSeconds(1.5));

            Assert.AreEqual(1500, ticker.Now());
        }

        [TestMethod]
        public void ManualTickerRun_CallbacksWaiting_MovesTheClockThenRunsEachOnce()
        {
            ManualTicker ticker = new ManualTicker();
            List<double> ran = new List<double>();
            ticker.Later(() => ran.Add(ticker.Now()));

            ticker.Run(16.5);
            ticker.Run(16.5);

            CollectionAssert.AreEqual(new[] { 16.5 }, ran);
        }
    }
}
