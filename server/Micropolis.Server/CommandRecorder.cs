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
using Micropolis.Rules;

namespace Micropolis.Server
{
    /// <summary>
    /// Records a city's session log as its command queue drives it, as <c>CommandRecorder</c> in
    /// <c>src/commandLog.ts</c> does in the browser, in the format <c>docs/command-log.md</c> specifies: each command as
    /// it applies, and a checkpoint of the state hash just before each step that is a whole number of intervals in,
    /// step 0 included.
    /// </summary>
    internal sealed class CommandRecorder
    {
        private readonly Simulation _city;
        private readonly JsonObject _start;
        private readonly List<(long Step, ReceivedCommand Command)> _entries = new List<(long, ReceivedCommand)>();
        private readonly List<(long Step, string Hash)> _checkpoints = new List<(long, string)>();

        // The step the city has reached: the one after the last it took
        private long _reached;

        /// <param name="start">Where the log's city starts, the members a log gives it: <c>seed</c> and
        /// <c>level</c>, or <c>save</c>.</param>
        public CommandRecorder(Simulation city, JsonObject start)
        {
            _city = city;
            _start = start;
        }

        /// <summary>
        /// The start of a log whose city is a new city on the seed's map at the level.
        /// </summary>
        public static JsonObject NewCityStart(uint seed, Level level)
        {
            return new JsonObject { ["seed"] = seed, ["level"] = (int)level };
        }

        /// <summary>
        /// The start of a log whose city is the one given, as it stands: its saved state.
        /// </summary>
        public static JsonObject SavedStart(Simulation city)
        {
            return new JsonObject { ["save"] = city.Save() };
        }

        public void Applied(long step, ReceivedCommand command)
        {
            _entries.Add((step, command));
        }

        public void BeforeStep(long step)
        {
            if (step % CommandLogFormat.CheckpointInterval == 0)
            {
                _checkpoints.Add((step, Hash()));
            }

            _reached = step + 1;
        }

        /// <summary>
        /// The log so far, ending with a checkpoint of the city now, at the step it has reached, which no step has yet
        /// been taken from.
        /// </summary>
        public JsonObject Log()
        {
            JsonObject log = new JsonObject { ["formatVersion"] = CommandLogFormat.Version };

            foreach ((string key, JsonNode? value) in _start)
            {
                log[key] = value?.DeepClone();
            }

            log["entries"] = new JsonArray(_entries.Select(entry => (JsonNode?)new JsonObject
            {
                ["step"] = entry.Step,
                ["player"] = entry.Command.Player,
                ["command"] = entry.Command.Command?.DeepClone(),
            }).ToArray());

            log["checkpoints"] = new JsonArray(_checkpoints.Append((Step: _reached, Hash: Hash())).Select(checkpoint => (JsonNode?)new JsonObject
            {
                ["step"] = checkpoint.Step,
                ["hash"] = checkpoint.Hash,
            }).ToArray());

            return log;
        }

        private string Hash()
        {
            return StateHash.HashSavedState(_city.Save());
        }
    }
}
