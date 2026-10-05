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
    /// The flag bits of a tile's raw value, under the original's names, so the rules read side by side with it.
    /// </summary>
    public static class TileFlags
    {
        public const int NOFLAGS = 0x0000;
        public const int POWERBIT = 0x8000; // bit 15, tile has power.
        public const int CONDBIT = 0x4000; // bit 14. tile can conduct electricity.
        public const int BURNBIT = 0x2000; // bit 13, tile can be lit.
        public const int BULLBIT = 0x1000; // bit 12, tile is bulldozable.
        public const int ANIMBIT = 0x0800; // bit 11, tile is animated.
        public const int ZONEBIT = 0x0400; // bit 10, tile is the center tile of the zone.

        public const int BLBNBIT = BULLBIT | BURNBIT;
        public const int BLBNCNBIT = BULLBIT | BURNBIT | CONDBIT;
        public const int BNCNBIT = BURNBIT | CONDBIT;
        public const int ASCBIT = ANIMBIT | CONDBIT | BURNBIT;
        public const int ALLBITS = POWERBIT | CONDBIT | BURNBIT | BULLBIT | ANIMBIT | ZONEBIT;

        public const int BIT_START = 0x400;
        public const int BIT_END = 0x8000;
        public const int BIT_MASK = BIT_START - 1;
    }
}
