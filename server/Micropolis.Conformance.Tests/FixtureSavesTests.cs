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

namespace Micropolis.Conformance.Tests
{
    /// <summary>
    /// The fixtures' saves against the committed files: each save a fixture's replay reaches is the committed file byte
    /// for byte, and hashes as its log's checkpoint. A change to a fixture's commands, or to a rule its replay reaches,
    /// fails here until the saves are written again.
    /// </summary>
    [TestClass]
    public sealed class FixtureSavesTests
    {
        public static IEnumerable<object[]> AllFixtures => Fixtures.All.Select(fixture => new object[] { fixture.Name });

        // Each file is its canonical text alone, so its SHA-256 is the hash of its fixture's checkpoint there
        [TestMethod]
        [DynamicData(nameof(AllFixtures))]
        public void Build_EachFixture_IsTheCommittedSaveAtEachOfItsLogsEndCheckpoints(string name)
        {
            ConformanceDirectories committed = ConformanceDirectories.Committed;
            CommandLog log = CommandLog.Parse(File.ReadAllText(Fixtures.LogPath(committed, name)));

            IReadOnlyList<FixtureSave> saves = FixtureSaves.Build(Fixtures.Named(name), committed);

            CollectionAssert.AreEqual(new[] { FixtureSaves.Built, FixtureSaves.Run }, saves.Select(save => save.At.Point).ToArray());
            CollectionAssert.AreEqual(new[] { log.Checkpoints[0], log.Checkpoints[^1] },
                                      saves.Select(save => new Checkpoint(save.At.Step, StateHash.HashCanonicalText(save.Text))).ToArray());
            foreach (FixtureSave save in saves)
            {
                Assert.AreEqual(save.At.ReadCommitted(), save.Text, save.At.Name);
            }
        }

        [TestMethod]
        public void Saves_ComparedWithTheCommittedFiles_AreOneEach()
        {
            List<string> expected = Fixtures.All
                .SelectMany(fixture => new[] { FixtureSaves.Built, FixtureSaves.Run }.Select(point => $"{fixture.Name}.{point}.json"))
                .ToList();

            CollectionAssert.AreEquivalent(expected, Directory.GetFiles(ConformanceDirectories.Committed.Saves).Select(Path.GetFileName).ToList());
        }

        [TestMethod]
        public void At_PointNoFixtureHas_ThrowsNamingThePoints()
        {
            ArgumentException exception = Assert.ThrowsExactly<ArgumentException>(() => FixtureSaves.At("town", "middle"));

            Assert.AreEqual("No save point middle: a fixture's are built and run", exception.Message);
        }

        [TestMethod]
        public void StartCity_NoSpeed_IsTheSavesCity()
        {
            string text = FixtureSaves.At("suburb", FixtureSaves.Built).ReadCommitted();

            Assert.AreEqual(text, CanonicalJson.Write(FixtureSaves.StartCity(text, null).Save()));
        }

        // Only the speed changes: the city at another speed is the save's, its stream included
        [TestMethod]
        public void StartCity_GivenAnotherSpeed_ChangesOnlyTheSpeed()
        {
            string text = FixtureSaves.At("suburb", FixtureSaves.Built).ReadCommitted();
            Speed saved = FixtureSaves.StartCity(text, null).Speed;
            Speed other = saved == Speed.Fast ? Speed.Slow : Speed.Fast;

            Simulation city = FixtureSaves.StartCity(text, other);

            Assert.AreEqual(other, city.Speed);
            city.SetSpeed(saved);
            Assert.AreEqual(text, CanonicalJson.Write(city.Save()));
        }

        [TestMethod]
        public void TextOf_SaveNotAmongThem_ThrowsNamingIt()
        {
            InvalidDataException exception = Assert.ThrowsExactly<InvalidDataException>(() => FixtureSaves.TextOf([], "town", FixtureSaves.Run));

            Assert.AreEqual("No save town.run among the fixtures' saves.", exception.Message);
        }
    }
}
