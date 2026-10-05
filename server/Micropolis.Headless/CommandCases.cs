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

using System.Globalization;
using System.Text.Json.Nodes;
using Micropolis.Rules;

namespace Micropolis.Headless
{
    /// <summary>
    /// Commands applied in order to one city, which <c>conformance/commands.json</c> lists with the result the
    /// simulation gave each: the city is a fixture's built save, or a new city on a blank map of
    /// <paramref name="BlankMap"/>'s size, when <paramref name="Fixture"/> is <see langword="null"/>.
    /// </summary>
    public sealed record CommandCase(string Description, string? Fixture, (int Width, int Height)? BlankMap, IReadOnlyList<ReceivedCommand> Received)
    {
        public override string ToString()
        {
            return Description;
        }
    }

    /// <summary>
    /// The cases of <c>conformance/commands.json</c>. Between them they reach every reason
    /// <see cref="CommandReader"/> rejects a command for, and every outcome. A command is written as the JSON text a
    /// player sends, read as <see cref="JsonText"/> reads it, or built where its length is what it tests.
    /// </summary>
    public static class CommandCases
    {
        // Another player, whose commands the simulation treats as any player's
        private const string OtherPlayer = "ada";

        // The small map whose commands' longest is short enough to list one either side of it
        private const int SmallWidth = 8;
        private const int SmallHeight = 8;

        private static readonly int SmallMax = CommandReader.MaxCommandLength(SmallWidth, SmallHeight);

