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

using System.Text.Json;

namespace Micropolis.Benchmarks.Tests
{
    [TestClass]
    public sealed class MessageBytesTests
    {
        private static readonly BenchmarkSettings Settings = Examples.Settings;

        private static readonly BenchmarkCase[] Cases = Examples.Cases;

        [TestMethod]
        public void Parse_TheExample_GivesEachCaseItsBytesAndHash()
        {
            MessageBytes messageBytes = MessageBytes.Parse(Examples.Read("messageBytes.json"), Cases, Settings);

            Assert.AreEqual(
                new CaseBytes(19.0625, "5dd0e111ea6827fc8f3cbd72826100ade8ef19b4f2bbeae66cf59a5269a70dbf"),
                messageBytes.For(Cases[0]));
            Assert.AreEqual(22.5625, messageBytes.For(Cases[2]).BytesPerStep);
        }

        [TestMethod]
        public void Parse_EveryCase_GivesEachItsBytes()
        {
            MessageBytes messageBytes = MessageBytes.Parse(Measured(Settings, Cases), Cases, Settings);

            CollectionAssert.AreEqual(new[] { 1.5, 2.5, 3.5 }, Cases.Select(c => messageBytes.For(c).BytesPerStep).ToList());
        }

        [TestMethod]
        public void Parse_ACaseMissing_FailsNamingIt()
        {
            InvalidDataException exception = Assert.ThrowsExactly<InvalidDataException>(
                () => MessageBytes.Parse(Measured(Settings, Cases[..2]), Cases, Settings));

            StringAssert.Contains(exception.Message, "don't measure new city (seed 0) at fast");
        }

        [TestMethod]
        public void Parse_ACaseTheListLacks_Fails()
        {
            InvalidDataException exception = Assert.ThrowsExactly<InvalidDataException>(
                () => MessageBytes.Parse(Measured(Settings, Cases), Cases[..2], Settings));

            StringAssert.Contains(exception.Message, "a case the case list doesn't hold");
        }

        [TestMethod]
        public void Parse_ACaseTwice_FailsNamingIt()
        {
            InvalidDataException exception = Assert.ThrowsExactly<InvalidDataException>(
                () => MessageBytes.Parse(Measured(Settings, [.. Cases, Cases[0]]), Cases, Settings));

            StringAssert.Contains(exception.Message, "suburb at medium twice");
        }

        [TestMethod]
        [DataRow(0, 32, DisplayName = "another warmup")]
        [DataRow(16, 16, DisplayName = "other steps")]
        public void Parse_OtherSteps_Fails(int warmup, int steps)
        {
            InvalidDataException exception = Assert.ThrowsExactly<InvalidDataException>(
                () => MessageBytes.Parse(Measured(new BenchmarkSettings(warmup, steps, 1), Cases), Cases, Settings));

            StringAssert.Contains(exception.Message, "the timing measures 32 after 16");
        }

        [TestMethod]
        [DataRow("""{"warmup":16,"steps":32}""", DisplayName = "a member missing")]
        [DataRow("""{"warmup":16,"steps":32,"cases":[],"source":"x"}""", DisplayName = "an unknown member")]
        [DataRow("""{"warmup":16,"steps":32,"cases":[{"name":"suburb","speed":"medium","bytesPerStep":1}]}""",
                 DisplayName = "a case without its hash")]
        public void Parse_MembersNotTheFormats_Fails(string json)
        {
            Assert.ThrowsExactly<JsonException>(() => MessageBytes.Parse(json, Cases, Settings));
        }

        // The TypeScript measurement's output for the cases, the first measuring 1.5 bytes a step and each next one more
        private static string Measured(BenchmarkSettings settings, IReadOnlyList<BenchmarkCase> cases)
        {
            return JsonSerializer.Serialize(new
            {
                warmup = settings.Warmup,
                steps = settings.Steps,
                cases = cases.Select((benchmarkCase, i) => new
                {
                    name = benchmarkCase.Name,
                    speed = benchmarkCase.SpeedName,
                    bytesPerStep = 1.5 + i,
                    hash = "a hash",
                }),
            });
        }
    }
}
