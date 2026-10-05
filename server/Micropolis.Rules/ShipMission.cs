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
    /// Where a ship is on its way: sailing in to its port, docked there, or leaving the map.
    /// </summary>
    public enum ShipPhase
    {
        SailingIn = 0,
        Docked = 1,
        Leaving = 2,
    }

    /// <summary>
    /// A ship's mission, which <see cref="ShipSprite"/> checks against the map each step: its phase, the port it sails
    /// to, and how long it stays docked. Its route isn't kept, since a ship finds it again from the map.
    /// </summary>
    public sealed class ShipMission
    {
        public ShipPhase Phase { get; internal set; }

        /// <summary>
        /// The centre of the port the ship sails in to or is docked at, or <see langword="null"/> for none: a leaving
        /// ship's, and one sailing in that hasn't found a port yet.
        /// </summary>
        public Position? Port { get; internal set; }

        /// <summary>
        /// The steps a docked ship stays on.
        /// </summary>
        public long DockCount { get; internal set; }

        internal JsonObject Save()
        {
            return new JsonObject
            {
                ["phase"] = (int)Phase,
                ["port"] = Port?.Save(),
                ["dockCount"] = DockCount,
            };
        }

        // The port is a tile of the map
        internal static ShipMission Load(SavedObject data, GameMap map)
        {
            return new ShipMission
            {
                Phase = data.ReadEnum<ShipPhase>("phase"),
                Port = data.ReadNullableTile("port", map),
                DockCount = data.ReadInt("dockCount", 0, (int)ShipSprite.DockSteps),
            };
        }
    }
}