        public static readonly IReadOnlyList<CommandCase> All =
        [
            new CommandCase("What is not a command, and commands with the wrong fields", "suburb", null, Local(
                J("null"), J("[]"), J("\"tool\""), J("7"), J("true"), J("{}"), J("""{"type":5}"""), J("""{"type":null}"""),
                J("""{"type":"build"}"""), J("""{"type":"Tool"}"""), J("""{"kind":"fire"}"""),
                J("""{"type":"tool"}"""),
                J("""{"type":"tool","tool":"road","path":[{"x":1,"y":1}],"autoBulldoze":true,"speed":2}"""),
                J("""{"type":"setBudget"}"""),
                J("""{"type":"setBudget","tax":7,"roads":100}"""),
                J("""{"type":"setSpeed","speed":1,"on":true}"""),
                J("""{"type":"setAutoBudget"}"""),
                J("""{"type":"setDisasters","on":true,"kind":"fire"}"""),
                J("""{"type":"triggerDisaster"}"""),
                J("""{"type":"addFunds","amount":20000}"""),
                J("""{"type":"addFunds","__proto__":1}"""),
                // The command is the first level, so a pad nested 63 deep is read on, and one 64 deep is too deep
                J($$"""{"type":"addFunds","pad":{{Nested(63)}}}"""),
                J($$"""{"type":"addFunds","pad":{{Nested(64)}}}"""))),

            new CommandCase("Tool commands rejected for their tool, their setting or their path", "suburb", null, Local(
                Tool("\"hammer\"", Path(Tile(1, 1))), Tool("\"Road\"", Path(Tile(1, 1))), Tool("3", Path(Tile(1, 1))),
                Tool("null", Path(Tile(1, 1))),
                Tool("\"road\"", Path(Tile(1, 1)), "\"yes\""), Tool("\"road\"", Path(Tile(1, 1)), "1"),
                Tool("\"road\"", Path(Tile(1, 1)), "null"),
                Tool("\"road\"", "{}"), Tool("\"road\"", "[]"), Tool("\"road\"", "\"1,1\""), Tool("\"road\"", "null"),
                Tool("\"road\"", "[5]"), Tool("\"road\"", "[[1,1]]"), Tool("\"road\"", "[null]"),
                Tool("\"road\"", """[{"x":1}]"""), Tool("\"road\"", """[{"x":1,"y":1,"z":1}]"""),
                Tool("\"road\"", """[{"x":1,"y":1,"type":"tile"}]"""),
                Tool("\"road\"", """[{"x":1.5,"y":1}]"""),
                Tool("\"road\"", """[{"x":"1","y":1}]"""), Tool("\"road\"", """[{"x":1,"y":null}]"""),
                Tool("\"road\"", """[{"x":1,"y":true}]"""),
                Tool("\"road\"", Path(Tile(120, 0))), Tool("\"road\"", Path(Tile(0, 100))), Tool("\"road\"", Path(Tile(-1, 5))),
                Tool("\"road\"", """[{"x":1e21,"y":0}]"""), Tool("\"road\"", """[{"x":0,"y":-1e21}]"""),
                Tool("\"road\"", Path(Tile(1, 1), Tile(2, 2))), Tool("\"road\"", Path(Tile(1, 1), Tile(1, 1))),
                Tool("\"road\"", Path(Tile(1, 1), Tile(1, 2), Tile(1, 4))),
                Tool("\"road\"", Path(Tile(1, 1), Tile(1, 2), """{"x":1.5,"y":2}""")),
                Tool("\"road\"", Path(Tile(119, 99), Tile(120, 99))))),

            new CommandCase("Settings commands rejected for a value out of range or of the wrong kind", "suburb", null, Local(
                J("""{"type":"setBudget","tax":21}"""), J("""{"type":"setBudget","tax":-1}"""), J("""{"type":"setBudget","tax":7.5}"""),
                J("""{"type":"setBudget","tax":"7"}"""), J("""{"type":"setBudget","tax":null}"""),
                J("""{"type":"setBudget","road":101,"tax":7}"""), J("""{"type":"setBudget","fire":-1,"tax":7}"""),
                J("""{"type":"setBudget","police":50.5,"tax":7}"""), J("""{"type":"setBudget","road":"50","tax":7}"""),
                J("""{"type":"setBudget","road":null,"tax":7}"""), J("""{"type":"setBudget","police":101,"fire":101,"tax":99}"""),
                J("""{"type":"setSpeed","speed":4}"""), J("""{"type":"setSpeed","speed":-1}"""), J("""{"type":"setSpeed","speed":1.5}"""),
                J("""{"type":"setSpeed","speed":"2"}"""), J("""{"type":"setSpeed","speed":null}"""),
                J("""{"type":"setAutoBudget","on":1}"""), J("""{"type":"setAutoBudget","on":"true"}"""),
                J("""{"type":"setAutoBudget","on":null}"""),
                J("""{"type":"setDisasters","on":0}"""), J("""{"type":"setDisasters","on":"false"}"""),
                // No disaster kind, and one in the wrong case
                J("""{"type":"triggerDisaster","kind":"volcano"}"""), J("""{"type":"triggerDisaster","kind":"Fire"}"""),
                J("""{"type":"triggerDisaster","kind":1}"""))),

            new CommandCase("Commands the simulation applies, from two players, with fields in any order", "suburb", null,
            [
                .. Local(
                    J("""{"type":"setBudget","tax":9}"""),
                    J("""{"type":"setBudget","road":50,"fire":0,"police":100,"tax":0}"""),
                    J("""{"tax":20,"police":75,"type":"setBudget"}"""),
                    J("""{"type":"setSpeed","speed":3}"""), J("""{"type":"setSpeed","speed":3}"""), J("""{"type":"setSpeed","speed":0}"""),
                    J("""{"type":"setAutoBudget","on":false}"""), J("""{"type":"setAutoBudget","on":true}"""),
                    J("""{"type":"setDisasters","on":true}"""), J("""{"type":"setDisasters","on":false}""")),
                new ReceivedCommand(OtherPlayer, J("""{"type":"addFunds"}""")),
                new ReceivedCommand(OtherPlayer, J("""{"autoBulldoze":false,"path":[{"x":62,"y":31}],"tool":"park","type":"tool"}""")),
            ]),

            new CommandCase("Tool commands with each outcome: ok, failed, needing the bulldozer, on water, and with no money", "suburbBroke", null, Local(
                // A road across open ground
                Tool("\"road\"", Path(Tile(52, 31), Tile(53, 31), Tile(54, 31)), "false"),
                // Across open ground into trees, which it can't clear without auto-bulldoze: the outcome is the tile
                // that failed
                Tool("\"road\"", Path(Tile(61, 32), Tile(61, 31), Tile(61, 30)), "false"),
                // A zone where trees stand
                Tool("\"residential\"", Path(Tile(54, 24)), "false"),
                // A zone on trees, shore and river, with auto-bulldoze: the trees come first, but the river decides
                Tool("\"residential\"", Path(Tile(102, 10)), "true"),
                // A zone off the map's edge
                Tool("\"industrial\"", Path(Tile(0, 50)), "true"),
                // More than the city has: refused for want of money, after the road it could pay for
                Tool("\"airport\"", Path(Tile(66, 36)), "true"),
                Tool("\"road\"", Path(Tile(60, 40), Tile(61, 40)), "false"))),

            new CommandCase("Commands as long as a command may be on a small map, and one longer", null, (SmallWidth, SmallHeight), Local(
            [
                TypeOfLength(SmallMax, "x"),
                TypeOfLength(SmallMax + 1, "x"),
                // Each escaped character counts as JSON.stringify writes it, either side of the longest
                .. new[] { "\n", "\"", "\\", "\u0001", "\u001f", "\ud800", "\udfff", "😀", "é" }
                    .SelectMany(character => new[] { TypeOfLength(SmallMax, character), TypeOfLength(SmallMax + 1, character) }),
                // In a key as in a value
                .. new[] { "\n", "\ud800", "😀" }
                    .SelectMany(character => new[] { KeyOfLength(SmallMax, character), KeyOfLength(SmallMax + 1, character) }),
                // And each number as Number::toString writes it
                NumbersOfLength(SmallMax), NumbersOfLength(SmallMax + 1),
                // A path longer than the map has tiles, and a tile off the small map
                Tool("\"road\"", Path(Enumerable.Repeat(Tile(0, 0), SmallWidth * SmallHeight + 1).ToArray())),
                Tool("\"road\"", Path(Tile(8, 0))),
                // A command the small map takes
                Tool("\"road\"", Path(Tile(0, 0), Tile(1, 0)), "false"),
            ])),

            // Each disaster triggered alone, so the hash after it shows what it did: the meltdown in the broke suburb,
            // which has a nuclear plant, and every other in the town
            .. Enum.GetValues<DisasterKind>().Select(kind => new CommandCase(
                $"{Article(ProtocolJson.Name(kind))} {ProtocolJson.Name(kind)} triggered", kind == DisasterKind.Meltdown ? "suburbBroke" : "town", null,
                Local(J($$"""{"type":"triggerDisaster","kind":"{{ProtocolJson.Name(kind)}}"}""")))),
        ];

