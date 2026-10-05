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
using System.Text.Json.Serialization;

namespace Micropolis.Rules
{
    /// <summary>
    /// A command as it arrived, from the player who sent it. The command is untrusted JSON, which the simulation
    /// validates before it applies it.
    /// </summary>
    public sealed record ReceivedCommand(string Player, JsonNode? Command);

    /// <summary>
    /// What came of a command, and who sent it, as <c>CommandResult</c> in <c>src/protocol.ts</c>: the command as it
    /// arrived, which a rejected one may not be a command, and the reason it was rejected, or null when it wasn't.
    /// </summary>
    public sealed record CommandResult(
        [property: JsonPropertyName("player")] string Player,
        [property: JsonPropertyName("command")] JsonNode? Command,
        [property: JsonPropertyName("outcome")] Outcome Outcome,
        [property: JsonPropertyName("reason")] string? Reason)
    {
        /// <summary>
        /// The result as <see cref="Messages.COMMAND_RESULT"/> carries it, and the wire too, with its own copy of the
        /// command.
        /// </summary>
        public JsonObject ToPayload()
        {
            return ProtocolJson.ToNode(this)!.AsObject();
        }

        /// <summary>
        /// The result a <see cref="ToPayload"/> payload carries. The command is copied as the node it is, not read
        /// through the serializer, which would replace a lone surrogate a player sent.
        /// </summary>
        public static CommandResult FromPayload(JsonNode payload)
        {
            JsonObject result = payload.AsObject();
            Outcome outcome = ProtocolJson.TryParseName((string)result["outcome"]!, out Outcome named)
                ? named
                : throw new InvalidOperationException($"A command result's outcome is one of the protocol's, not {result["outcome"]}.");

            return new CommandResult((string)result["player"]!, result["command"]?.DeepClone(), outcome, (string?)result["reason"]);
        }
    }

    public sealed partial class Simulation
    {
        // The debug menu's grant
        private const long AddedFunds = 20000;

        private IReadOnlyDictionary<ToolName, CityTool>? _tools;

        // The tools that change the city, each staging its edits over this city's map
        private IReadOnlyDictionary<ToolName, CityTool> Tools => _tools ??= CityTools.Create(Map);

        /// <summary>
        /// Applies the commands received since the last call, in the order they arrived. They apply between steps,
        /// separately from them, so a paused city takes them too. Each is validated first, and a rejected one changes
        /// nothing. Each command's result is emitted as <see cref="Messages.COMMAND_RESULT"/>, and returned in the same
        /// order. The simulation never branches on the player.
        /// </summary>
        public IReadOnlyList<CommandResult> ApplyCommands(IReadOnlyList<ReceivedCommand> received)
        {
            List<CommandResult> results = new List<CommandResult>();

            foreach (ReceivedCommand command in received)
            {
                CommandResult result = CommandReader.Read(command.Command, Map.Width, Map.Height) switch
                {
                    AcceptedCommand accepted => new CommandResult(command.Player, command.Command, ApplyCommand(accepted.Command), null),
                    RejectedCommand rejected => new CommandResult(command.Player, command.Command, Outcome.Rejected, rejected.Reason),
                    _ => throw new InvalidOperationException("A command is read as accepted or rejected."),
                };

                Events.Emit(Messages.COMMAND_RESULT, result.ToPayload());
                results.Add(result);
            }

            return results;
        }

        // Applies a valid command, and returns its outcome
        private Outcome ApplyCommand(Command command)
        {
            switch (command)
            {
                case ToolCommand tool:
                    return ApplyTool(tool);

                case SetBudgetCommand budget:
                    // A service left out keeps its funding
                    Budget.SetFunding(budget.Road, budget.Fire, budget.Police);
                    Budget.CityTax = budget.Tax;
                    break;

                case SetSpeedCommand speed:
                    SetSpeed(speed.Speed);
                    break;

                case SetAutoBudgetCommand autoBudget:
                    Budget.AutoBudget = autoBudget.On;
                    break;

                case SetDisastersCommand disasters:
                    DisasterManager.DisastersEnabled = disasters.On;
                    break;

                case TriggerDisasterCommand disaster:
                    TriggerDisaster(disaster.Kind);
                    break;

                case AddFundsCommand:
                    Budget.Spend(-AddedFunds);
                    break;

                default:
                    throw new InvalidOperationException($"No command {command.GetType().Name}.");
            }

            return Outcome.Ok;
        }

        // The tool at each tile of the path in turn, as one click each: the tool draws from the stream, then edits the
        // map and charges the budget if the city can pay. A tile that fails doesn't stop the rest. The outcome is ok
        // when every tile succeeded, and otherwise the first failed tile's.
        private Outcome ApplyTool(ToolCommand command)
        {
            CityTool tool = Tools[command.Tool];
            Outcome outcome = Outcome.Ok;

            foreach (TilePosition tile in command.Path)
            {
                tool.DoTool(tile.X, tile.Y, Random, command.AutoBulldoze);
                tool.ModifyIfEnoughFunding(Budget);

                if (outcome == Outcome.Ok)
                {
                    outcome = tool.Result;
                }
            }

            return outcome;
        }

        private void TriggerDisaster(DisasterKind kind)
        {
            switch (kind)
            {
                case DisasterKind.Monster:
                    SpriteManager.MakeMonster();
                    break;

                case DisasterKind.Fire:
                    DisasterManager.MakeFire();
                    break;

                case DisasterKind.Flood:
                    DisasterManager.MakeFlood();
                    break;

                case DisasterKind.Crash:
                    DisasterManager.MakeCrash();
                    break;

                case DisasterKind.Meltdown:
                    DisasterManager.MakeMeltdown();
                    break;

                case DisasterKind.Tornado:
                    SpriteManager.MakeTornado();
                    break;

                case DisasterKind.Earthquake:
                    DisasterManager.MakeEarthquake();
                    break;
            }
        }
    }
}
