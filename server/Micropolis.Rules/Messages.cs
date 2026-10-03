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
    /// The events and message subjects of <c>src/messages.ts</c> that the game rules send, under the same names with
    /// the same strings, which <c>conformance/messages.json</c> holds. An event is known by its string alone.
    /// </summary>
    public static class Messages
    {
        public const string BLACKOUTS_REPORTED = "Blackouts reported";
        public const string BUDGET_REVIEW_DUE = "Year-end budget to review";
        public const string CITY_STATUS_UPDATED = "City status updated";
        public const string CLASSIFICATION_UPDATED = "Classification updated";
        public const string DATE_UPDATED = "Date changed";
        public const string EARTHQUAKE = "Earthquake";
        public const string EXPLOSION_REPORTED = "Explosion Reported";
        public const string FIRE_REPORTED = "Fire!";
        public const string FLOODING_REPORTED = "Flooding reported";
        public const string FRONT_END_MESSAGE = "Front-end Message";
        public const string FUNDS_CHANGED = "Total funds has changed";
        public const string HEAVY_TRAFFIC = "Heavy traffic reported";
        public const string HELICOPTER_CRASHED = "Helicopter crashed";
        public const string MONSTER_SIGHTED = "Monster sighted";
        public const string NO_MONEY = "No money";
        public const string NOT_ENOUGH_POWER = "Not enough power";
        public const string NUCLEAR_MELTDOWN = "Nuclear Meltdown";
        public const string OVERLAY_UPDATED = "Overlay layer updated";
        public const string PLANE_CRASHED = "Plane crashed";
        public const string POPULATION_UPDATED = "Population updated";
        public const string SCORE_UPDATED = "Scoe updated";
        public const string SHIP_CRASHED = "Shipwrecked";
        public const string SPEED_CHANGED = "Speed changed";
        public const string TORNADO_SIGHTED = "Tornado sighted";
        public const string TRAIN_CRASHED = "Train crashed";
        public const string VALVES_UPDATED = "Valves updated";

        public static readonly IReadOnlyList<string> DISASTER_MESSAGES =
        [
            EARTHQUAKE,
            EXPLOSION_REPORTED,
            FIRE_REPORTED,
            FLOODING_REPORTED,
            MONSTER_SIGHTED,
            NUCLEAR_MELTDOWN,
            TORNADO_SIGHTED,
        ];

        public static readonly IReadOnlyList<string> CRASHES =
        [
            HELICOPTER_CRASHED,
            PLANE_CRASHED,
            SHIP_CRASHED,
            TRAIN_CRASHED,
        ];
    }
}
