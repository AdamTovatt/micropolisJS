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
                J("""{"type":"walkway"}"""),
                J("""{"type":"walkway","kind":"path","path":[{"x":1,"y":1}],"autoBulldoze":true}"""),
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

            // The map's grid of ninths is three times its tiles across and down, 360 by 300
            new CommandCase("Walkway commands rejected for their kind or their path", "suburb", null, Local(
                Walkway("\"gravel\"", Path(Ninth(1, 1))), Walkway("\"Path\"", Path(Ninth(1, 1))), Walkway("1", Path(Ninth(1, 1))),
                Walkway("null", Path(Ninth(1, 1))),
                Walkway("\"path\"", "{}"), Walkway("\"path\"", "[]"), Walkway("\"path\"", "null"), Walkway("\"path\"", "[[1,1]]"),
                Walkway("\"path\"", """[{"x":1}]"""), Walkway("\"path\"", """[{"x":1.5,"y":1}]"""),
                Walkway("\"path\"", Path(Ninth(360, 0))), Walkway("\"path\"", Path(Ninth(0, 300))), Walkway("\"path\"", Path(Ninth(-1, 5))),
                Walkway("\"path\"", Path(Ninth(1, 1), Ninth(2, 2))), Walkway("\"path\"", Path(Ninth(1, 1), Ninth(1, 1))),
                Walkway("\"path\"", Path(Ninth(359, 299), Ninth(360, 299))))),

            new CommandCase("Walkway commands with each outcome: ok, needing the bulldozer and on water", "suburb", null, Local(
                // Across bare land and on, which it pays for once, ninth by ninth across a tile's edge
                Walkway("\"path\"", Path(Ninth(156, 93), Ninth(157, 93), Ninth(158, 93), Ninth(159, 93))),
                Walkway("\"path\"", Path(Ninth(158, 93), Ninth(159, 93), Ninth(160, 93))),
                // A sidewalk along the edge of a tile of the town's road, and on into a zone, which takes none
                Walkway("\"path\"", Path(Ninth(60, 45), Ninth(60, 44), Ninth(60, 43))),
                // Off the shore onto the river east of the open land
                Walkway("\"path\"", Path(Ninth(237, 42), Ninth(238, 42), Ninth(239, 42), Ninth(240, 42), Ninth(241, 42), Ninth(242, 42),
                                         Ninth(243, 42), Ninth(244, 42), Ninth(245, 42), Ninth(246, 42), Ninth(247, 42), Ninth(248, 42))))),

            new CommandCase("Erase commands rejected for their tool or their path", "suburb", null, Local(
                J("""{"type":"erase","tool":"road"}"""), J("""{"type":"erase","tool":"road","path":[{"x":1,"y":1}],"autoBulldoze":true}"""),
                J("""{"type":"eraseWalkway"}"""), J("""{"type":"eraseWalkway","kind":"path","path":[{"x":1,"y":1}]}"""),
                Erase("\"bulldozer\"", Path(Tile(1, 1))), Erase("\"query\"", Path(Tile(1, 1))), Erase("null", Path(Tile(1, 1))),
                Erase("\"road\"", "[]"), Erase("\"road\"", Path(Tile(120, 0))), Erase("\"road\"", Path(Tile(1, 1), Tile(2, 2))),
                EraseWalkway("[]"), EraseWalkway(Path(Ninth(360, 0))), EraseWalkway(Path(Ninth(1, 1), Ninth(1, 1))))),

            // The suburb's road runs along row 15, a commercial zone centred at (21, 13) north of it and an industrial one
            // centred at (21, 17) south of it
            new CommandCase("Erase commands with each outcome: ok and failed for want of what the tool puts down", "suburb", null, Local(
                // The road off a tile, then again off the bare land it left; and no wire on the road
                Erase("\"road\"", Path(Tile(20, 15))), Erase("\"road\"", Path(Tile(20, 15))), Erase("\"wire\"", Path(Tile(18, 15))),
                // A commercial zone is no residential one, and its own eraser blows it up, as the industrial one's does
                Erase("\"residential\"", Path(Tile(20, 14))), Erase("\"commercial\"", Path(Tile(20, 14))),
                Erase("\"industrial\"", Path(Tile(20, 16))),
                // A path laid, two of its ninths erased, then one of them again, which holds none
                Walkway("\"path\"", Path(Ninth(156, 93), Ninth(157, 93), Ninth(158, 93), Ninth(159, 93))),
                EraseWalkway(Path(Ninth(157, 93), Ninth(158, 93))), EraseWalkway(Path(Ninth(157, 93))))),

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
                // A walkway path of one more ninth than the map has tiles, back and forth, and one as long, which it takes
                Walkway("\"path\"", Path(BackAndForth(SmallWidth * SmallHeight + 1))),
                Walkway("\"path\"", Path(BackAndForth(SmallWidth * SmallHeight))),
                // And the same for the erasers, a tile's path and a ninth's
                Erase("\"road\"", Path(Enumerable.Repeat(Tile(0, 0), SmallWidth * SmallHeight + 1).ToArray())),
                EraseWalkway(Path(BackAndForth(SmallWidth * SmallHeight + 1))),
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

        // A walkway command, from the JSON text of its kind and path
        private static JsonNode? Walkway(string kind, string path)
        {
            return J($$"""{"type":"walkway","kind":{{kind}},"path":{{path}}}""");
        }

        // A tile's JSON text, its numbers as JSON writes them whatever the machine's culture, which may write a minus
        // sign other than the hyphen JSON reads
        internal static string Tile(int x, int y)
        {
            return string.Create(CultureInfo.InvariantCulture, $$"""{"x":{{x}},"y":{{y}}}""");
        }

        // An erase command, from the JSON text of its tool and path
        private static JsonNode? Erase(string tool, string path)
        {
            return J($$"""{"type":"erase","tool":{{tool}},"path":{{path}}}""");
        }

        // An eraseWalkway command, from the JSON text of its path
        private static JsonNode? EraseWalkway(string path)
        {
            return J($$"""{"type":"eraseWalkway","path":{{path}}}""");
        }

        // A ninth's JSON text, on the map's grid of ninths, written as a tile's is
        private static string Ninth(int x, int y)
        {
            return Tile(x, y);
        }

        // The ninths of a path going back and forth between the map's first two ninths, as many as given
        private static string[] BackAndForth(int ninths)
        {
            return Enumerable.Range(0, ninths).Select(ninth => Ninth(ninth % 2, 0)).ToArray();
        }

        private static string Path(params string[] places)
        {
            return $"[{string.Join(",", places)}]";
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
            int written = CanonicalJson.Stringify(character).Length - 2;
            int count = (length - frame) / written;
            return Exactly(length, new JsonObject { ["type"] = Repeat(character, count) + new string('x', length - frame - count * written) });
        }

        // The same with the characters in a key of the command rather than its type
        private static JsonNode? KeyOfLength(int length, string character)
        {
            int frame = Length(new JsonObject { ["type"] = "x", [""] = 0 });
            int written = CanonicalJson.Stringify(character).Length - 2;
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
                return new JsonObject { ["type"] = "x", ["pad"] = J(CanonicalJson.Stringify(pad)), ["s"] = s };
            }

            while (Length(Padded("")) + 30 < length)
            {
                pad.Add(J(numbers[pad.Count % numbers.Length]));
            }

            return Exactly(length, Padded(new string('x', length - Length(Padded("")))));
        }

        private static int Length(JsonNode command)
        {
            return CanonicalJson.Stringify(command).Length;
        }

        private static string Repeat(string text, int count)
        {
            return string.Concat(Enumerable.Repeat(text, count));
        }

        // The command read back from its text, as a player's arrives, once it is checked to be the length meant
        private static JsonNode? Exactly(int length, JsonNode command)
        {
            string text = CanonicalJson.Stringify(command);

            if (text.Length != length)
            {
                throw new InvalidOperationException($"A command meant to be {length} long is {text.Length}");
            }

            return J(text);
        }
    }
}
