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

using System.Text.Json.Nodes;
using static Micropolis.Rules.Tests.FixtureCities;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The step loop around the phases: the speed gate, the sprite seam and the date.
    /// </summary>
    [TestClass]
    public sealed class SimulationStepTests
    {
        private static readonly ConformanceSpeedGate Gate = ConformanceSpeedGate.Load();

        public static IEnumerable<object[]> GatedSpeeds => Gate.Speeds.Select(speed => new object[] { speed.Speed });

        [TestMethod]
        [DynamicData(nameof(GatedSpeeds))]
        public void TakeSpeedCycle_ComparedWithTypeScript_LetsAPhaseThroughAtTheSameSteps(string speedName)
        {
            GatedSpeed expected = Gate.Speeds.Single(speed => speed.Speed == speedName);
            Simulation city = City(Gate.Fixture, "built");
            city.SetSpeed(Enum.Parse<Speed>(speedName, ignoreCase: true));
            List<int> phaseSteps = new List<int>();

            Assert.AreEqual(expected.SpeedCycle, city.SpeedCycle);
            for (int step = 0; step < Gate.Steps; step++)
            {
                if (city.TakeSpeedCycle())
                {
                    phaseSteps.Add(step);
                }
            }

            CollectionAssert.AreEqual(expected.PhaseSteps.ToList(), phaseSteps);
        }

        // A sprite-free city's steps that run no phase move nothing, and announce the date once
        [TestMethod]
        public void Step_SpriteFreeCityBetweenPhases_AdvancesTheCountersAndAnnouncesTheDate()
        {
            Simulation city = City("suburb", "built", save => save["simulation"]!["speedCycle"] = 0);
            city.SetSpeed(Speed.Medium);
            List<string> events = new List<string>();
            city.Events.AddEventListener(Messages.DATE_UPDATED, payload => events.Add(CanonicalJson.Write(payload)));

            // At medium speed the 3rd step runs a phase
            city.Step();
            city.Step();

            Assert.AreEqual(2, city.SpeedCycle);
            Assert.AreEqual(2, city.SpriteManager.SpriteCycle);
            Assert.AreEqual(0, city.PhaseCycle);
            CollectionAssert.AreEqual(new[] { "{\"month\":0,\"year\":1900}" }, events);
        }

        // As the TypeScript's test of the year one million: the city goes back to 1900, in the same month
        [TestMethod]
        public void Step_ReachingTheYearOneMillion_GoesBackTo1900InTheSameMonth()
        {
            Simulation city = City("suburb", "built", save =>
            {
                save["simulation"]!["speedCycle"] = 0;
                save["simulation"]!["cityTime"] = (1000000 - 1900) * 48L + 4;
            });
            city.SetSpeed(Speed.Medium);
            List<string> events = new List<string>();
            city.Events.AddEventListener(Messages.DATE_UPDATED, payload => events.Add(CanonicalJson.Write(payload)));

            // A step that runs no phase, so the city time is the date's alone
            city.Step();

            Assert.AreEqual(4, city.CityTime);
            CollectionAssert.AreEqual(new[] { "{\"month\":1,\"year\":1900}" }, events);
        }

        // The sprites aren't ported: a city with sprites stops at the seam on a step that runs no phase
        [TestMethod]
        public void Step_CityWithSprites_ThrowsNamingMoveObjects()
        {
            Simulation city = City("town", "run");
            Simulation gate = City("town", "run");

            Assert.IsNotEmpty(city.SpriteManager.SpriteList);
            Assert.IsFalse(gate.TakeSpeedCycle(), "The step runs a phase, which would stop first at another unit.");

            NotPortedException exception = Assert.ThrowsExactly<NotPortedException>(city.Step);

            Assert.AreEqual("spriteManager.moveObjects", exception.Unit);
            StringAssert.Contains(exception.Message, "spriteManager.moveObjects");
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

        // A paused city's step runs no phase, but a phase run paused skips its scan as the TypeScript does, whose
        // frequency at the paused speed is undefined
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
            List<string?> speeds = new List<string?>();
            city.Events.AddEventListener(Messages.SPEED_CHANGED, payload => speeds.Add(payload?.ToJsonString()));

            city.SetSpeed(Speed.Medium);
            city.SetSpeed(Speed.Fast);
            city.SetSpeed(Speed.Fast);

            CollectionAssert.AreEqual(new[] { ((int)Speed.Fast).ToString() }, speeds);
        }
    }
}
