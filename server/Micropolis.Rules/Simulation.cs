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
    /// The game speed, numbered as the original's <c>simSpeed</c>: 0 paused, then slow, medium and fast.
    /// </summary>
    public enum Speed
    {
        Paused = 0,
        Slow = 1,
        Medium = 2,
        Fast = 3,
    }

    /// <summary>
    /// The speeds a city runs at, slowest first, by the names the tools and the conformance files give them.
    /// </summary>
    public static class RunningSpeeds
    {
        public static readonly IReadOnlyList<Speed> All = [Speed.Slow, Speed.Medium, Speed.Fast];

        public static string Name(Speed speed)
        {
            return speed switch
            {
                Speed.Slow => "slow",
                Speed.Medium => "medium",
                Speed.Fast => "fast",
                _ => throw new ArgumentOutOfRangeException(nameof(speed), speed, "Not a running speed."),
            };
        }

        /// <summary>
        /// The running speed of the name, or <see langword="null"/> for a name no running speed has.
        /// </summary>
        public static Speed? Named(string name)
        {
            return All.Cast<Speed?>().FirstOrDefault(speed => Name(speed!.Value) == name);
        }
    }

    /// <summary>
    /// The difficulty, numbered as the original's <c>LEVEL_EASY</c> and its siblings: easy, medium and hard.
    /// </summary>
    public enum Level
    {
        Easy = 0,
        Medium = 1,
        Hard = 2,
    }

    /// <summary>
    /// A city's complete simulation state, as <c>docs/state-hash.md</c> specifies its save: everything that decides
    /// how the city evolves, the random stream included, so a city restored from a save continues exactly as it would
    /// have without it.
    /// </summary>
    /// <remarks>
    /// Code that computes with the city's integers mirrors JavaScript's operations on doubles rather than C#'s
    /// integer semantics: <c>Math.floor</c> rounds down where C# division truncates,
    /// <c>| 0</c> and <c>&gt;&gt;</c> narrow to int32, and <c>Math.round</c> sends halves up.
    /// </remarks>
    public sealed partial class Simulation
    {
        /// <summary>
        /// The city-class announcements a city may have sent last, in class order.
        /// </summary>
        public static readonly IReadOnlyList<string> CityClassMessages =
            Enum.GetValues<CityClass>().Select(ClassAnnouncement).OfType<string>().ToList();

        // The year city time 0 falls in
        private const long StartingYear = 1900;

        // The power messages, NOT_ENOUGH_POWER and BLACKOUTS_REPORTED, share one throttle: after either is sent,
        // neither is sent again until this much city time has passed, three city years
        private const long PowerMessageInterval = 3 * 48;

        // At each speed, slow, medium and fast, how often in cycles phases 11–15 run their scans
        private static readonly int[] SpeedPowerScan = [2, 4, 5];
        private static readonly int[] SpeedPollutionTerrainLandValueScan = [2, 7, 17];
        private static readonly int[] SpeedCrimeScan = [1, 8, 18];
        private static readonly int[] SpeedPopulationDensityScan = [1, 9, 19];
        private static readonly int[] SpeedFireAnalysis = [1, 10, 20];
        private const int CensusFrequency10 = 4;
        private const int CensusFrequency120 = CensusFrequency10 * 10;
        private const int TaxFrequency = 48;

        // The date last announced, which a save doesn't hold: a loaded city announces its date at its first step
        private long _cityYearLast = -1;
        private long _cityMonthLast = -1;

        private Simulation(GameMap map, uint seed)
        {
            Map = map;
            Seed = seed;
            Random = RandomStream.SimulationStream(seed);
            BlockMaps = new BlockMaps(map.Width, map.Height);
            PowerManager = new PowerManager(map);
            SpriteManager = new SpriteManager(map, Random);
            DisasterManager = new DisasterManager(map, SpriteManager, Random);
            MapScanner = new MapScanner(map);
            RepairManager = new RepairManager(map);
            TrafficManager = new Traffic(map, SpriteManager, Random);
            Init();
        }

        public GameMap Map { get; }

        /// <summary>
        /// The game seed, which generated the map and seeded the stream.
        /// </summary>
        public uint Seed { get; }

        public RandomStream Random { get; }

        // The simulation's own fields change only as it loads and steps; its components' fields are set by the
        // simulation that holds them

        public Level GameLevel { get; private set; }

        public Speed Speed { get; private set; }

        /// <summary>
        /// City time: four per month, 48 per year, counted from 1900.
        /// </summary>
        public long CityTime { get; private set; }

        /// <summary>
        /// The city's date from its city time, four units a month: the month from 0, and the year. The month is an
        /// arithmetic shift of the remainder, which keeps the city time's sign, and the year rounds down.
        /// </summary>
        public (long Month, long Year) Date => ((int)(CityTime % CityTimesPerYear) >> 2, JsMath.FloorDiv(CityTime, CityTimesPerYear) + StartingYear);

        /// <summary>
        /// The units of city time in a year, four to a month.
        /// </summary>
        public const int CityTimesPerYear = 48;

        /// <summary>
        /// How many values the step counter takes, from 0, before it wraps to 0.
        /// </summary>
        public const int SpeedCycles = 1024;

        /// <summary>
        /// The step counter, 0 to <see cref="SpeedCycles"/> − 1.
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

        public SpriteManager SpriteManager { get; }

        public DisasterManager DisasterManager { get; }

        public BlockMaps BlockMaps { get; }

        public PowerManager PowerManager { get; }

        public MapScanner MapScanner { get; }

        public RepairManager RepairManager { get; }

        public Traffic TrafficManager { get; }

        /// <summary>
        /// The events the simulation sends, its components' included as it passes them on: front-end messages, the
        /// date, the speed, the overlays, the city status, and the evaluation's, budget's and valves' updates.
        /// </summary>
        public EventEmitter Events { get; } = new EventEmitter();

        public bool IsPaused => Speed == Speed.Paused;

        /// <summary>
        /// A new city on the map <see cref="MapGenerator"/> generates from the seed's map stream, simulated from the
        /// seed's stream: 20000 in funds, then the first scans, which a saved game holds the results of.
        /// </summary>
        public static Simulation NewCity(uint seed, Level gameLevel, Speed speed)
        {
            return NewCity(MapGenerator.Generate(RandomStream.MapStream(seed)), seed, gameLevel, speed);
        }

        /// <summary>
        /// A new city on the map given, such as a blank one, simulated from the seed's stream, as
        /// <see cref="NewCity(uint, Level, Speed)"/> starts one on the map the seed generates.
        /// </summary>
        public static Simulation NewCity(GameMap map, uint seed, Level gameLevel, Speed speed)
        {
            Simulation city = new Simulation(map, seed)
            {
                GameLevel = gameLevel,
                Speed = speed,
                InitialEvaluationPending = true,
            };

            city.ClearCensus();
            city.Budget.SetFunds(20000);
            city.Census.TotalPop = 1;
            city.Scan();

            return city;
        }

        /// <summary>
        /// The city a save's text holds. Text that isn't JSON, a key written twice, missing or unknown, or a value of
        /// the wrong type or outside its documented range fails with a <see cref="SaveFormatException"/> naming where.
        /// </summary>
        /// <remarks>
        /// A save is read in the current format only, with its scanned state. A save that holds <c>null</c> for it,
        /// which only a scan could fill, is refused.
        /// </remarks>
        public static Simulation FromSave(string saveText)
        {
            return SavedObject.ReadRoot(saveText, saved =>
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

        /// <summary>
        /// The city's save: the complete simulation state, under the keys <c>docs/state-hash.md</c> lists.
        /// </summary>
        public JsonObject Save()
        {
            JsonObject saveData = new JsonObject();

            saveData["simulation"] = new JsonObject
            {
                ["gameLevel"] = (int)GameLevel,
                ["speed"] = (int)Speed,
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

            return saveData;
        }

        public void SetSpeed(Speed speed)
        {
            if (speed == Speed)
            {
                return;
            }

            Speed = speed;
            Events.Emit(RulesEvents.SpeedChanged, (int)speed);
        }

        /// <summary>
        /// One loop of the simulation, as simLoop in the original: a phase of the city cycle when the game speed lets
        /// one through, then one move of every sprite. A paused simulation's step does nothing, as the original's
        /// simFrame and moveObjects do nothing at speed 0.
        /// </summary>
        public void Step()
        {
            if (IsPaused)
            {
                return;
            }

            SimFrame();
            SpriteManager.MoveObjects(ConstructSimData());
            UpdateTime();
        }

        private void SimFrame()
        {
            if (TakeSpeedCycle())
            {
                Simulate(ConstructSimData());
            }
        }

        /// <summary>
        /// Advances the step counter, and answers whether this step runs a phase, as simFrame in the original lets
        /// one through: on every 5th step at slow speed, every 3rd at medium, and every step at fast.
        /// </summary>
        internal bool TakeSpeedCycle()
        {
            if (++SpeedCycle >= SpeedCycles)
            {
                SpeedCycle = 0;
            }

            if (Speed == Speed.Slow && (SpeedCycle % 5) != 0)
            {
                return false;
            }

            if (Speed == Speed.Medium && (SpeedCycle % 3) != 0)
            {
                return false;
            }

            return true;
        }

        private void ClearCensus()
        {
            Census.ClearCensus();
            PowerManager.ClearPowerStack();
            BlockMaps.FireStationMap.Clear();
            BlockMaps.PoliceStationMap.Clear();
        }

        internal SimData ConstructSimData()
        {
            return new SimData(this);
        }

        // Passes the components' events on, and registers every subsystem's tile handlers
        private void Init()
        {
            Evaluation.Events.AddEventListener(RulesEvents.ClassificationUpdated, cityClass => Events.Emit(RulesEvents.ClassificationUpdated, cityClass));
            Evaluation.Events.AddEventListener(RulesEvents.ScoreUpdated, score => Events.Emit(RulesEvents.ScoreUpdated, score));

            PowerManager.Events.AddEventListener(RulesEvents.NotEnoughPower, () => SendPowerMessage(Messages.NOT_ENOUGH_POWER));

            Budget.Events.AddEventListener(RulesEvents.FundsChanged, funds => Events.Emit(RulesEvents.FundsChanged, funds));
            Budget.Events.AddEventListener(RulesEvents.BudgetReviewDue, () => Events.Emit(RulesEvents.BudgetReviewDue));
            Budget.Events.AddEventListener(RulesEvents.NoMoney, () => WrapMessage(Messages.NO_MONEY, null));

            Valves.Events.AddEventListener(RulesEvents.ValvesUpdated, demand => Events.Emit(RulesEvents.ValvesUpdated, demand));

            foreach (EventName<NewsPlace> disaster in RulesEvents.Disasters)
            {
                SpriteManager.Events.AddEventListener(disaster, place => WrapMessage(disaster.Name, place));
                DisasterManager.Events.AddEventListener(disaster, place => WrapMessage(disaster.Name, place));
            }

            foreach (EventName<NewsPlace> crash in RulesEvents.Crashes)
            {
                SpriteManager.Events.AddEventListener(crash, place => WrapMessage(crash.Name, place));
            }

            SpriteManager.Events.AddEventListener(RulesEvents.HeavyTraffic, place => WrapMessage(Messages.HEAVY_TRAFFIC, place));

            // Each component registers its tile handlers with the map scanner and its zones with the repair manager.
            // The first handler whose criterion matches a tile is the one the scan calls, so this order is part of
            // the game rules
            Commercial.RegisterHandlers(MapScanner, RepairManager);
            EmergencyServices.RegisterHandlers(MapScanner, RepairManager);
            Industrial.RegisterHandlers(MapScanner, RepairManager);
            MiscTiles.RegisterHandlers(MapScanner, RepairManager);
            PowerManager.RegisterHandlers(MapScanner, RepairManager);
            Road.RegisterHandlers(MapScanner, RepairManager);
            Residential.RegisterHandlers(MapScanner, RepairManager);
            Stadia.RegisterHandlers(MapScanner, RepairManager);
            Transport.RegisterHandlers(MapScanner, RepairManager);
        }

        // A new city's first scans, which a saved game holds the results of, as doSimInit in the original's
        // simulate.cpp runs them
        private void Scan()
        {
            MapScanner.MapScan(0, Map.Width, ConstructSimData());
            PowerManager.DoPowerScan(Census);
            BlockMapUtils.PollutionTerrainLandValueScan(Map, Census, BlockMaps, Random);
            BlockMapUtils.CrimeScan(Census, BlockMaps);
            BlockMapUtils.PopulationDensityScan(Map, BlockMaps);
            BlockMapUtils.FireAnalysis(BlockMaps);
        }

        /// <summary>
        /// The pass a step lets through, as <c>_simulate</c>: the city's first evaluation if it is still due, then
        /// the next phase of the cycle.
        /// </summary>
        internal void Simulate(SimData simData)
        {
            // A city is evaluated before the first phase it runs. A saved game records whether that has happened.
            if (InitialEvaluationPending)
            {
                Evaluation.CityEvaluation(simData);
                InitialEvaluationPending = false;
            }

            RunPhase(simData);
        }

        // One phase of the 16-phase cycle, as simulate in the original's simulate.cpp dispatches it
        private void RunPhase(SimData simData)
        {
            PhaseCycle &= 15;

            switch (PhaseCycle)
            {
                case 0:
                    if (++SimCycle > 1023)
                    {
                        SimCycle = 0;
                    }

                    CityTime++;

                    if ((SimCycle & 1) == 0)
                    {
                        Valves.SetValves(GameLevel, Census, Budget);
                    }

                    ClearCensus();
                    break;

                case 1:
                case 2:
                case 3:
                case 4:
                case 5:
                case 6:
                case 7:
                case 8:
                    // Divided as the original's integers are, so the eighths cover every column once, whether or not
                    // the width is a multiple of 8, as the game's maps' 120 is.
                    MapScanner.MapScan((PhaseCycle - 1) * Map.Width / 8, PhaseCycle * Map.Width / 8, simData);
                    break;

                case 9:
                    if (CityTime % CensusFrequency10 == 0)
                    {
                        Census.Take10Census(Budget);
                    }

                    if (CityTime % CensusFrequency120 == 0)
                    {
                        Census.Take120Census();
                    }

                    if (CityTime % TaxFrequency == 0)
                    {
                        Budget.CollectTax(GameLevel, Census);
                        Evaluation.CityEvaluation(simData);
                    }

                    break;

                case 10:
                    if ((SimCycle % 5) == 0)
                    {
                        BlockMapUtils.NeutraliseRateOfGrowthMap(simData.BlockMaps);
                    }

                    BlockMapUtils.NeutraliseTrafficMap(BlockMaps);
                    OverlaysUpdated();
                    SendMessages();
                    break;

                case 11:
                    if (ScanDue(SpeedPowerScan))
                    {
                        PowerManager.DoPowerScan(Census);
                        OverlaysUpdated();
                    }

                    break;

                case 12:
                    if (ScanDue(SpeedPollutionTerrainLandValueScan))
                    {
                        BlockMapUtils.PollutionTerrainLandValueScan(Map, Census, BlockMaps, Random);
                        OverlaysUpdated();
                    }

                    break;

                case 13:
                    if (ScanDue(SpeedCrimeScan))
                    {
                        BlockMapUtils.CrimeScan(Census, BlockMaps);
                        OverlaysUpdated();
                    }

                    break;

                case 14:
                    if (ScanDue(SpeedPopulationDensityScan))
                    {
                        BlockMapUtils.PopulationDensityScan(Map, BlockMaps);
                        OverlaysUpdated();
                    }

                    break;

                case 15:
                    if (ScanDue(SpeedFireAnalysis))
                    {
                        BlockMapUtils.FireAnalysis(BlockMaps);
                        OverlaysUpdated();
                    }

                    DisasterManager.DoDisasters(GameLevel, Census);
                    PublishCityStatus();
                    break;
            }

            // Go on to the next phase
            PhaseCycle = (PhaseCycle + 1) & 15;
        }

        // Whether a scan of phases 11–15 runs this cycle, at its frequency for the game speed. A paused city's step
        // runs no phase, and a phase run while paused skips the scan.
        private bool ScanDue(int[] frequencies)
        {
            return Speed != Speed.Paused && SimCycle % frequencies[(int)Speed - 1] == 0;
        }

        /// <summary>
        /// Sends a power message unless one was sent within the last three city years, and notes when it is sent.
        /// </summary>
        internal void SendPowerMessage(string subject)
        {
            if (LastPowerMessage is long last && CityTime - last <= PowerMessageInterval)
            {
                return;
            }

            Events.Emit(RulesEvents.FrontEndMessage, new NewsMessage(subject));
            LastPowerMessage = CityTime;
        }

        /// <summary>
        /// Sends a component's event as a front-end message with the place it carries, as <c>_wrapMessage</c> does: an
        /// event without one, a place of <see langword="null"/>, leaves the message without data.
        /// </summary>
        internal void WrapMessage(string message, NewsPlace? place)
        {
            Events.Emit(RulesEvents.FrontEndMessage, new NewsMessage(message, place));
        }

        /// <summary>
        /// The advisor's messages, as <c>_sendMessages</c> and sendMessages in the original: the growth check, then the
        /// one condition the city time's place in its 64-unit round asks about, sent if it holds. The stadium, seaport
        /// and airport checks also set or clear the demand caps.
        /// </summary>
        internal void SendMessages()
        {
            CheckGrowth();

            switch (CityTime & 63)
            {
                case 1:
                    SendIfHolds(Messages.NEED_MORE_RESIDENTIAL);
                    break;

                case 5:
                    SendIfHolds(Messages.NEED_MORE_COMMERCIAL);
                    break;

                case 10:
                    SendIfHolds(Messages.NEED_MORE_INDUSTRIAL);
                    break;

                case 14:
                    SendIfHolds(Messages.NEED_MORE_ROADS);
                    break;

                case 18:
                    SendIfHolds(Messages.NEED_MORE_RAILS);
                    break;

                case 22:
                    SendIfHolds(Messages.NEED_ELECTRICITY);
                    break;

                case 26:
                    Valves.ResCap = SendIfHolds(Messages.NEED_STADIUM);
                    break;

                case 28:
                    Valves.IndCap = SendIfHolds(Messages.NEED_SEAPORT);
                    break;

                case 30:
                    Valves.ComCap = SendIfHolds(Messages.NEED_AIRPORT);
                    break;

                case 32:
                    if (Holds(Messages.BLACKOUTS_REPORTED))
                    {
                        SendPowerMessage(Messages.BLACKOUTS_REPORTED);
                    }

                    break;

                case 35:
                    if (Holds(Messages.HIGH_POLLUTION))
                    {
                        WrapMessage(Messages.HIGH_POLLUTION, new NewsPlace(Map.PollutionMaxX, Map.PollutionMaxY));
                    }

                    break;

                case 42:
                    SendIfHolds(Messages.HIGH_CRIME);
                    break;

                case 45:
                    SendIfHolds(Messages.NEED_FIRE_STATION);
                    break;

                case 48:
                    SendIfHolds(Messages.NEED_POLICE_STATION);
                    break;

                case 51:
                    SendIfHolds(Messages.TAX_TOO_HIGH);
                    break;

                case 54:
                    SendIfHolds(Messages.ROAD_NEEDS_FUNDING);
                    break;

                case 57:
                    SendIfHolds(Messages.FIRE_STATION_NEEDS_FUNDING);
                    break;

                case 60:
                    SendIfHolds(Messages.POLICE_NEEDS_FUNDING);
                    break;

                case 63:
                    SendIfHolds(Messages.TRAFFIC_JAMS);
                    break;
            }
        }

        private bool Holds(string condition)
        {
            return CityStatus.ConditionHolds(condition, Census, Budget, PowerManager);
        }

        // Sends the condition's message if it holds, and answers whether it did
        private bool SendIfHolds(string condition)
        {
            if (!Holds(condition))
            {
                return false;
            }

            WrapMessage(condition, null);
            return true;
        }

        // Each month, as checkGrowth in the original: the population, which the info bar shows, and a new city class
        // announced, unless it is the class last announced. It reads the population and the classes without changing
        // the evaluation, which works them out a year at a time.
        private void CheckGrowth()
        {
            if ((CityTime & 3) != 0)
            {
                return;
            }

            string? message = null;
            long cityPop = Evaluation.GetPopulation(Census);

            // A population that hasn't changed has nothing to send or announce
            if (cityPop == CityPopLast)
            {
                return;
            }

            Events.Emit(RulesEvents.PopulationUpdated, cityPop);

            // The original compares classes only once the city has had people at a growth check
            if (CityPopLast > 0)
            {
                CityClass lastClass = Evaluation.GetCityClass(CityPopLast);
                CityClass newClass = Evaluation.GetCityClass(cityPop);

                if (lastClass != newClass)
                {
                    message = ClassAnnouncement(newClass);
                }
            }

            if (message is not null && message != MessageLast)
            {
                WrapMessage(message, null);
                MessageLast = message;
            }

            CityPopLast = cityPop;
        }

        // The announcement of a city reaching a class, as checkGrowth's switch in the original: a village is never
        // announced
        private static string? ClassAnnouncement(CityClass cityClass)
        {
            return cityClass switch
            {
                CityClass.Village => null,
                CityClass.Town => Messages.REACHED_TOWN,
                CityClass.City => Messages.REACHED_CITY,
                CityClass.Capital => Messages.REACHED_CAPITAL,
                CityClass.Metropolis => Messages.REACHED_METROPOLIS,
                CityClass.Megalopolis => Messages.REACHED_MEGALOPOLIS,
                _ => throw new ArgumentOutOfRangeException(nameof(cityClass), cityClass, "No such city class."),
            };
        }

        /// <summary>
        /// The city status record at the end of the cycle, as <c>_publishCityStatus</c>: derived, never saved.
        /// </summary>
        private void PublishCityStatus()
        {
            Events.Emit(RulesEvents.CityStatusUpdated, CityStatus.Build(Census, Budget, PowerManager, Valves));
        }

        // Each layer the phase running has just recomputed, by name, so that an overlay showing it asks for it again.
        // The phase counter moves on only once the phase has run.
        internal void OverlaysUpdated()
        {
            foreach (OverlayLayer layer in Queries.Layers)
            {
                if (layer.Phase == PhaseCycle)
                {
                    Events.Emit(RulesEvents.OverlayUpdated, new OverlayUpdatedMessage(layer.Name));
                }
            }
        }

        // As setYear in the original: the city keeps its month
        private void SetYear(long year)
        {
            if (year < StartingYear)
            {
                year = StartingYear;
            }

            year = (year - StartingYear) - JsMath.FloorDiv(CityTime, CityTimesPerYear);
            CityTime += year * CityTimesPerYear;
            UpdateTime();
        }

        private void UpdateTime()
        {
            const long megalinium = 1000000;
            (long cityMonth, long cityYear) = Date;

            // As updateDate in the original, a city reaching the year one million goes back to its starting year
            if (cityYear >= megalinium)
            {
                SetYear(StartingYear);
                return;
            }

            if (_cityYearLast != cityYear || _cityMonthLast != cityMonth)
            {
                _cityYearLast = cityYear;
                _cityMonthLast = cityMonth;
                Events.Emit(RulesEvents.DateUpdated, new DateMessage(cityMonth, cityYear));
            }
        }

        private void LoadCounters(SavedObject simulation)
        {
            GameLevel = simulation.ReadEnum<Level>("gameLevel");
            Speed = simulation.ReadEnum<Speed>("speed");
            CityTime = simulation.ReadSafeInteger("cityTime");
            SpeedCycle = simulation.ReadInt("speedCycle", 0, SpeedCycles - 1);
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
