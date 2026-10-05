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
    /// An event's key, under its name, one of the strings of <see cref="Messages"/>. A key is known by itself: each is
    /// declared once, in <see cref="RulesEvents"/>.
    /// </summary>
    public abstract class EventKey
    {
        private protected EventKey(string name)
        {
            Name = name;
        }

        public string Name { get; }

        public override string ToString()
        {
            return Name;
        }
    }

    /// <summary>
    /// An event that carries a payload of the type given.
    /// </summary>
    public sealed class EventName<TPayload> : EventKey
    {
        internal EventName(string name) : base(name)
        {
        }
    }

    /// <summary>
    /// An event that carries no payload.
    /// </summary>
    public sealed class EventName : EventKey
    {
        internal EventName(string name) : base(name)
        {
        }
    }

    /// <summary>
    /// Every event the game rules emit, each declared once with the payload it carries, under the name
    /// <see cref="Messages"/> gives it.
    /// </summary>
    public static class RulesEvents
    {
        /// <summary>
        /// The funds after the budget changed them, from <see cref="Budget"/>, which the simulation passes on.
        /// </summary>
        public static readonly EventName<long> FundsChanged = new EventName<long>(Messages.FUNDS_CHANGED);

        /// <summary>
        /// The year end paid the budget with values the player should review, from <see cref="Budget"/>, which the
        /// simulation passes on.
        /// </summary>
        public static readonly EventName BudgetReviewDue = new EventName(Messages.BUDGET_REVIEW_DUE);

        /// <summary>
        /// The budget couldn't pay, from <see cref="Budget"/>, which the simulation sends on as news.
        /// </summary>
        public static readonly EventName NoMoney = new EventName(Messages.NO_MONEY);

        /// <summary>
        /// The power scan found the load past the capacity, from <see cref="PowerManager"/>, which the simulation
        /// sends on as news.
        /// </summary>
        public static readonly EventName NotEnoughPower = new EventName(Messages.NOT_ENOUGH_POWER);

        /// <summary>
        /// The demand the valves set, from <see cref="Valves"/>, which the simulation passes on.
        /// </summary>
        public static readonly EventName<DemandMessage> ValvesUpdated = new EventName<DemandMessage>(Messages.VALVES_UPDATED);

        /// <summary>
        /// The city's new class, by its saved name, from <see cref="Evaluation"/>, which the simulation passes on.
        /// </summary>
        public static readonly EventName<string> ClassificationUpdated = new EventName<string>(Messages.CLASSIFICATION_UPDATED);

        /// <summary>
        /// The city's new score, from <see cref="Evaluation"/>, which the simulation passes on.
        /// </summary>
        public static readonly EventName<long> ScoreUpdated = new EventName<long>(Messages.SCORE_UPDATED);

        /// <summary>
        /// The speed the city now runs at, 0 when paused, from the simulation.
        /// </summary>
        public static readonly EventName<int> SpeedChanged = new EventName<int>(Messages.SPEED_CHANGED);

        /// <summary>
        /// The population a growth check counted, when it changed, from the simulation.
        /// </summary>
        public static readonly EventName<long> PopulationUpdated = new EventName<long>(Messages.POPULATION_UPDATED);

        /// <summary>
        /// The city's date, when it changed, from the simulation.
        /// </summary>
        public static readonly EventName<DateMessage> DateUpdated = new EventName<DateMessage>(Messages.DATE_UPDATED);

        /// <summary>
        /// The city status record at the end of a cycle, from the simulation.
        /// </summary>
        public static readonly EventName<StatusRecord> CityStatusUpdated = new EventName<StatusRecord>(Messages.CITY_STATUS_UPDATED);

        /// <summary>
        /// A layer the phase just run recomputed, from the simulation.
        /// </summary>
        public static readonly EventName<OverlayUpdatedMessage> OverlayUpdated = new EventName<OverlayUpdatedMessage>(Messages.OVERLAY_UPDATED);

        /// <summary>
        /// News for the players, from the simulation.
        /// </summary>
        public static readonly EventName<NewsMessage> FrontEndMessage = new EventName<NewsMessage>(Messages.FRONT_END_MESSAGE);

        /// <summary>
        /// What came of a command, from the simulation.
        /// </summary>
        public static readonly EventName<CommandResult> CommandResult = new EventName<CommandResult>(Messages.COMMAND_RESULT);

        /// <summary>
        /// Where the helicopter saw heavy traffic, from <see cref="SpriteManager"/>, which the simulation sends on as news.
        /// </summary>
        public static readonly EventName<NewsPlace> HeavyTraffic = new EventName<NewsPlace>(Messages.HEAVY_TRAFFIC);

        // The disasters, each where it struck, from the sprite manager or the disaster manager, which the simulation
        // sends on as news
        public static readonly EventName<NewsPlace> Earthquake = new EventName<NewsPlace>(Messages.EARTHQUAKE);
        public static readonly EventName<NewsPlace> ExplosionReported = new EventName<NewsPlace>(Messages.EXPLOSION_REPORTED);
        public static readonly EventName<NewsPlace> FireReported = new EventName<NewsPlace>(Messages.FIRE_REPORTED);
        public static readonly EventName<NewsPlace> FloodingReported = new EventName<NewsPlace>(Messages.FLOODING_REPORTED);
        public static readonly EventName<NewsPlace> MonsterSighted = new EventName<NewsPlace>(Messages.MONSTER_SIGHTED);
        public static readonly EventName<NewsPlace> NuclearMeltdown = new EventName<NewsPlace>(Messages.NUCLEAR_MELTDOWN);
        public static readonly EventName<NewsPlace> TornadoSighted = new EventName<NewsPlace>(Messages.TORNADO_SIGHTED);

        // The crashes, each where the sprite came down, from the sprite manager, which the simulation sends on as news
        public static readonly EventName<NewsPlace> HelicopterCrashed = new EventName<NewsPlace>(Messages.HELICOPTER_CRASHED);
        public static readonly EventName<NewsPlace> PlaneCrashed = new EventName<NewsPlace>(Messages.PLANE_CRASHED);
        public static readonly EventName<NewsPlace> ShipCrashed = new EventName<NewsPlace>(Messages.SHIP_CRASHED);
        public static readonly EventName<NewsPlace> TrainCrashed = new EventName<NewsPlace>(Messages.TRAIN_CRASHED);

        // After the keys they list, which a static field's initializer reads in the order the fields are written

        /// <summary>
        /// The keys of <see cref="Messages.DISASTER_MESSAGES"/>, in its order.
        /// </summary>
        public static readonly IReadOnlyList<EventName<NewsPlace>> Disasters =
        [
            Earthquake,
            ExplosionReported,
            FireReported,
            FloodingReported,
            MonsterSighted,
            NuclearMeltdown,
            TornadoSighted,
        ];

        /// <summary>
        /// The keys of <see cref="Messages.CRASHES"/>, in its order.
        /// </summary>
        public static readonly IReadOnlyList<EventName<NewsPlace>> Crashes =
        [
            HelicopterCrashed,
            PlaneCrashed,
            ShipCrashed,
            TrainCrashed,
        ];
    }
}