        // The article before the noun, by its first letter
        private static string Article(string noun)
        {
            return "aeiou".Contains(noun[0]) ? "An" : "A";
        }

        // Commands as single player sends them
        private static IReadOnlyList<ReceivedCommand> Local(params JsonNode?[] commands)
        {
            return commands.Select(command => new ReceivedCommand(PlayerIds.Local, command)).ToList();
        }

        // A value as a player sends it, read from its JSON text
        private static JsonNode? J(string json)
        {
            return JsonText.Parse(json);
        }

        // A tool command, from the JSON text of its tool, path and setting
        private static JsonNode? Tool(string tool, string path, string autoBulldoze = "true")
        {
            return J($$"""{"type":"tool","tool":{{tool}},"path":{{path}},"autoBulldoze":{{autoBulldoze}}}""");
        }

        // A tile's JSON text, its numbers as JSON writes them whatever the machine's culture, which may write a minus
        // sign other than the hyphen JSON reads
        internal static string Tile(int x, int y)
        {
            return string.Create(CultureInfo.InvariantCulture, $$"""{"x":{{x}},"y":{{y}}}""");
        }

        private static string Path(params string[] tiles)
        {
            return $"[{string.Join(",", tiles)}]";
        }

        // Lists nested this many deep, an object innermost
        private static string Nested(int levels)
        {
            return new string('[', levels - 1) + "{}" + new string(']', levels - 1);
        }

        // A command whose JSON is exactly the length given: a type that is no command, of the character given
        // repeated, which JSON.stringify may write escaped, and then "x"s to make the length up
        private static JsonNode? TypeOfLength(int length, string character)
        {
            int frame = Length(new JsonObject { ["type"] = "" });
            int written = ConformanceText.Stringify(character).Length - 2;
            int count = (length - frame) / written;
            return Exactly(length, new JsonObject { ["type"] = Repeat(character, count) + new string('x', length - frame - count * written) });
        }

        // The same with the characters in a key of the command rather than its type
        private static JsonNode? KeyOfLength(int length, string character)
        {
            int frame = Length(new JsonObject { ["type"] = "x", [""] = 0 });
            int written = ConformanceText.Stringify(character).Length - 2;
            int count = (length - frame) / written;
            return Exactly(length, new JsonObject { ["type"] = "x", [Repeat(character, count) + new string('x', length - frame - count * written)] = 0 });
        }

        // A command that is no command, padded to the length given by numbers, which JSON.stringify writes as
        // Number::toString does, and then "x"s
        private static JsonNode? NumbersOfLength(int length)
        {
            string[] numbers = ["1e21", "1.5e-7", "123.456", "-0.000001", "1e-7", "9007199254740992", "100"];
            JsonArray pad = new JsonArray();

            JsonObject Padded(string s)
            {
                return new JsonObject { ["type"] = "x", ["pad"] = J(ConformanceText.Stringify(pad)), ["s"] = s };
            }

            while (Length(Padded("")) + 30 < length)
            {
                pad.Add(J(numbers[pad.Count % numbers.Length]));
            }

            return Exactly(length, Padded(new string('x', length - Length(Padded("")))));
        }

        private static int Length(JsonNode command)
        {
            return ConformanceText.Stringify(command).Length;
        }

        private static string Repeat(string text, int count)
        {
            return string.Concat(Enumerable.Repeat(text, count));
        }

        // The command read back from its text, as a player's arrives, once it is checked to be the length meant
        private static JsonNode? Exactly(int length, JsonNode command)
        {
            string text = ConformanceText.Stringify(command);

            if (text.Length != length)
            {
                throw new InvalidOperationException($"A command meant to be {length} long is {text.Length}");
            }

            return J(text);
        }
    }
}
