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

using System.Text.Json.Nodes;
using Micropolis.Conformance;
using Micropolis.Rules;
using static Micropolis.Headless.ConformanceText;

namespace Micropolis.Headless
{
    /// <summary>
    /// <c>conformance/commands.json</c>: each of <see cref="CommandCases.All"/> applied to its city, with the result
    /// the simulation gave each command, the payload of its result event, and the state hash the case left. A case
    /// on a blank map holds the state it starts from.
    /// </summary>
    internal static class CommandCasesFile
    {
        public const string FileName = "commands.json";

        // The reasons the cases must reach, told apart by their words, with each number they quote written #. A reason
        // they reach that isn't listed fails too, so a reason the reader gains is listed here, with a case.
        private static readonly IReadOnlyList<string> RejectionReasons =
        [
            "a command nests objects and lists at most # deep",
            "a command is at most # characters of JSON",
            "not a command",
            "the tool command has exactly the fields type, autoBulldoze, path, tool",
            "the setBudget command has exactly the fields type, tax, and may have fire, police, road",
            "the setSpeed command has exactly the fields type, speed",
            "the setAutoBudget command has exactly the fields type, on",
            "the setDisasters command has exactly the fields type, on",
            "the triggerDisaster command has exactly the fields type, kind",
            "the addFunds command has exactly the fields type",
            $"the tool is one of {string.Join(", ", ProtocolJson.Names<ToolName>())}",
            "autoBulldoze is true or false",
            "a tool's path is a list of # to # tiles",
            "tile # of the path is not an {x, y} of whole numbers",
            "tile # of the path, (#, #), is off the #x# map",
            "tile # of the path, (#, #), is not next to the tile before it, (#, #)",
            "the walkway command has exactly the fields type, kind, path",
            $"the walkway is one of {string.Join(", ", ProtocolJson.Names<WalkwayKind>())}",
            "a walkway's path is a list of # to # ninths",
            "ninth # of the path is not an {x, y} of whole numbers",
            "ninth # of the path, (#, #), is off the #x# map's grid of ninths",
            "ninth # of the path, (#, #), is not next to the ninth before it, (#, #)",
            "the erase command has exactly the fields type, path, tool",
            $"the erased tool is one of {string.Join(", ", ProtocolJson.Names<ToolName>().Where(name => name != ProtocolJson.Name(ToolName.Bulldozer)))}",
            "an erase's path is a list of # to # tiles",
            "the eraseWalkway command has exactly the fields type, path",
            "an eraseWalkway's path is a list of # to # ninths",
            "road funding is a whole percent from # to #",
            "fire funding is a whole percent from # to #",
            "police funding is a whole percent from # to #",
            "the tax rate is a whole percent from # to #",
            "the speed is a whole number from # to #",
            "setAutoBudget takes on, true or false",
            "setDisasters takes on, true or false",
            $"the disaster is one of {string.Join(", ", ProtocolJson.Names<DisasterKind>())}",
        ];

        /// <summary>
        /// The file's text, each fixture's city from its built save among <paramref name="saves"/>.
        /// </summary>
        public static string Write(IReadOnlyList<FixtureSave> saves)
        {
            List<JsonNode?> cases = new List<JsonNode?>();
            HashSet<string> outcomes = new HashSet<string>(StringComparer.Ordinal);
            HashSet<string> reasons = new HashSet<string>(StringComparer.Ordinal);

            foreach (CommandCase commandCase in CommandCases.All)
            {
                string start = commandCase.Fixture is string fixture
                    ? FixtureSaves.TextOf(saves, fixture, FixtureSaves.Built)
                    : BlankCity(commandCase.BlankMap!.Value.Width, commandCase.BlankMap.Value.Height);
                Simulation city = Simulation.FromSave(start);

                List<JsonNode?> results = city.ApplyCommands(commandCase.Received
                        .Select(received => new ReceivedCommand(received.Player, received.Command?.DeepClone()))
                        .ToList())
                    .Select((result, i) => (JsonNode?)new JsonObject
                    {
                        ["player"] = result.Player,
                        ["command"] = commandCase.Received[i].Command?.DeepClone(),
                        ["outcome"] = ProtocolJson.Name(result.Outcome),
                        ["reason"] = result.Reason,
                    })
                    .ToList();

                foreach (JsonNode? result in results)
                {
                    outcomes.Add((string)result!["outcome"]!);

                    if ((string?)result["reason"] is string reason)
                    {
                        reasons.Add(ReasonWords(reason));
                    }
                }

                JsonObject written = new JsonObject { ["description"] = commandCase.Description };

                if (commandCase.Fixture is string named)
                {
                    written["fixture"] = named;
                }
                else
                {
                    written["state"] = JsonText.Parse(start);
                }

                written["results"] = new JsonArray(results.ToArray());
                written["hash"] = StateHash.HashSavedState(city.Save());
                cases.Add(written);
            }

            foreach (string outcome in ProtocolJson.Names<Outcome>())
            {
                EnsureCovers(outcomes.Contains(outcome), $"the outcome {outcome}");
            }

            EnsureReasonsCovered(reasons, RejectionReasons, "a command is rejected for");

            return JsonLines.FileOf(["{", .. JsonLines.ListMember("cases", cases, true), "}"]);
        }

        // The canonical text of a new city on a blank map of the size given, at the easy level and medium speed, from
        // seed 0's stream
        private static string BlankCity(int width, int height)
        {
            return CanonicalJson.Write(Simulation.NewCity(new GameMap(width, height), 0, Level.Easy, Speed.Medium).Save());
        }
    }
}
