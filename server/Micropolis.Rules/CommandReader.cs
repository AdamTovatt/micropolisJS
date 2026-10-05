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
using static Micropolis.Rules.Validation;

namespace Micropolis.Rules
{
    /// <summary>
    /// What reading a command as it arrived came to: the command, or why the simulation rejects it.
    /// </summary>
    public abstract record CommandReading;

    public sealed record AcceptedCommand(Command Command) : CommandReading;

    public sealed record RejectedCommand(string Reason) : CommandReading;

    /// <summary>
    /// Reads the commands a player sends the simulation. They arrive untrusted: a valid command is exactly its type's
    /// fields, each in the range the game offers, and anything else is rejected with the reason it fails, which a
    /// command's result carries.
    /// </summary>
    public static class CommandReader
    {
        // The ranges the budget window offers, in whole percent
        public const int MaxFundingPercent = 100;
        public const int MaxTaxPercent = 20;

        public const int MaxSpeed = (int)Speed.Fast;

        /// <summary>
        /// The most objects and lists a command may nest, the command itself the first.
        /// </summary>
        public const int MaxCommandDepth = 64;

        // Each command's fields but its type, required or optional
        private static readonly IReadOnlyDictionary<string, IReadOnlyDictionary<string, bool>> CommandFields =
            new Dictionary<string, IReadOnlyDictionary<string, bool>>(StringComparer.Ordinal)
            {
                ["tool"] = Fields(required: ["autoBulldoze", "path", "tool"]),
                ["setBudget"] = Fields(required: ["tax"], optional: ["fire", "police", "road"]),
                ["setSpeed"] = Fields(required: ["speed"]),
                ["setAutoBudget"] = Fields(required: ["on"]),
                ["setDisasters"] = Fields(required: ["on"]),
                ["triggerDisaster"] = Fields(required: ["kind"]),
                ["addFunds"] = Fields(),
            };

        // The services a setBudget command may fund, in the order the budget funds them
        private static readonly IReadOnlyList<string> Services = ["road", "fire", "police"];

        /// <summary>
        /// The longest a command may be, as the JSON text <c>JSON.stringify</c> writes for it, in UTF-16 code units:
        /// room for a tool command whose path covers the whole map.
        /// </summary>
        public static int MaxCommandLength(int width, int height)
        {
            return 32 * width * height + 1024;
        }

        /// <summary>
        /// Why the command is too deep or too long to be one on a map of this size, or null when it is neither, which
        /// <see cref="Read"/> checks before anything else, so these checks bound what a command's result echoes.
        /// </summary>
        public static string? BoundsRejection(JsonNode? command, int width, int height)
        {
            if (NestsDeeperThan(command, MaxCommandDepth))
            {
                return $"a command nests objects and lists at most {MaxCommandDepth} deep";
            }

            int maxLength = MaxCommandLength(width, height);

            if (CanonicalJson.Stringify(command).Length > maxLength)
            {
                return $"a command is at most {maxLength} characters of JSON";
            }

            return null;
        }

        /// <summary>
        /// The command, or why the simulation rejects it on a map of this size. A reason quotes no value from the
        /// command but a coordinate already checked to be a number, so a hostile command can't make it long.
        /// </summary>
        public static CommandReading Read(JsonNode? command, int width, int height)
        {
            if (BoundsRejection(command, width, height) is string outOfBounds)
            {
                return new RejectedCommand(outOfBounds);
            }

            if (command is not JsonObject fields || !TryGetString(fields["type"], out string? type) ||
                !CommandFields.TryGetValue(type!, out IReadOnlyDictionary<string, bool>? rules))
            {
                return new RejectedCommand("not a command");
            }

            if (!HasFields(fields, rules, "type"))
            {
                return new RejectedCommand(FieldsReason($"the {type} command", rules));
            }

            return type switch
            {
                "tool" => ReadTool(fields, width, height),
                "setBudget" => ReadSetBudget(fields),
                "setSpeed" => TryGetWholeNumberIn(fields["speed"], 0, MaxSpeed, out long speed)
                    ? new AcceptedCommand(new SetSpeedCommand((Speed)speed))
                    : new RejectedCommand($"the speed is a whole number from 0 to {MaxSpeed}"),
                "setAutoBudget" => TryGetBoolean(fields["on"], out bool autoBudget)
                    ? new AcceptedCommand(new SetAutoBudgetCommand(autoBudget))
                    : new RejectedCommand("setAutoBudget takes on, true or false"),
                "setDisasters" => TryGetBoolean(fields["on"], out bool disasters)
                    ? new AcceptedCommand(new SetDisastersCommand(disasters))
                    : new RejectedCommand("setDisasters takes on, true or false"),
                "triggerDisaster" => TryGetName(fields["kind"], out DisasterKind kind)
                    ? new AcceptedCommand(new TriggerDisasterCommand(kind))
                    : new RejectedCommand($"the disaster is one of {string.Join(", ", ProtocolJson.Names<DisasterKind>())}"),
                "addFunds" => new AcceptedCommand(new AddFundsCommand()),
                _ => throw new InvalidOperationException($"The {type} command has fields but no reading."),
            };
        }

