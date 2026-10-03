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

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The sprites, the disasters and the transport handlers, proven call by call against the TypeScript's traces.
    /// </summary>
    [TestClass]
    public sealed class TraceTests
    {
        public static IEnumerable<object[]> AllTraces => TraceRunner.Names().Select(name => new object[] { name });

        [TestMethod]
        [DynamicData(nameof(AllTraces))]
        public void Run_EveryTrace_MatchesTypeScript(string name)
        {
            Assert.IsNull(TraceRunner.Run(TraceRunner.Read(name)));
        }

        // A hash changed in the trace stands for a state the C# reached differently: the run names that call. Any call
        // would do; 37 is one well into the run.
        [TestMethod]
        public void Run_HashTampered_NamesTheCall()
        {
            JsonObject trace = TraceRunner.Read("tornado");
            JsonObject call = trace["calls"]![37]!.AsObject();
            call["hash"] = "000000000000";

            string? difference = TraceRunner.Run(trace);

            StringAssert.StartsWith(difference, "Call 37 of the trace tornado, spriteManager.moveObjects(), the first to differ:");
        }

        // A call changed in the trace stands for a call the C# took differently: the run names that call
        [TestMethod]
        public void Run_CallChanged_NamesTheCall()
        {
            JsonObject trace = TraceRunner.Read("calamities");
            JsonArray calls = trace["calls"]!.AsArray();
            int changed = calls.Select((call, i) => (call, i)).First(entry => (string)entry.call!["unit"]! == "spriteManager.makeExplosion").i;
            JsonArray args = calls[changed]!["args"]!.AsArray();
            int x = (int)args[0]! + 1;
            int y = (int)args[1]!;
            args[0] = x;

            string? difference = TraceRunner.Run(trace);

            StringAssert.StartsWith(difference, $"Call {changed} of the trace calamities, spriteManager.makeExplosion({x}, {y}), the first to differ: the state hash");
        }

        // An event changed in the trace: the run names the call and the event
        [TestMethod]
        public void Run_EventTampered_NamesTheCallAndTheEvent()
        {
            JsonObject trace = TraceRunner.Read("tornado");
            JsonObject sighting = trace["calls"]![0]!["events"]![0]!.AsObject();
            sighting["name"] = "Not an event";

            string? difference = TraceRunner.Run(trace);

            StringAssert.StartsWith(difference, "Call 0 of the trace tornado, spriteManager.makeTornado(), the first to differ: Event 0 differs");
        }

        // A hash shorter than the generator keeps would match any state's hash that begins with it
        [TestMethod]
        public void Run_HashShortened_Throws()
        {
            JsonObject trace = TraceRunner.Read("tornado");
            JsonObject call = trace["calls"]![37]!.AsObject();
            call["hash"] = "";

            InvalidDataException exception = Assert.Throws<InvalidDataException>(() => TraceRunner.Run(trace));

            StringAssert.StartsWith(exception.Message, "Call 37 of the trace tornado keeps a hash of 0 digits");
        }
    }
}
