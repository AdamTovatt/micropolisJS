/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 * Modified in Adam Tovatt's continuation of micropolisJS. Copyright (C) 2026 Adam Tovatt
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

namespace Micropolis.Rules
{
    /// <summary>
    /// Police and fire stations, as the original's <c>doSpecialZone</c> in zone.cpp notes their cover.
    /// </summary>
    public static class EmergencyServices
    {
        /// <summary>
        /// Counts a police station and notes its cover on the police station map.
        /// </summary>
        public static void PoliceStationFound(GameMap map, int x, int y, SimData simData)
        {
            simData.Census.PoliceStationPop += 1;
            NoteCover(map, x, y, simData, simData.Budget.PoliceEffect, simData.BlockMaps.PoliceStationMap);
        }

        /// <summary>
        /// Counts a fire station and notes its cover on the fire station map.
        /// </summary>
        public static void FireStationFound(GameMap map, int x, int y, SimData simData)
        {
            simData.Census.FireStationPop += 1;
            NoteCover(map, x, y, simData, simData.Budget.FireEffect, simData.BlockMaps.FireStationMap);
        }

        /// <summary>
        /// What a powered fire station centred at <paramref name="station"/>, as the only fire station on
        /// <paramref name="map"/>, would give <paramref name="target"/>: for each tile of its perimeter on the map, in the
        /// order the scan searches them for the station's road, the cover at the target with the station's road on that
        /// tile, its <paramref name="fireEffect"/> noted there and spread as the fire analysis spreads it. The city is
        /// untouched: the cover is worked out on block maps of its own.
        /// </summary>
        /// <param name="fireEffect">The fire department's funded effect, as the budget gives it.</param>
        public static FireStationReach FireStationReach(GameMap map, long fireEffect, Position station, Position target)
        {
            return new FireStationReach([.. Traffic.Perimeter(map, station).Select(road =>
            {
                BlockMaps blockMaps = new BlockMaps(map.Width, map.Height);
                blockMaps.FireStationMap.WorldSet(road.X, road.Y, checked((int)fireEffect));
                BlockMapUtils.FireAnalysis(blockMaps);

                return new RoadReach(road.X, road.Y, blockMaps.FireStationEffectMap.WorldGet(target.X, target.Y));
            })]);
        }

        public static void RegisterHandlers(MapScanner mapScanner, RepairManager repairManager)
        {
            mapScanner.AddAction(TileValues.POLICESTATION, PoliceStationFound);
            mapScanner.AddAction(TileValues.FIRESTATION, FireStationFound);
        }

        // Adds the station's funded effect to its map, halved without power and again without a road: at the road
        // tile found on the station's perimeter, as the original's doSpecialZone does, or at the station without one
        private static void NoteCover(GameMap map, int x, int y, SimData simData, long budgetEffect, BlockMap stationMap)
        {
            long effect = budgetEffect;

            // Unpowered buildings are half as effective
            if (!map.GetTile(x, y).IsPowered())
            {
                effect = JsMath.FloorDiv(effect, 2);
            }

            Position position = new Position(x, y);
            Position? roadPosition = simData.TrafficManager.FindPerimeterRoad(position);
            if (roadPosition is null)
            {
                effect = JsMath.FloorDiv(effect, 2);
                roadPosition = position;
            }

            // A funded effect is at most the budget's fully funded one, so an entry stays within the station map's
            // bound (BlockMaps); one past an int would be a save no budget wrote, and fails rather than wraps
            long currentEffect = stationMap.WorldGet(roadPosition.Value.X, roadPosition.Value.Y);
            currentEffect += effect;
            stationMap.WorldSet(roadPosition.Value.X, roadPosition.Value.Y, checked((int)currentEffect));
        }
    }
}
