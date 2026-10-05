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
    public sealed class CityLimitsTests
    {
        private const string Ada = "192.0.2.1";
        private const string Grace = "192.0.2.2";

        private readonly FakeTimeProvider _time = new FakeTimeProvider();
        private CityLimits _limits = null!;

        [TestInitialize]
        public void Initialize()
        {
            _limits = new CityLimits(_time);
        }

        [TestMethod]
        public void TryStartCity_PastTheLimitInTheWindow_RefusesUntilTheWindowEnds()
        {
            StartCities(Ada, CityLimits.CitiesPerWindow);
            _time.Advance(CityLimits.CityWindow - TimeSpan.FromSeconds(1));
            Assert.IsFalse(_limits.TryStartCity(Ada));

            _time.Advance(TimeSpan.FromSeconds(1));

            StartCities(Ada, CityLimits.CitiesPerWindow);
            Assert.IsFalse(_limits.TryStartCity(Ada));
        }

        [TestMethod]
        public void TryStartCity_PastTheLimit_LeavesOtherAddressesBe()
        {
            StartCities(Ada, CityLimits.CitiesPerWindow);

            Assert.IsFalse(_limits.TryStartCity(Ada));
            Assert.IsTrue(_limits.TryStartCity(Grace));
        }

        // The window starts at the first city, not at the address's first check of any limit
        [TestMethod]
        public void TryStartCity_WindowStartsAtTheFirstCity_EndsAWindowAfterIt()
        {
            Assert.IsTrue(_limits.TryCopyCity(Ada));
            _time.Advance(TimeSpan.FromMinutes(5));
            StartCities(Ada, CityLimits.CitiesPerWindow);

            _time.Advance(CityLimits.CityWindow - TimeSpan.FromSeconds(1));
            Assert.IsFalse(_limits.TryStartCity(Ada));
            _time.Advance(TimeSpan.FromSeconds(1));

            Assert.IsTrue(_limits.TryStartCity(Ada));
        }

        [TestMethod]
        public void TrySendCommand_PastTheBurst_RefusesUntilASecondRefillsIt()
        {
            int third = CityLimits.CommandBurstCharacters / 3;
            Assert.IsTrue(_limits.TrySendCommand(Ada, third));
            Assert.IsTrue(_limits.TrySendCommand(Ada, third));
            Assert.IsTrue(_limits.TrySendCommand(Ada, third));
            int left = CityLimits.CommandBurstCharacters - 3 * third;
            Assert.IsFalse(_limits.TrySendCommand(Ada, left + CityLimits.CommandCharactersPerSecond));

            _time.Advance(TimeSpan.FromSeconds(1) - TimeSpan.FromTicks(1));
            Assert.IsFalse(_limits.TrySendCommand(Ada, left + CityLimits.CommandCharactersPerSecond));
            _time.Advance(TimeSpan.FromTicks(1));

            Assert.IsTrue(_limits.TrySendCommand(Ada, left + CityLimits.CommandCharactersPerSecond));
            Assert.IsFalse(_limits.TrySendCommand(Ada, 1));
        }

        // A part of a second refills that part of the second's characters
        [TestMethod]
        public void TrySendCommand_HalfASecondAfterTheBurst_HasHalfASecondsCharacters()
        {
            Assert.IsTrue(_limits.TrySendCommand(Ada, CityLimits.CommandBurstCharacters));

            _time.Advance(TimeSpan.FromMilliseconds(500));

            Assert.IsFalse(_limits.TrySendCommand(Ada, CityLimits.CommandCharactersPerSecond / 2 + 1));
            Assert.IsTrue(_limits.TrySendCommand(Ada, CityLimits.CommandCharactersPerSecond / 2));
        }

        [TestMethod]
        public void TrySendCommand_LongerThanTheBurst_IsRefusedAndTakesNothing()
        {
            Assert.IsFalse(_limits.TrySendCommand(Ada, CityLimits.CommandBurstCharacters + 1));

            Assert.IsTrue(_limits.TrySendCommand(Ada, CityLimits.CommandBurstCharacters));
        }

        [TestMethod]
        public void TryCopyCity_PastTheBurst_RefusesUntilAnIntervalRefillsOne()
        {
            Copy(Ada, CityLimits.CopyBurst);
            Assert.IsFalse(_limits.TryCopyCity(Ada));

            _time.Advance(CityLimits.CopyInterval - TimeSpan.FromTicks(1));
            Assert.IsFalse(_limits.TryCopyCity(Ada));
            _time.Advance(TimeSpan.FromTicks(1));

            Assert.IsTrue(_limits.TryCopyCity(Ada));
            Assert.IsFalse(_limits.TryCopyCity(Ada));
        }

        [TestMethod]
        public void TryCopyCity_IdleLongEnough_RefillsOnlyToTheBurst()
        {
            Copy(Ada, CityLimits.CopyBurst);

            _time.Advance(TimeSpan.FromDays(400));

            Copy(Ada, CityLimits.CopyBurst);
            Assert.IsFalse(_limits.TryCopyCity(Ada));
        }

        // Grace's checks look through the addresses, and Ada's is forgotten once every limit of it is back to full
        [TestMethod]
        public void Try_AddressIdleUntilFresh_IsForgottenAsOthersAreChecked()
        {
            Assert.IsTrue(_limits.TryStartCity(Ada));
            Assert.IsTrue(_limits.TrySendCommand(Ada, CityLimits.CommandBurstCharacters));
            Copy(Ada, CityLimits.CopyBurst);
            Assert.AreEqual(1, _limits.AddressesKept);

            // Every limit but the window of cities started is full again by now
            _time.Advance(CityLimits.CityWindow - TimeSpan.FromSeconds(1));
            Assert.IsTrue(_limits.TryCopyCity(Grace));
            Assert.AreEqual(2, _limits.AddressesKept);

            _time.Advance(TimeSpan.FromSeconds(1));
            Assert.IsTrue(_limits.TryCopyCity(Grace));
            Assert.AreEqual(2, _limits.AddressesKept, "Looked through the addresses before the interval passed");
            _time.Advance(CityLimits.ForgetInterval);
            Assert.IsTrue(_limits.TryCopyCity(Grace));

            // Grace alone, back to full and forgotten too, then kept again for this copy
            Assert.AreEqual(1, _limits.AddressesKept);
        }

        private void StartCities(string address, int cities)
        {
            for (int city = 0; city < cities; city++)
            {
                Assert.IsTrue(_limits.TryStartCity(address));
            }
        }

        private void Copy(string address, int copies)
        {
            for (int copy = 0; copy < copies; copy++)
            {
                Assert.IsTrue(_limits.TryCopyCity(address));
            }
        }
    }
}
