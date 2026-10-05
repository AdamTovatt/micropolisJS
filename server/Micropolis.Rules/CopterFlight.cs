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
    /// Where a helicopter is on its flight.
    /// </summary>
    public enum CopterPhase
    {
        /// <summary>
        /// Flying to the block of traffic it reports.
        /// </summary>
        ToTraffic = 0,

        /// <summary>
        /// Flying back to where it took off, its <see cref="Sprite.OrigX"/> and <see cref="Sprite.OrigY"/>.
        /// </summary>
        Returning = 1,
    }

    /// <summary>
    /// A helicopter's flight, which <see cref="CopterSprite"/> flies: to a block of traffic, or back. A flight changes by
    /// being replaced, so a helicopter flying to traffic always has its block and a returning one never does.
    /// </summary>
    public sealed class CopterFlight
    {
        private CopterFlight(CopterPhase phase, Position? block)
        {
            Phase = phase;
            Block = block;
        }

        public static CopterFlight Returning { get; } = new CopterFlight(CopterPhase.Returning, null);

        public CopterPhase Phase { get; }

        /// <summary>
        /// The top-left tile of the block of traffic a helicopter flies to, and <see langword="null"/> for a returning
        /// helicopter.
        /// </summary>
        public Position? Block { get; }

        /// <summary>
        /// A helicopter flying to the block of traffic whose top-left tile is given.
        /// </summary>
        public static CopterFlight ToTraffic(Position block)
        {
            return new CopterFlight(CopterPhase.ToTraffic, block);
        }

        internal JsonObject Save()
        {
            return new JsonObject
            {
                ["phase"] = (int)Phase,
                ["block"] = Block?.Save(),
            };
        }

        // The block is a tile of the map, which a helicopter flying to traffic has and a returning one hasn't
        internal static CopterFlight Load(SavedObject data, GameMap map)
        {
            if (data.ReadEnum<CopterPhase>("phase") == CopterPhase.Returning)
            {
                data.ReadNull("block", "must be null for a returning helicopter");
                return Returning;
            }

            return ToTraffic(data.ReadTile("block", map));
        }
    }
}
