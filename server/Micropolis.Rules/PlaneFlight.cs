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

namespace Micropolis.Rules
{
    /// <summary>
    /// Where a plane is on its flight.
    /// </summary>
    public enum PlanePhase
    {
        /// <summary>
        /// Holding its heading until it leaves the map.
        /// </summary>
        Departing = 0,

        /// <summary>
        /// Flying along its airport's runway row to land there.
        /// </summary>
        Arriving = 1,
    }

    /// <summary>
    /// A plane's flight, which <see cref="AirplaneSprite"/> flies: departing, or arriving at an airport. A flight changes
    /// by being replaced, so an arriving plane always has its airport and a departing one never does.
    /// </summary>
    public sealed class PlaneFlight
    {
        private PlaneFlight(PlanePhase phase, Position? airport)
        {
            Phase = phase;
            Airport = airport;
        }

        public static PlaneFlight Departing { get; } = new PlaneFlight(PlanePhase.Departing, null);

        public PlanePhase Phase { get; }

        /// <summary>
        /// The centre of the airport an arriving plane lands at, and <see langword="null"/> for a departing plane.
        /// </summary>
        public Position? Airport { get; }

        /// <summary>
        /// A plane flying in to land at the airport centred on the tile.
        /// </summary>
        public static PlaneFlight Arriving(Position airport)
        {
            return new PlaneFlight(PlanePhase.Arriving, airport);
        }

        internal JsonObject Save()
        {
            return new JsonObject
            {
                ["phase"] = (int)Phase,
                ["airport"] = Airport?.Save(),
            };
        }

        // The airport is a tile of the map, which an arriving plane has and a departing one hasn't
        internal static PlaneFlight Load(SavedObject data, GameMap map)
        {
            if (data.ReadEnum<PlanePhase>("phase") == PlanePhase.Departing)
            {
                data.ReadNull("airport", "must be null for a departing plane");
                return Departing;
            }

            return Arriving(data.ReadTile("airport", map));
        }
    }
}
