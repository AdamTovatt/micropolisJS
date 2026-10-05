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

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// A place in a saved state, by its dotted path of keys, each but the first perhaps with a list index after it:
    /// <c>sprites.list[0].frame</c>.
    /// </summary>
    internal static class SavePaths
    {
        /// <summary>
        /// The object that holds the path's last key, and that key.
        /// </summary>
        public static (JsonObject Parent, string Key) Locate(JsonNode save, string path)
        {
            int dot = path.LastIndexOf('.');
            return dot < 0 ? (save.AsObject(), path) : (ObjectAt(save, path[..dot]), path[(dot + 1)..]);
        }

        public static JsonObject ObjectAt(JsonNode save, string path)
        {
            return NodeAt(save, path)!.AsObject();
        }

        public static JsonNode? NodeAt(JsonNode save, string path)
        {
            JsonNode? node = save;

            foreach (string part in path.Split('.', StringSplitOptions.RemoveEmptyEntries))
            {
                int bracket = part.IndexOf('[');
                node = bracket < 0 ? node![part] : node![part[..bracket]]![int.Parse(part[(bracket + 1)..^1])];
            }

            return node;
        }
    }
}