        /// <summary>
        /// Why the funding a setBudget command or a budgetForecast query names is out of range, or null when each
        /// service it names is at a whole percent the budget window offers.
        /// </summary>
        public static string? FundingRejection(JsonObject message)
        {
            foreach (string service in Services)
            {
                if (message.ContainsKey(service) && !TryGetWholeNumberIn(message[service], 0, MaxFundingPercent, out _))
                {
                    return $"{service} funding is a whole percent from 0 to {MaxFundingPercent}";
                }
            }

            return null;
        }

        /// <summary>
        /// Why the tax rate a setBudget command or a budgetForecast query names is out of range, or null when it names
        /// none or a whole percent the budget window offers. A setBudget command's fields always name one.
        /// </summary>
        public static string? TaxRejection(JsonObject message)
        {
            return message.ContainsKey("tax") && !TryGetWholeNumberIn(message["tax"], 0, MaxTaxPercent, out _)
                ? $"the tax rate is a whole percent from 0 to {MaxTaxPercent}"
                : null;
        }

        private static CommandReading ReadTool(JsonObject fields, int width, int height)
        {
            if (!TryGetName(fields["tool"], out ToolName tool))
            {
                return new RejectedCommand($"the tool is one of {string.Join(", ", ProtocolJson.Names<ToolName>())}");
            }

            if (!TryGetBoolean(fields["autoBulldoze"], out bool autoBulldoze))
            {
                return new RejectedCommand("autoBulldoze is true or false");
            }

            string? pathReason = ReadPath(fields["path"], width, height, out List<TilePosition> path);

            return pathReason is null ? new AcceptedCommand(new ToolCommand(tool, path, autoBulldoze)) : new RejectedCommand(pathReason);
        }

        private static string? ReadPath(JsonNode? value, int width, int height, out List<TilePosition> path)
        {
            path = new List<TilePosition>();

            // A path longer than the map has tiles must revisit one
            if (value is not JsonArray tiles || tiles.Count == 0 || tiles.Count > width * height)
            {
                return $"a tool's path is a list of 1 to {width * height} tiles";
            }

            for (int i = 0; i < tiles.Count; i++)
            {
                if (tiles[i] is not JsonObject tile || !HasFields(tile, TileFields, null) ||
                    !TryGetWholeNumber(tile["x"], out double x) || !TryGetWholeNumber(tile["y"], out double y))
                {
                    return $"tile {i} of the path is not an {{x, y}} of whole numbers";
                }

                if (x < 0 || x > width - 1 || y < 0 || y > height - 1)
                {
                    return $"tile {i} of the path, ({CanonicalJson.FormatNumber(x)}, {CanonicalJson.FormatNumber(y)}), is off the {width}x{height} map";
                }

                TilePosition position = new TilePosition((int)x, (int)y);

                if (i > 0)
                {
                    TilePosition last = path[i - 1];

                    if (Math.Abs(position.X - last.X) + Math.Abs(position.Y - last.Y) != 1)
                    {
                        return $"tile {i} of the path, ({position.X}, {position.Y}), is not next to the tile before it, ({last.X}, {last.Y})";
                    }
                }

                path.Add(position);
            }

            return null;
        }

        private static CommandReading ReadSetBudget(JsonObject fields)
        {
            string? reason = FundingRejection(fields) ?? TaxRejection(fields);

            if (reason is not null)
            {
                return new RejectedCommand(reason);
            }

            return new AcceptedCommand(new SetBudgetCommand(CheckedWholeNumber(fields, "road"), CheckedWholeNumber(fields, "fire"),
                CheckedWholeNumber(fields, "police"), CheckedWholeNumber(fields, "tax")!.Value));
        }

    }
}
