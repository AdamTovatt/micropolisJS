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
    /// Which hover boxes a player's tool makes on a map, as <see cref="CommandReader.BoundsRejection"/> says which
    /// commands are a player's: the server passes on no other.
    /// </summary>
    public static class CursorBounds
    {
        /// <summary>
        /// The side in tiles of the box a tool shows: what the tool puts down, and one tile for the query tool.
        /// </summary>
        public static int SizeOf(CursorTool tool)
        {
            return tool == CursorTool.Query ? 1 : CityTools.Sizes[ToolOf(tool)];
        }

        /// <summary>
        /// Whether the box's tile is on a map of this size, and the box is its tool's size.
        /// </summary>
        public static bool Fits(Cursor cursor, int width, int height)
        {
            return cursor.X >= 0 && cursor.X < width && cursor.Y >= 0 && cursor.Y < height && cursor.Size == SizeOf(cursor.Tool);
        }

        // The tool a hover box's tool names, which shares its protocol name
        private static ToolName ToolOf(CursorTool tool)
        {
            return ProtocolJson.TryParseName(ProtocolJson.Name(tool), out ToolName name)
                ? name
                : throw new InvalidOperationException($"No tool has the hover box tool {tool}'s name.");
        }
    }
}
