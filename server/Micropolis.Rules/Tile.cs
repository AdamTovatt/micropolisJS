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
    /// A tile's value combined with its flags, as the original holds a map cell: the value in bits 0–9, the flags of
    /// <see cref="TileFlags"/> in bits 10–15.
    /// </summary>
    public sealed class Tile
    {
        private int _value;

        public Tile(int value = TileValues.DIRT, int flags = TileFlags.NOFLAGS)
        {
            ValidateArguments(value, flags, "Tile constructor");
            _value = value | flags;
        }

        public int GetValue()
        {
            return ValueFromCombinedValue(_value);
        }

        public int GetFlags()
        {
            return FlagsFromCombinedValue(_value);
        }

        public int GetRawValue()
        {
            return _value;
        }

        public void AddFlags(int flags)
        {
            ValidateFlags(flags, nameof(AddFlags));

            if (flags == TileFlags.NOFLAGS)
            {
                return;
            }

            _value |= flags;
        }

        /// <summary>
        /// Sets the value, and the flags the desired value carries in its flag bits. A desired value with no flag
        /// bits keeps the tile's flags: the map generator relies on it when it clears a tree to dirt.
        /// </summary>
        public void SetValue(int desiredValue)
        {
            if (desiredValue < TileValues.TILE_INVALID)
            {
                throw new ArgumentOutOfRangeException(nameof(desiredValue), desiredValue, $"{nameof(SetValue)} called with out-of-range value {desiredValue}.");
            }

            int value = ValueFromCombinedValue(desiredValue);
            int bitMask = FlagsToSetFromCombinedValue(desiredValue);
            Set(value, bitMask);
        }

        public void SetFlags(int flags)
        {
            ValidateFlags(flags, nameof(SetFlags));

            int existingValue = _value & ~TileFlags.ALLBITS;
            _value = existingValue | flags;
        }

        public void RemoveFlags(int flags)
        {
            ValidateFlags(flags, nameof(RemoveFlags));

            if (flags == TileFlags.NOFLAGS)
            {
                return;
            }

            _value &= ~flags;
        }

        public void SetFrom(Tile tile)
        {
            _value = tile._value;
        }

        public void Set(int value, int flags)
        {
            ValidateArguments(value, flags, nameof(Set));

            _value = value | flags;
        }

        public bool IsAnimated()
        {
            return CheckBits(TileFlags.ANIMBIT);
        }

        public bool IsBulldozable()
        {
            return CheckBits(TileFlags.BULLBIT);
        }

        public bool IsConductive()
        {
            return CheckBits(TileFlags.CONDBIT);
        }

        public bool IsCombustible()
        {
            return CheckBits(TileFlags.BURNBIT);
        }

        public bool IsPowered()
        {
            return CheckBits(TileFlags.POWERBIT);
        }

        public bool IsZone()
        {
            return CheckBits(TileFlags.ZONEBIT);
        }

        private static int ValueFromCombinedValue(int value)
        {
            return value & TileFlags.BIT_MASK;
        }

        private static int FlagsFromCombinedValue(int value)
        {
            return value & TileFlags.ALLBITS;
        }

        private int FlagsToSetFromCombinedValue(int value)
        {
            int embeddedFlags = FlagsFromCombinedValue(value);
            return embeddedFlags > 0 ? embeddedFlags : GetFlags();
        }

        private bool CheckBits(int flag)
        {
            return (_value & flag) > 0;
        }

        private static void ValidateArguments(int value, int flags, string context)
        {
            ValidateValue(value, context);
            ValidateFlags(flags, context);
        }

        private static void ValidateValue(int value, string context)
        {
            if (value < TileValues.TILE_INVALID || value >= TileValues.TILE_COUNT)
            {
                throw new ArgumentOutOfRangeException(nameof(value), value, $"{context} called with out-of-range value {value}.");
            }
        }

        private static void ValidateFlags(int flags, string context)
        {
            if (flags != 0 && (flags < TileFlags.BIT_START || (flags & ~TileFlags.ALLBITS) != 0))
            {
                throw new ArgumentOutOfRangeException(nameof(flags), flags, $"{context} called with out-of-range flags 0x{flags:x}.");
            }
        }
    }
}
