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

using Micropolis.Rules;

namespace Micropolis.Server.Tests
{
    /// <summary>
    /// The step driver: real time turned into steps at 60 a second.
    /// </summary>
    [TestClass]
    public sealed class StepDriverTests
    {
        private const double Step = 1000.0 / Simulation.StepsPerSecond;

        [TestMethod]
        public void StepsDue_FirstCall_OwesNothing()
        {
            Assert.AreEqual(0, new StepDriver().StepsDue(5000));
        }

        [TestMethod]
        public void StepsDue_UnevenFrames_StepsAtAFixedRate()
        {
            StepDriver driver = new StepDriver();
            driver.StepsDue(0);

            int steps = new double[] { 7, 30, 31, 95, 400, 1000 }.Sum(driver.StepsDue);

            Assert.AreEqual(Simulation.StepsPerSecond, steps);
        }

        [TestMethod]
        public void StepsDue_FractionalFrames_StepsAtAFixedRate()
        {
            StepDriver driver = new StepDriver();
            driver.StepsDue(0);

            // 60 frames of 16.7 ms: just over a second
            int steps = Enumerable.Range(1, 60).Sum(frame => driver.StepsDue(frame * 16.7));

            Assert.AreEqual(Simulation.StepsPerSecond, steps);
        }

        [TestMethod]
        public void StepsDue_SlowFrame_CatchesUpWithSeveralSteps()
        {
            StepDriver driver = new StepDriver();
            driver.StepsDue(0);

            Assert.AreEqual(5, driver.StepsDue(5 * Step + 1));
        }

        [TestMethod]
        public void StepsDue_PartStep_CarriesOverToTheNextCall()
        {
            StepDriver driver = new StepDriver();
            driver.StepsDue(0);

            Assert.AreEqual(0, driver.StepsDue(Step / 2));
            Assert.AreEqual(1, driver.StepsDue(Step + 1));
        }

        [TestMethod]
        public void StepsDue_ExactlyTheCap_RunsEveryStepOwed()
        {
            StepDriver driver = new StepDriver();
            driver.StepsDue(0);

            Assert.AreEqual(StepDriver.MaxStepsPerCall, driver.StepsDue(StepDriver.MaxStepsPerCall * Step + Step / 2));
            Assert.AreEqual(1, driver.StepsDue(StepDriver.MaxStepsPerCall * Step + Step + 1));
        }

        [TestMethod]
        public void StepsDue_LongGap_DropsWhatItOwesPastTheCap()
        {
            StepDriver driver = new StepDriver();
            driver.StepsDue(0);

            Assert.AreEqual(StepDriver.MaxStepsPerCall, driver.StepsDue(60 * 1000));
            Assert.AreEqual(0, driver.StepsDue(60 * 1000 + 1));
        }

        [TestMethod]
        public void StepsDue_AfterIdle_OwesNothingForTheTimeIdle()
        {
            StepDriver driver = new StepDriver();
            driver.StepsDue(0);
            driver.Idle();

            Assert.AreEqual(0, driver.StepsDue(10 * Step));
            Assert.AreEqual(1, driver.StepsDue(11 * Step + 1));
        }

        [TestMethod]
        public void Run_CityStepping_TakesTheStepsDue()
        {
            StepDriver driver = new StepDriver();
            int steps = 0;
            driver.Run(0, () => true, () => steps++);

            driver.Run(3 * Step + 1, () => true, () => steps++);

            Assert.AreEqual(3, steps);
        }

        [TestMethod]
        public void Run_StepThatStopsTheCity_EndsTheRun()
        {
            StepDriver driver = new StepDriver();
            int steps = 0;
            driver.Run(0, () => steps < 2, () => steps++);

            driver.Run(5 * Step + 1, () => steps < 2, () => steps++);

            Assert.AreEqual(2, steps);
        }

        [TestMethod]
        public void Run_AfterTheCityStoppedStepping_OwesNothingForThatTime()
        {
            StepDriver driver = new StepDriver();
            int steps = 0;
            driver.Run(0, () => true, () => steps++);
            driver.Run(10 * Step, () => false, () => steps++);

            driver.Run(10 * Step + 1, () => true, () => steps++);
            driver.Run(11 * Step + 2, () => true, () => steps++);

            Assert.AreEqual(1, steps);
        }

        [TestMethod]
        public void Run_Held_TakesNoSteps()
        {
            StepDriver driver = new StepDriver();
            int steps = 0;
            driver.Run(0, () => true, () => steps++);
            driver.Hold();

            driver.Run(10 * Step, () => true, () => steps++);

            Assert.IsTrue(driver.IsHeld);
            Assert.AreEqual(0, steps);
        }

        [TestMethod]
        public void Release_Held_IsNoLongerHeld()
        {
            StepDriver driver = new StepDriver();
            driver.Hold();

            driver.Release();

            Assert.IsFalse(driver.IsHeld);
        }

        [TestMethod]
        public void Run_AfterARelease_OwesNothingForTheTimeHeld()
        {
            StepDriver driver = new StepDriver();
            int steps = 0;
            driver.Run(0, () => true, () => steps++);
            driver.Hold();
            driver.Run(10 * Step, () => true, () => steps++);
            driver.Release();

            // The first run after the release only starts the clock; the next is a step and a millisecond later
            driver.Run(10 * Step + 1, () => true, () => steps++);
            driver.Run(11 * Step + 2, () => true, () => steps++);

            Assert.AreEqual(1, steps);
        }

        [TestMethod]
        public void Run_ReleasedBeforeItRanAgain_OwesNothingForTheTimeHeld()
        {
            StepDriver driver = new StepDriver();
            int steps = 0;
            driver.Run(0, () => true, () => steps++);
            driver.Hold();
            driver.Release();

            // Ten steps' time has passed since the last run, all of it before the hold ended
            driver.Run(10 * Step, () => true, () => steps++);
            driver.Run(11 * Step + 1, () => true, () => steps++);

            Assert.AreEqual(1, steps);
        }
    }
}
