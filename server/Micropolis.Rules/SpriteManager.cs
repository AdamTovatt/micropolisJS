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

using System.Text.Json.Nodes;

namespace Micropolis.Rules
{
    /// <summary>
    /// The sprites, in the order they move, and the counter that paces them.
    /// </summary>
    public sealed class SpriteManager
    {
        public long SpriteCycle { get; set; }

        public List<Sprite> SpriteList { get; set; } = [];

        public void Save(JsonObject saveData)
        {
            saveData["sprites"] = new JsonObject
            {
                ["spriteCycle"] = SpriteCycle,
                ["list"] = new JsonArray(SpriteList.Select(sprite => (JsonNode?)sprite.Save()).ToArray()),
            };
        }

        public void Load(SavedObject saveData)
        {
            saveData.ReadObject("sprites", sprites =>
            {
                SpriteCycle = sprites.ReadSafeInteger("spriteCycle");
                SpriteList = sprites.ReadObjectList("list", Sprite.Load);
            });
        }
    }
}
