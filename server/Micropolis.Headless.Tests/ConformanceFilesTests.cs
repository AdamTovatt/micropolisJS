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

using System.Globalization;
using Micropolis.Conformance;
using Micropolis.Rules;

namespace Micropolis.Headless.Tests
{
    /// <summary>
    /// The fixture tool against the committed conformance files: each it writes from the committed logs and saves is
    /// the committed file byte for byte. A change to a case, or to a rule a case reaches, fails here until the files
    /// are written again. <c>SavedGameTests</c> holds the migrated states, which it works out as the tool does.
    /// </summary>
    [TestClass]
    public sealed class ConformanceFilesTests
    {
        private static readonly Lazy<IReadOnlyList<FixtureSave>> Saves =
            new Lazy<IReadOnlyList<FixtureSave>>(() => FixtureSaves.All.Select(save => new FixtureSave(save, save.ReadCommitted())).ToList());

        public static IEnumerable<object[]> Logs => FixtureLogs.Names.Select(name => new object[] { name });

        private static string Committed(string name)
        {
            return File.ReadAllText(ConformanceDirectories.Committed.File(name));
        }

        [TestMethod]
        public void Write_CommandCases_IsTheCommittedFileByteForByte()
        {
            Assert.AreEqual(Committed(CommandCasesFile.FileName), CommandCasesFile.Write(Saves.Value));
        }

        [TestMethod]
        public void Write_QueryCases_IsTheCommittedFileByteForByte()
        {
            Assert.AreEqual(Committed(QueryCasesFile.FileName), QueryCasesFile.Write(Saves.Value));
        }

        [TestMethod]
        public void Write_SpeedGate_IsTheCommittedFileByteForByte()
        {
            Assert.AreEqual(Committed(SpeedGateFile.FileName), SpeedGateFile.Write(Saves.Value));
        }

        [TestMethod]
        public void Write_Maps_IsTheCommittedFileByteForByte()
        {
            Assert.AreEqual(Committed(MapsFile.FileName), MapsFile.Write());
        }

        [TestMethod]
        public void Write_StationCover_IsTheCommittedFileByteForByte()
        {
            Assert.AreEqual(Committed(StationCoverFile.FileName), StationCoverFile.Write());
        }

        [TestMethod]
        public void Write_RuleConstants_IsTheCommittedFileByteForByte()
        {
            Assert.AreEqual(Committed(RuleConstantsFile.FileName), RuleConstantsFile.Write());
        }

        [TestMethod]
        public void Write_Runs_IsTheCommittedFileByteForByte()
        {
            Assert.AreEqual(Committed(RunsFile.FileName), RunsFile.Write(Saves.Value));
        }

        [TestMethod]
        public void Write_Helpers_IsTheCommittedFileByteForByte()
        {
            Assert.AreEqual(Committed(HelpersFile.FileName), HelpersFile.Write(Saves.Value));
        }

        [TestMethod]
        [DynamicData(nameof(Logs))]
        public void Write_EventsOfEachLog_IsTheCommittedFileByteForByte(string name)
        {
            ConformanceDirectories committed = ConformanceDirectories.Committed;
            CommandLog log = CommandLog.Parse(File.ReadAllText(Fixtures.LogPath(committed, name)));

            Assert.AreEqual(File.ReadAllText(FixtureEvents.FilePath(committed, name)), FixtureEvents.Write(log));
        }

        [TestMethod]
        public void Events_ComparedWithTheCommittedFiles_AreOneForEachLog()
        {
            List<string> events = Directory.GetFiles(ConformanceDirectories.Committed.Events).Select(path => Path.GetFileName(path)).ToList();

            CollectionAssert.AreEquivalent(FixtureLogs.Names.Select(name => $"{name}{FixtureEvents.FileExtension}").ToList(), events);
        }

        [TestMethod]
        public void Samples_ComparedWithTheCommittedMigratedFiles_AreOneEach()
        {
            ConformanceDirectories committed = ConformanceDirectories.Committed;
            List<string> migrated = Directory.GetFiles(committed.Migrated).Select(path => Path.GetFileName(path)).ToList();

            CollectionAssert.AreEquivalent(MigratedSaves.Samples(committed).ToList(), migrated);
        }

        [TestMethod]
        public void Files_SamplesMissingAVersion_FailsNamingIt()
        {
            using TemporaryDirectory conformance = TemporaryDirectory.WithTheToolsInputs();
            File.Delete(Path.Combine(conformance.Conformance.SaveVersions, "version7.json"));
            File.Delete(Path.Combine(conformance.Conformance.SaveVersions, "version7AwaitingBudget.json"));

            InvalidDataException exception = Assert.ThrowsExactly<InvalidDataException>(() => MigratedSaves.Files(conformance.Conformance));

            Assert.AreEqual("The conformance data would not cover a sample save of version 7", exception.Message);
        }

        [TestMethod]
        public void EnsureReasonsCovered_ReasonListedButNotReached_FailsNamingIt()
        {
            InvalidDataException exception = Assert.ThrowsExactly<InvalidDataException>(
                () => ConformanceText.EnsureReasonsCovered(["not a command"], ["not a command", "the speed is a whole number from # to #"], "a command is rejected for"));

            Assert.AreEqual("The conformance data would not cover every reason a command is rejected for: " +
                            "missing [the speed is a whole number from # to #], reached but not listed []", exception.Message);
        }

        [TestMethod]
        public void EnsureReasonsCovered_ReasonReachedButNotListed_FailsNamingIt()
        {
            InvalidDataException exception = Assert.ThrowsExactly<InvalidDataException>(
                () => ConformanceText.EnsureReasonsCovered(["not a command", "a new reason"], ["not a command"], "a command is rejected for"));

            Assert.AreEqual("The conformance data would not cover every reason a command is rejected for: " +
                            "missing [], reached but not listed [a new reason]", exception.Message);
        }

        [TestMethod]
        public void ReasonWords_ReasonQuotingNumbers_WritesEach()
        {
            Assert.AreEqual("tile # of the path, (#, #), is off the #x# map", ConformanceText.ReasonWords("tile 3 of the path, (-1, 0), is off the 8x8 map"));
        }

        // A machine whose culture writes a minus sign other than JSON's hyphen still writes the tiles' JSON
        [TestMethod]
        public void Tile_NegativeUnderACultureWithAnotherMinusSign_IsJson()
        {
            CultureInfo culture = CultureInfo.CurrentCulture;
            CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("sv-SE");

            try
            {
                Assert.AreEqual("""{"x":-1,"y":0}""", CommandCases.Tile(-1, 0));
            }
            finally
            {
                CultureInfo.CurrentCulture = culture;
            }
        }
    }
}
