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
        public const string FIRE_STATION_NEEDS_FUNDING = "Fire station needs funding";
        public const string FLOODING_REPORTED = "Flooding reported";
        public const string FRONT_END_MESSAGE = "Front-end Message";
        public const string FUNDS_CHANGED = "Total funds has changed";
        public const string HEAVY_TRAFFIC = "Heavy traffic reported";
        public const string HELICOPTER_CRASHED = "Helicopter crashed";
        public const string HIGH_CRIME = "High crime";
        public const string HIGH_POLLUTION = "High pollution";
        public const string MONSTER_SIGHTED = "Monster sighted";
        public const string NEED_AIRPORT = "Airport needed";
        public const string NEED_ELECTRICITY = "More power needed";
        public const string NEED_FIRE_STATION = "Fire station needed";
        public const string NEED_MORE_COMMERCIAL = "More commercial zones needed";
        public const string NEED_MORE_INDUSTRIAL = "More industrial zones needed";
        public const string NEED_MORE_RAILS = "More railways needed";
        public const string NEED_MORE_RESIDENTIAL = "More residential needed";
        public const string NEED_MORE_ROADS = "More roads needed";
        public const string NEED_POLICE_STATION = "Police station needed";
        public const string NEED_SEAPORT = "Seaport needed";
        public const string NEED_STADIUM = "Stadium needed";
        public const string NO_MONEY = "No money";
        public const string NOT_ENOUGH_POWER = "Not enough power";
        public const string NUCLEAR_MELTDOWN = "Nuclear Meltdown";
        public const string OVERLAY_UPDATED = "Overlay layer updated";
        public const string PLANE_CRASHED = "Plane crashed";
        public const string POLICE_NEEDS_FUNDING = "Police need funding";
        public const string POPULATION_UPDATED = "Population updated";
        public const string REACHED_CAPITAL = "Now a capital";
        public const string REACHED_CITY = "Now a city";
        public const string REACHED_METROPOLIS = "Now a metropolis";
        public const string REACHED_MEGALOPOLIS = "Now a megalopolis";
        public const string REACHED_TOWN = "Now a town";
        public const string ROAD_NEEDS_FUNDING = "Roads need funding";
        public const string SCORE_UPDATED = "Scoe updated";
        public const string SHIP_CRASHED = "Shipwrecked";
        public const string SPEED_CHANGED = "Speed changed";
        public const string TAX_TOO_HIGH = "Tax too high";
        public const string TORNADO_SIGHTED = "Tornado sighted";
        public const string TRAFFIC_JAMS = "Traffic jams reported";
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
