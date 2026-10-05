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

using static Micropolis.Rules.TileFlags;
using static Micropolis.Rules.TileValues;

namespace Micropolis.Rules.Tests
{
    [TestClass]
    public sealed class TileTests
    {
        [TestMethod]
        public void Constructor_NoArguments_IsDirtWithNoFlags()
        {
            Tile tile = new Tile();

            Assert.AreEqual(DIRT, tile.GetValue());
            Assert.AreEqual(NOFLAGS, tile.GetFlags());
        }

        [TestMethod]
        public void Constructor_ValueAndFlags_CombinesThemInTheRawValue()
        {
            Tile tile = new Tile(FLOOD, ANIMBIT);

            Assert.AreEqual(FLOOD, tile.GetValue());
            Assert.AreEqual(ANIMBIT, tile.GetFlags());
            Assert.AreEqual(FLOOD | ANIMBIT, tile.GetRawValue());
        }

        [TestMethod]
        [DataRow(TILE_INVALID - 1)]
        [DataRow(TILE_COUNT)]
        public void Constructor_ValueOutOfRange_Throws(int value)
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => new Tile(value));
        }

        [TestMethod]
        [DataRow(0x200)]
        [DataRow(0x10000)]
        public void Constructor_FlagsOutOfRange_Throws(int flags)
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => new Tile(DIRT, flags));
        }

        [TestMethod]
        public void SetValue_ValueWithoutFlagBits_KeepsTheTileFlags()
        {
            Tile tile = new Tile(WOODS, BLBNBIT);

            tile.SetValue(DIRT);

            Assert.AreEqual(DIRT, tile.GetValue());
            Assert.AreEqual(BLBNBIT, tile.GetFlags());
        }

        [TestMethod]
        public void SetValue_ValueWithFlagBits_TakesThoseFlags()
        {
            // A river edge, which river smoothing writes with its flag
            const int riverEdge = FIRSTRIVEDGE + 8;
            Tile tile = new Tile(REDGE, BURNBIT);

            tile.SetValue(riverEdge | BULLBIT);

            Assert.AreEqual(riverEdge, tile.GetValue());
            Assert.AreEqual(BULLBIT, tile.GetFlags());
        }

        [TestMethod]
        public void SetRawValue_ValueWithFlagBits_TakesValueAndFlags()
        {
            Tile tile = new Tile(DIRT, BURNBIT);

            tile.SetRawValue(LIGHTNINGBOLT | ANIMBIT | CONDBIT);

            Assert.AreEqual(LIGHTNINGBOLT, tile.GetValue());
            Assert.AreEqual(ANIMBIT | CONDBIT, tile.GetFlags());
        }

        [TestMethod]
        public void SetRawValue_ValueWithoutFlagBits_ClearsTheFlags()
        {
            Tile tile = new Tile(FLOOD, BULLBIT);

            tile.SetRawValue(DIRT);

            Assert.AreEqual(DIRT, tile.GetRawValue());
        }

        [TestMethod]
        [DataRow(ANIMBIT, nameof(Tile.IsAnimated))]
        [DataRow(BULLBIT, nameof(Tile.IsBulldozable))]
        [DataRow(CONDBIT, nameof(Tile.IsConductive))]
        [DataRow(BURNBIT, nameof(Tile.IsCombustible))]
        [DataRow(POWERBIT, nameof(Tile.IsPowered))]
        [DataRow(ZONEBIT, nameof(Tile.IsZone))]
        public void FlagChecks_OneFlagSet_OnlyItsOwnCheckIsTrue(int flag, string check)
        {
            Tile tile = new Tile(DIRT, flag);
            Dictionary<string, bool> checks = new Dictionary<string, bool>
            {
                [nameof(Tile.IsAnimated)] = tile.IsAnimated(),
                [nameof(Tile.IsBulldozable)] = tile.IsBulldozable(),
                [nameof(Tile.IsConductive)] = tile.IsConductive(),
                [nameof(Tile.IsCombustible)] = tile.IsCombustible(),
                [nameof(Tile.IsPowered)] = tile.IsPowered(),
                [nameof(Tile.IsZone)] = tile.IsZone(),
            };

            foreach ((string name, bool isSet) in checks)
            {
                Assert.AreEqual(name == check, isSet, $"{name} with only {check}'s flag set.");
            }
        }

        [TestMethod]
        public void SetValue_BelowTheInvalidTile_Throws()
        {
            // Masked to its value bits, -2 would be the valid tile 1022
            Tile tile = new Tile();

            Assert.Throws<ArgumentOutOfRangeException>(() => tile.SetValue(TILE_INVALID - 1));
        }

        [TestMethod]
        public void SetFlags_Flags_ReplacesFlagsAndKeepsValue()
        {
            Tile tile = new Tile(RIVER, BURNBIT);

            tile.SetFlags(CONDBIT | ZONEBIT);

            Assert.AreEqual(RIVER, tile.GetValue());
            Assert.IsTrue(tile.IsConductive());
            Assert.IsTrue(tile.IsZone());
            Assert.IsFalse(tile.IsCombustible());
        }

        [TestMethod]
        public void AddAndRemoveFlags_Flags_ChangeOnlyThoseFlags()
        {
            Tile tile = new Tile(RIVER, BURNBIT);

            tile.AddFlags(POWERBIT | ANIMBIT);
            tile.RemoveFlags(BURNBIT);

            Assert.AreEqual(POWERBIT | ANIMBIT, tile.GetFlags());
            Assert.IsTrue(tile.IsPowered());
            Assert.IsTrue(tile.IsAnimated());
            Assert.IsFalse(tile.IsBulldozable());
        }

        [TestMethod]
        public void SetFrom_OtherTile_CopiesItsRawValue()
        {
            Tile tile = new Tile();

            tile.SetFrom(new Tile(CHANNEL, BULLBIT));

            Assert.AreEqual(CHANNEL | BULLBIT, tile.GetRawValue());
        }
    }
}
