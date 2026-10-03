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

namespace Micropolis.Rules
{
    /// <summary>
    /// A city's complete simulation state, as <c>docs/state-hash.md</c> specifies its save: everything that decides
    /// how the city evolves, the random stream included, so a city restored from a save continues exactly as it would
    /// have without it. A save is the current format, with its scanned state. An older save isn't read: one that
    /// <c>storage.js</c> migrated from a version without the scanned state holds <c>null</c> for it.
    /// </summary>
    public sealed class Simulation
    {
        public const int SpeedPaused = 0;
        public const int SpeedSlow = 1;
        public const int SpeedMedium = 2;
        public const int SpeedFast = 3;

        public const int LevelEasy = 0;
        public const int LevelMedium = 1;
        public const int LevelHard = 2;

        /// <summary>
        /// The city-class announcements a city may have sent last.
        /// </summary>
        public static readonly IReadOnlyList<string> CityClassMessages =
            ["Now a town", "Now a city", "Now a capital", "Now a metropolis", "Now a megalopolis"];

        private Simulation(GameMap map, uint seed)
        {
            Map = map;
            Seed = seed;
            Random = RandomStream.SimulationStream(seed);
            BlockMaps = new BlockMaps(map.Width, map.Height);
            PowerManager = new PowerManager(map.Width, map.Height);
        }

        public GameMap Map { get; }

        /// <summary>
        /// The game seed, which generated the map and seeded the stream.
        /// </summary>
        public uint Seed { get; }

        public RandomStream Random { get; }

        // The simulation's own fields change only as it loads and steps; its components' fields are set by the
        // simulation that holds them

        public int GameLevel { get; private set; }

        public int Speed { get; private set; }

        /// <summary>
        /// City time: four per month, 48 per year, counted from 1900.
        /// </summary>
        public long CityTime { get; private set; }

        /// <summary>
        /// The step counter, 0–1023.
        /// </summary>
        public int SpeedCycle { get; private set; }

        /// <summary>
        /// The phase the next simulation pass runs, 0–15.
        /// </summary>
        public int PhaseCycle { get; private set; }

        /// <summary>
        /// The cycle counter, 0–1023.
        /// </summary>
        public int SimCycle { get; private set; }

        public long CityPopLast { get; private set; }

        /// <summary>
        /// The last city-class announcement sent, one of <see cref="CityClassMessages"/>, or null.
        /// </summary>
        public string? MessageLast { get; private set; }

        /// <summary>
        /// The city time of the last power shortage or blackout notification, or null for none.
        /// </summary>
        public long? LastPowerMessage { get; private set; }

        public bool InitialEvaluationPending { get; private set; }

        public Evaluation Evaluation { get; } = new Evaluation();

        public Valves Valves { get; } = new Valves();

        public Budget Budget { get; } = new Budget();

        public Census Census { get; } = new Census();

        public SpriteManager SpriteManager { get; } = new SpriteManager();

        public DisasterManager DisasterManager { get; } = new DisasterManager();

        public BlockMaps BlockMaps { get; }

        public PowerManager PowerManager { get; }

        /// <summary>
        /// The city a save holds. A key missing or unknown, or a value of the wrong type or outside its documented
        /// range, fails with a <see cref="SaveFormatException"/> naming the key.
        /// </summary>
        public static Simulation FromSave(JsonNode? saveData)
        {
            return SavedObject.ReadRoot(saveData, saved =>
            {
                GameMap map = GameMap.FromSave(saved);

                Simulation city = saved.ReadObject("simulation", simulation =>
                {
                    Simulation loaded = new Simulation(map, simulation.ReadUInt32("seed"));
                    loaded.LoadCounters(simulation);
                    return loaded;
                });

                city.Evaluation.Load(saved);
                city.Valves.Load(saved);
                city.Budget.Load(saved);
                city.Census.Load(saved);
                city.SpriteManager.Load(saved);
                city.DisasterManager.Load(saved);

                saved.ReadObject("scannedState", scannedState =>
                {
                    scannedState.ReadObject("blockMaps", city.BlockMaps.LoadScan);
                    scannedState.ReadObject("census", city.Census.LoadScan);
                    scannedState.ReadObject("power", city.PowerManager.LoadScan);
                });

                return city;
            });
        }

        public void Save(JsonObject saveData)
        {
            saveData["simulation"] = new JsonObject
            {
                ["gameLevel"] = GameLevel,
                ["speed"] = Speed,
                ["seed"] = Seed,
                ["randomState"] = SavedList.Of(Random.GetState()),
                ["cityTime"] = CityTime,
                ["speedCycle"] = SpeedCycle,
                ["phaseCycle"] = PhaseCycle,
                ["simCycle"] = SimCycle,
                ["cityPopLast"] = CityPopLast,
                ["messageLast"] = MessageLast,
                ["lastPowerMessage"] = LastPowerMessage,
                ["initialEvaluationPending"] = InitialEvaluationPending,
            };

            Map.Save(saveData);
            Evaluation.Save(saveData);
            Valves.Save(saveData);
            Budget.Save(saveData);
            Census.Save(saveData);
            SpriteManager.Save(saveData);
            DisasterManager.Save(saveData);

            JsonObject blockMaps = new JsonObject();
            BlockMaps.SaveScan(blockMaps);
            JsonObject census = new JsonObject();
            Census.SaveScan(census);
            JsonObject power = new JsonObject();
            PowerManager.SaveScan(power);

            saveData["scannedState"] = new JsonObject
            {
                ["blockMaps"] = blockMaps,
                ["census"] = census,
                ["power"] = power,
            };
        }

        private void LoadCounters(SavedObject simulation)
        {
            GameLevel = simulation.ReadInt("gameLevel", LevelEasy, LevelHard);
            Speed = simulation.ReadInt("speed", SpeedPaused, SpeedFast);
            CityTime = simulation.ReadSafeInteger("cityTime");
            SpeedCycle = simulation.ReadInt("speedCycle", 0, 1023);
            PhaseCycle = simulation.ReadInt("phaseCycle", 0, 15);
            SimCycle = simulation.ReadInt("simCycle", 0, 1023);
            CityPopLast = simulation.ReadSafeInteger("cityPopLast");
            MessageLast = simulation.ReadNullableString("messageLast", CityClassMessages);
            LastPowerMessage = simulation.ReadNullableSafeInteger("lastPowerMessage");
            InitialEvaluationPending = simulation.ReadBool("initialEvaluationPending");

            uint[] randomState = simulation.ReadUInt32List("randomState", 4);

            if (randomState.All(word => word == 0))
            {
                throw simulation.Invalid("randomState", "must not be all zero");
            }

            Random.SetState(randomState);
        }
    }
}
