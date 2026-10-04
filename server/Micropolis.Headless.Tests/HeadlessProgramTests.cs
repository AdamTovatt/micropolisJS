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

namespace Micropolis.Headless.Tests
{
    /// <summary>
    /// The command line's contract, as a script or CI runs it: what goes to standard output and to standard error, and
    /// the exit code.
    /// </summary>
    [TestClass]
    public sealed class HeadlessProgramTests
    {
        private static (int Code, string Output, string Error) Run(string[] args, HeadlessFiles files)
        {
            StringWriter output = new StringWriter();
            StringWriter error = new StringWriter();

            int code = HeadlessProgram.Run(args, output, error, files);
            return (code, output.ToString(), error.ToString());
        }

        private static (int Code, string Output, string Error) Run(params string[] args)
        {
            return Run(args, HeadlessFiles.Committed);
        }

        // The run of a log file of the text given
        private static (int Code, string Output, string Error) RunLog(string log)
        {
            using TemporaryDirectory directory = new TemporaryDirectory();
            return Run("--log", directory.Write("log.json", log));
        }

        [TestMethod]
        public void Run_SeedRun_PrintsTwoLinesAndPasses()
        {
            (int code, string output, string error) = Run("--seed", "1", "--steps", "10");

            Assert.AreEqual(HeadlessProgram.Passed, code);
            Assert.HasCount(2, output.Split('\n', StringSplitOptions.RemoveEmptyEntries));
            Assert.AreEqual("", error);
        }

        [TestMethod]
        public void Run_WrongArguments_PrintsTheProblemAndTheUsage()
        {
            (int code, string output, string error) = Run("--seed", "1");

            Assert.AreEqual(HeadlessProgram.Misused, code);
            Assert.AreEqual("", output);
            StringAssert.StartsWith(error, "--steps is required.");
            StringAssert.Contains(error, HeadlessCommandLine.Usage);
        }

        [TestMethod]
        public void Run_StartItRefuses_PrintsTheReasonAndFails()
        {
            (int code, string output, string error) = Run("--seed", "1", "--fixture", "town", "--steps", "1");

            Assert.AreEqual(HeadlessProgram.Failed, code);
            Assert.AreEqual("", output);
            Assert.AreEqual($"A run starts from either a seed or a fixture{Environment.NewLine}", error);
        }

        [TestMethod]
        public void Run_LogThatIsMissing_PrintsTheReasonAndFails()
        {
            using TemporaryDirectory directory = new TemporaryDirectory();
            string path = Path.Combine(directory.Path, "log.json");

            (int code, string output, string error) = Run("--log", path);

            Assert.AreEqual(HeadlessProgram.Failed, code);
            Assert.AreEqual("", output);
            StringAssert.StartsWith(error, "Could not find file");
            StringAssert.Contains(error, path);
        }

        // A directory is a path the run may not read as a file
        [TestMethod]
        public void Run_LogItMayNotRead_PrintsTheReasonAndFails()
        {
            using TemporaryDirectory directory = new TemporaryDirectory();

            (int code, string output, string error) = Run("--log", directory.Path);

            Assert.AreEqual(HeadlessProgram.Failed, code);
            Assert.AreEqual("", output);
            StringAssert.StartsWith(error, "Access to the path");
        }

        [TestMethod]
        public void Run_LogThatIsNoLog_PrintsTheReasonAndFails()
        {
            (int code, _, string error) = RunLog("[]");

            Assert.AreEqual(HeadlessProgram.Failed, code);
            StringAssert.StartsWith(error, "A command log is a JSON object");
        }

        [TestMethod]
        public void Run_LogWhoseReplayDiffers_PrintsTheCheckpointAndFails()
        {
            (int code, string output, string error) = RunLog(
                "{\"formatVersion\":1,\"seed\":8,\"level\":0,\"entries\":[],\"checkpoints\":[{\"step\":0,\"hash\":\"" + new string('0', 64) + "\"}]}");

            Assert.AreEqual(HeadlessProgram.Failed, code);
            Assert.AreEqual("", output);
            StringAssert.StartsWith(error, "At step 0 the replay's state hash is ");
        }

        // A run that ran to its end but verified nothing prints what it found, then why it fails
        [TestMethod]
        public void Run_LogWithoutCheckpoints_PrintsItsLinesThenFails()
        {
            (int code, string output, string error) = RunLog("{\"formatVersion\":1,\"seed\":8,\"level\":0,\"entries\":[],\"checkpoints\":[]}");

            Assert.AreEqual(HeadlessProgram.Failed, code);
            StringAssert.StartsWith(output, "0 commands");
            StringAssert.StartsWith(error, "The log has no checkpoints");
        }

        [TestMethod]
        public void Run_WriteFixtures_PrintsEachLogWrittenAndPasses()
        {
            using TemporaryDirectory logs = TemporaryDirectory.WithTheLogs();

            (int code, string output, string error) = Run(["--write-fixtures"], HeadlessFiles.Committed with { Logs = logs.Path });

            Assert.AreEqual(HeadlessProgram.Passed, code);
            CollectionAssert.AreEqual(FixtureLogs.Names.Select(name => $"wrote {Fixtures.LogPath(logs.Path, name)}").ToArray(),
                                      output.Split(Environment.NewLine, StringSplitOptions.RemoveEmptyEntries));
            Assert.AreEqual("", error);
        }

        // A golden playthrough it can't copy is a file the run refuses, not a defect to trace, and every log stays as it was
        [TestMethod]
        public void Run_WriteFixturesFromABrokenGoldenPlaythrough_PrintsTheReasonAndFails()
        {
            using TemporaryDirectory logs = TemporaryDirectory.WithTheLogs();
            string golden = logs.Write("goldenPlaythrough.json", "{\"log\":");
            logs.Write($"town{Rules.CommandLog.FileExtension}", "stale");

            (int code, string output, string error) = Run(["--write-fixtures"], new HeadlessFiles(logs.Path, golden));

            Assert.AreEqual(HeadlessProgram.Failed, code);
            Assert.AreEqual("", output);
            StringAssert.StartsWith(error, $"The golden playthrough {golden} is not JSON: ");
            Assert.AreEqual("stale", File.ReadAllText(Fixtures.LogPath(logs.Path, "town")));
        }
    }
}
