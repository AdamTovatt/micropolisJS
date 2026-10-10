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
    /// The park tool, as the original's <c>putDownPark</c>: woods or, one time in five, a
    /// fountain, on plain dirt.
    /// </summary>
    internal sealed class ParkTool : CityTool, IErasedTile
    {
        public ParkTool(GameMap map)
            : base(10, map)
        {
        }

        /// <summary>
        /// Bare land, where the tile is a park's woods or fountain, which erasing the park leaves; or null for any other
        /// tile, the wild woods among them.
        /// </summary>
        public Piece? PieceLeft(int tileValue)
        {
            return TileUtils.IsPark(tileValue) ? new Piece(TileValues.DIRT, TileFlags.NOFLAGS) : null;
        }

        // As the original, the tool picks what to plant before it looks at the tile, so it draws from the stream even
        // where it can't plant. It plants only on dirt without flags, as the original compares the tile with its flags.
        protected override void DoTool(int x, int y, RandomStream random, bool autoBulldoze)
        {
            int value = random.GetRandom(4);
            Tile tile = WorldEffects.GetTile(x, y);

            if (tile.GetRawValue() != TileValues.DIRT)
            {
                Result = TileUtils.IsOpenWater(tile.GetValue()) ? Outcome.OnWater : Outcome.NeedsBulldoze;
                return;
            }

            if (value == 4)
            {
                WorldEffects.SetTile(x, y, TileValues.FOUNTAIN, TileFlags.BLBNBIT | TileFlags.ANIMBIT);
            }
            else
            {
                WorldEffects.SetTile(x, y, value + TileValues.WOODS2, TileFlags.BLBNBIT);
            }

            AddCost(ToolCost);
            Result = Outcome.Ok;
        }
    }
}
