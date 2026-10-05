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

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The event keys of <see cref="RulesEvents"/> against the names of <see cref="Messages"/>, and the emitter that
    /// sends them by key.
    /// </summary>
    [TestClass]
    public sealed class RulesEventsTests
    {
        [TestMethod]
        public void Disasters_Names_AreTheDisasterMessagesInOrder()
        {
            CollectionAssert.AreEqual(Messages.DISASTER_MESSAGES.ToList(), RulesEvents.Disasters.Select(key => key.Name).ToList());
        }

        [TestMethod]
        public void Crashes_Names_AreTheCrashesInOrder()
        {
            CollectionAssert.AreEqual(Messages.CRASHES.ToList(), RulesEvents.Crashes.Select(key => key.Name).ToList());
        }

        // Each sprite type's crash, by its message, which no golden holds for every type
        [TestMethod]
        [DataRow(SpriteType.Train, Messages.TRAIN_CRASHED)]
        [DataRow(SpriteType.Helicopter, Messages.HELICOPTER_CRASHED)]
        [DataRow(SpriteType.Airplane, Messages.PLANE_CRASHED)]
        [DataRow(SpriteType.Ship, Messages.SHIP_CRASHED)]
        [DataRow(SpriteType.Monster, null)]
        [DataRow(SpriteType.Tornado, null)]
        [DataRow(SpriteType.Explosion, null)]
        public void TraitsOf_SpriteType_CrashesUnderItsMessage(SpriteType type, string? crash)
        {
            Assert.AreEqual(crash, Sprite.TraitsOf(type).Crash?.Name);
        }

        [TestMethod]
        public void Emit_ListenerAddingAnother_ReachesTheNewOneFromTheNextEvent()
        {
            EventEmitter events = new EventEmitter();
            List<string> heard = new List<string>();
            events.AddEventListener(RulesEvents.NoMoney, () =>
            {
                heard.Add("first");
                events.AddEventListener(RulesEvents.NoMoney, () => heard.Add("second"));
            });

            events.Emit(RulesEvents.NoMoney);
            events.Emit(RulesEvents.NoMoney);

            CollectionAssert.AreEqual(new[] { "first", "first", "second" }, heard);
        }

        [TestMethod]
        public void AddEventListener_SameListenerTwice_HearsEachEventOnce()
        {
            EventEmitter events = new EventEmitter();
            List<long> heard = new List<long>();
            Action<long> listener = heard.Add;
            events.AddEventListener(RulesEvents.FundsChanged, listener);
            events.AddEventListener(RulesEvents.FundsChanged, listener);

            events.Emit(RulesEvents.FundsChanged, 100L);

            CollectionAssert.AreEqual(new[] { 100L }, heard);
        }

        [TestMethod]
        public void Observer_EventsWithAndWithoutAPayload_SeesEachByItsNameBeforeItsListeners()
        {
            EventEmitter events = new EventEmitter();
            List<string> seen = new List<string>();
            events.Observer = (name, payload) => seen.Add($"{name} {payload ?? "none"}");
            events.AddEventListener(RulesEvents.ScoreUpdated, score => seen.Add($"listener {score}"));

            events.Emit(RulesEvents.ScoreUpdated, 500L);
            events.Emit(RulesEvents.NoMoney);

            CollectionAssert.AreEqual(new[] { $"{Messages.SCORE_UPDATED} 500", "listener 500", $"{Messages.NO_MONEY} none" }, seen);
        }
    }
}
