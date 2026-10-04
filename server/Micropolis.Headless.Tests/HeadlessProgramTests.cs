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
        private static (int Code, string Output, string Error) Run(string[] args, Func<string, string> readFile)
        {
            StringWriter output = new StringWriter();
            StringWriter error = new StringWriter();

            int code = HeadlessProgram.Run(args, output, error, readFile);
            return (code, output.ToString(), error.ToString());
        }

        private static string NoFile(string path)
        {
            throw new InvalidOperationException($"The run read {path}.");
        }

        [TestMethod]
        public void Run_SeedRun_PrintsTwoLinesAndPasses()
        {
            (int code, string output, string error) = Run(["--seed", "1", "--steps", "10"], NoFile);

            Assert.AreEqual(HeadlessProgram.Passed, code);
            Assert.HasCount(2, output.Split('\n', StringSplitOptions.RemoveEmptyEntries));
            Assert.AreEqual("", error);
        }

        [TestMethod]
        public void Run_WrongArguments_PrintsTheProblemAndTheUsage()
        {
            (int code, string output, string error) = Run(["--seed", "1"], NoFile);

            Assert.AreEqual(HeadlessProgram.Misused, code);
            Assert.AreEqual("", output);
            StringAssert.StartsWith(error, "--steps is required.");
            StringAssert.Contains(error, HeadlessCommandLine.Usage);
        }

        [TestMethod]
        public void Run_StartItRefuses_PrintsTheReasonAndFails()
        {
            (int code, string output, string error) = Run(["--seed", "1", "--fixture", "town", "--steps", "1"], NoFile);

            Assert.AreEqual(HeadlessProgram.Failed, code);
            Assert.AreEqual("", output);
            Assert.AreEqual($"A run starts from either a seed or a fixture{Environment.NewLine}", error);
        }

        [TestMethod]
        [DataRow(typeof(FileNotFoundException), DisplayName = "a missing file")]
        [DataRow(typeof(UnauthorizedAccessException), DisplayName = "a file it may not read")]
        public void Run_LogItCannotRead_PrintsTheReasonAndFails(Type problem)
        {
            Exception thrown = (Exception)Activator.CreateInstance(problem, "can't read log.json")!;

            (int code, string output, string error) = Run(["--log", "log.json"], _ => throw thrown);

            Assert.AreEqual(HeadlessProgram.Failed, code);
            Assert.AreEqual("", output);
            Assert.AreEqual($"can't read log.json{Environment.NewLine}", error);
        }

        [TestMethod]
        public void Run_LogThatIsNoLog_PrintsTheReasonAndFails()
        {
            (int code, _, string error) = Run(["--log", "log.json"], _ => "[]");

            Assert.AreEqual(HeadlessProgram.Failed, code);
            StringAssert.StartsWith(error, "A command log is a JSON object");
        }

        // A run that ran to its end but verified nothing prints what it found, then why it fails
        [TestMethod]
        public void Run_LogWithoutCheckpoints_PrintsItsLinesThenFails()
        {
            const string log = "{\"formatVersion\":1,\"seed\":8,\"level\":0,\"entries\":[],\"checkpoints\":[]}";

            (int code, string output, string error) = Run(["--log", "log.json"], _ => log);

            Assert.AreEqual(HeadlessProgram.Failed, code);
            StringAssert.StartsWith(output, "0 commands");
            StringAssert.StartsWith(error, "The log has no checkpoints");
        }
    }
}
