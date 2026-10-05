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

namespace Micropolis.Rules
{
    /// <summary>
    /// What a tile handler and a unit of work are given: the simulation's components, and the city time and level as
    /// they were when it was built.
    /// </summary>
    public sealed class SimData
    {
        internal SimData(Simulation simulator)
        {
            BlockMaps = simulator.BlockMaps;
            Budget = simulator.Budget;
            Census = simulator.Census;
            CityTime = simulator.CityTime;
            DisasterManager = simulator.DisasterManager;
            GameLevel = simulator.GameLevel;
            RepairManager = simulator.RepairManager;
            PowerManager = simulator.PowerManager;
            Random = simulator.Random;
            SpriteManager = simulator.SpriteManager;
            TrafficManager = simulator.TrafficManager;
            Valves = simulator.Valves;
        }

        public BlockMaps BlockMaps { get; }

        public Budget Budget { get; }

        public Census Census { get; }

        /// <summary>
        /// The city time when this was built: a step builds it before phase 0 advances the city time.
        /// </summary>
        public long CityTime { get; }

        public DisasterManager DisasterManager { get; }

        public Level GameLevel { get; }

        public RepairManager RepairManager { get; }

        public PowerManager PowerManager { get; }

        public RandomStream Random { get; }

        public SpriteManager SpriteManager { get; }

        public Traffic TrafficManager { get; }

        public Valves Valves { get; }
    }
}
