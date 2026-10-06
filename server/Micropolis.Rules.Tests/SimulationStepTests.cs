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
    /// <summary>
    /// The step loop around the phases: the speed gate, the sprite seam and the date. The steps the gate lets a phase
    /// through at each speed are <c>conformance/speedGate.json</c>, which the fixture tool's tests hold to the rules
    /// byte for byte.
    /// </summary>
    [TestClass]
    public sealed class SimulationStepTests
    {
        // A sprite-free city's steps that run no phase move nothing, and announce the date once
        [TestMethod]
        public void Step_SpriteFreeCityBetweenPhases_AdvancesTheCountersAndAnnouncesTheDate()
        {
            Simulation city = City("suburb", "built", save => save["simulation"]!["speedCycle"] = 0);
            city.SetSpeed(Speed.Medium);
            List<DateMessage> events = new List<DateMessage>();
            city.Events.AddEventListener(RulesEvents.DateUpdated, events.Add);

            // At medium speed the 3rd step runs a phase
            city.Step();
            city.Step();

            Assert.AreEqual(2, city.SpeedCycle);
            Assert.AreEqual(2, city.SpriteManager.SpriteCycle);
            Assert.AreEqual(0, city.PhaseCycle);
            CollectionAssert.AreEqual(new[] { new DateMessage(0, 1900) }, events);
        }

        // The year one million: the city goes back to 1900, in the same month
        [TestMethod]
        public void Step_ReachingTheYearOneMillion_GoesBackTo1900InTheSameMonth()
        {
            Simulation city = City("suburb", "built", save =>
            {
                save["simulation"]!["speedCycle"] = 0;
                save["simulation"]!["cityTime"] = (1000000 - 1900) * 48L + 4;
            });
            city.SetSpeed(Speed.Medium);
            List<DateMessage> events = new List<DateMessage>();
            city.Events.AddEventListener(RulesEvents.DateUpdated, events.Add);

            // A step that runs no phase, so the city time is the date's alone
            city.Step();

            Assert.AreEqual(4, city.CityTime);
            CollectionAssert.AreEqual(new[] { new DateMessage(1, 1900) }, events);
        }

        // A step that runs no phase moves the sprites, on every step whatever the speed
        [TestMethod]
        public void Step_CityWithSprites_MovesThem()
        {
            Simulation city = City("underfunded", "run");
            Simulation gate = City("underfunded", "run");
            long spriteCycle = city.SpriteManager.SpriteCycle;
            string sprites = CanonicalJson.Write(city.Save()["sprites"]!["list"]!);

            Assert.IsNotEmpty(city.SpriteManager.SpriteList);
            Assert.IsFalse(gate.TakeSpeedCycle(), "The step runs a phase, so more than the sprites may move.");

            city.Step();

            Assert.AreEqual(spriteCycle + 1, city.SpriteManager.SpriteCycle);
            Assert.AreNotEqual(sprites, CanonicalJson.Write(city.Save()["sprites"]!["list"]!));
        }

        [TestMethod]
        public void Step_Paused_DoesNothing()
        {
            Simulation city = City("suburb", "built");
            city.SetSpeed(Speed.Paused);
            JsonObject before = city.Save();

            city.Step();

            Assert.AreEqual(CanonicalJson.Write(before), CanonicalJson.Write(city.Save()));
        }

        // A paused city's step runs no phase, but a phase run paused skips its scan, which has no frequency at the
        // paused speed
        [TestMethod]
        public void Simulate_PausedAtAScanPhase_SkipsTheScan()
        {
            Simulation city = City("suburb", "built", save =>
            {
                save["simulation"]!["speed"] = (int)Speed.Paused;
                save["simulation"]!["phaseCycle"] = 11;
                save["simulation"]!["initialEvaluationPending"] = false;
            });

            city.Simulate(city.ConstructSimData());

            Assert.AreEqual(12, city.PhaseCycle);
        }

        [TestMethod]
        public void SetSpeed_ChangedOrNot_AnnouncesOnlyAChange()
        {
            Simulation city = City("suburb", "built");
            city.SetSpeed(Speed.Medium);
            List<int> speeds = new List<int>();
            city.Events.AddEventListener(RulesEvents.SpeedChanged, speeds.Add);

            city.SetSpeed(Speed.Medium);
            city.SetSpeed(Speed.Fast);
            city.SetSpeed(Speed.Fast);

            CollectionAssert.AreEqual(new[] { (int)Speed.Fast }, speeds);
        }
    }
}
