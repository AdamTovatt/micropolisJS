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
    /// Runs a unit snapshot's call in C#: loads the state before it, with the handler families it names, calls
    /// the unit with its arguments, and compares the state after it key by key and the events it emitted in order.
    /// </summary>
    internal static class UnitSnapshotRunner
    {
        /// <summary>
        /// Where the C# run first differs from the TypeScript's record, or null when it matches.
        /// </summary>
        public static string? Run(JsonObject record)
        {
            Simulation city = Simulation.FromSave(CanonicalJson.Write(record["before"]));
            IReadOnlyList<string> handlers = Strings(record["handlers"]);

            // A record of every family runs on the families the simulation registered itself
            if (!handlers.SequenceEqual(Simulation.HandlerFamilies))
            {
                city.RegisterHandlers(handlers);
            }

            JsonArray events = new JsonArray();
            city.Events.Observer = (name, payload) => events.Add(RecordedEvents.Of(name, payload));

            try
            {
                Invoke(city, (string)record["unit"]!, record["args"]!.AsArray());
            }
            finally
            {
                city.Events.Observer = null;
            }

            return SnapshotComparison.StateDifference(record["after"]!, city.Save(), city) ??
                   SnapshotComparison.EventDifference(record["events"]!, events);
        }

        public static IReadOnlyList<string> Strings(JsonNode? list)
        {
            return list!.AsArray().Select(value => (string)value!).ToList();
        }

        /// <summary>
        /// Calls the unit as the cycle does, or as a city source applies commands, with the arguments a record holds:
        /// the C# side of the units in <c>conformance/unitSnapshots.ts</c>.
        /// </summary>
        private static void Invoke(Simulation city, string unit, JsonArray args)
        {
            switch (unit)
            {
                case "simulation.applyCommands":
                    city.ApplyCommands(args[0]!.AsArray()
                        .Select(received => new ReceivedCommand((string)received!["player"]!, received["command"]?.DeepClone()))
                        .ToList());
                    break;

                case "simulation._simulate":
                    city.Simulate(city.ConstructSimData());
                    break;

                case "valves.setValves":
                    city.Valves.SetValves(city.GameLevel, city.Census, city.Budget);
                    break;

                case "mapScanner.mapScan":
                    city.MapScanner.MapScan((int)args[0]!, (int)args[1]!, city.ConstructSimData());
                    break;

                case "census.take10Census":
                    city.Census.Take10Census(city.Budget);
                    break;

                case "census.take120Census":
                    city.Census.Take120Census();
                    break;

                case "budget.collectTax":
                    city.Budget.CollectTax(city.GameLevel, city.Census);
                    break;

                case "evaluation.cityEvaluation":
                    city.Evaluation.CityEvaluation(city.ConstructSimData());
                    break;

                case "blockMapUtils.neutraliseRateOfGrowthMap":
                    BlockMapUtils.NeutraliseRateOfGrowthMap(city.BlockMaps);
                    break;

                case "blockMapUtils.neutraliseTrafficMap":
                    BlockMapUtils.NeutraliseTrafficMap(city.BlockMaps);
                    break;

                case "simulation._sendMessages":
                    city.SendMessages();
                    break;

                case "powerManager.doPowerScan":
                    city.PowerManager.DoPowerScan(city.Census);
                    break;

                case "blockMapUtils.pollutionTerrainLandValueScan":
                    BlockMapUtils.PollutionTerrainLandValueScan(city.Map, city.Census, city.BlockMaps, city.Random);
                    break;

                case "blockMapUtils.crimeScan":
                    BlockMapUtils.CrimeScan(city.Census, city.BlockMaps);
                    break;

                case "blockMapUtils.populationDensityScan":
                    BlockMapUtils.PopulationDensityScan(city.Map, city.BlockMaps);
                    break;

                case "blockMapUtils.fireAnalysis":
                    BlockMapUtils.FireAnalysis(city.BlockMaps);
                    break;

                case "disasterManager.doDisasters":
                    city.DisasterManager.DoDisasters(city.GameLevel, city.Census);
                    break;

                case "simulation._publishCityStatus":
                    city.PublishCityStatus();
                    break;

                default:
                    throw new InvalidDataException($"No C# unit named {unit}.");
            }
        }
    }
}
