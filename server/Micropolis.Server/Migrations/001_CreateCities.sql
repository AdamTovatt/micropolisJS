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

-- One row per city, by its id: its saved game as the game saves one, when it was last saved, and when it was last
-- opened, that is loaded from the store for a player entering it, or started. The times are UTC, in ISO 8601.
CREATE TABLE cities (
    id TEXT NOT NULL PRIMARY KEY,
    saved_game TEXT NOT NULL,
    last_saved_at TEXT NOT NULL,
    last_opened_at TEXT NOT NULL
) STRICT;
