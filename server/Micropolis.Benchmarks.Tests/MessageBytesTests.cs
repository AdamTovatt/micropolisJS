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

using System.Text;
using Micropolis.Rules;

namespace Micropolis.Benchmarks.Tests
{
    [TestClass]
    public sealed class MessageBytesTests
    {
        private static readonly BenchmarkSettings Settings = new BenchmarkSettings(Warmup: 16, Steps: 32, Repeats: 1);

        [TestMethod]
        public void BatchBytes_NoMessages_IsNone()
        {
            Assert.AreEqual(0, MessageBytes.BatchBytes([]));
        }

        // é is one character but two bytes in UTF-8
        [TestMethod]
        public void BatchBytes_Messages_AreTheUtf8BytesOfTheBatchsText()
        {
            string text = """{"type":"state","messages":[{"type":"date","month":3,"year":1901},{"type":"news","subject":"é"}]}""";

            Assert.AreEqual(text.Length + 1, MessageBytes.BatchBytes([new DateMessage(3, 1901), new NewsMessage("é")]));
        }

        [TestMethod]
        public void Measure_Case_IsTheMeanBatchBytesOfTheStepsAfterTheWarmup()
        {
            NewCityCase newCity = new NewCityCase(0, Level.Easy, Speed.Fast);
            Simulation city = newCity.Start();
            CityStateMessages messages = new CityStateMessages(city);
            List<int> stepBytes = new List<int>();

            for (int step = 0; step < Settings.Warmup + Settings.Steps; step++)
            {
                city.Step();
                stepBytes.Add(MessageBytes.BatchBytes(messages.NewMessages()));
            }

            double expected = (double)stepBytes.Skip(Settings.Warmup).Sum() / Settings.Steps;

            Assert.IsGreaterThan(0, expected);
            Assert.AreEqual(expected, MessageBytes.Measure(newCity, Settings).BytesPerStep);
        }

        [TestMethod]
        public void Measure_Case_EndsWhereTheTimedCityDoes()
        {
            FixtureCase disasters = new FixtureCase("disasters", Speed.Medium, true);

            Assert.AreEqual(StepTimer.Measure(disasters, Settings).StateHash, MessageBytes.Measure(disasters, Settings).StateHash);
        }
    }
}
