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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import type { SessionStore, StoredSession } from "../src/cityClient";
import { isObject } from "../src/storage";

// The command line's sessions, one for each server, kept in a file as a browser keeps its own in localStorage, so the
// command line signs in once and is the same player on every run

// The file MICROPOLIS_SESSIONS names, or sessions.json in the user's configuration directory
export function sessionFilePath(): string {
  const named = process.env.MICROPOLIS_SESSIONS;
  if (named !== undefined && named !== "") {
    return named;
  }

  const config = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(config, "micropolis", "sessions.json");
}

// The session for the server at the origin, in the file, which holds a session for each origin
export function fileSessionStore(path: string, origin: string): SessionStore {
  return {
    load: () => {
      const session = readSessions(path)[origin];
      return isObject(session) && typeof session.token === "string" && typeof session.name === "string"
        ? {token: session.token, name: session.name}
        : null;
    },
    save: (session: StoredSession) => {
      const sessions = readSessions(path);
      sessions[origin] = session;
      mkdirSync(dirname(path), {recursive: true});
      // The token signs in as the player, so only the user reads it
      writeFileSync(path, JSON.stringify(sessions, null, 2) + "\n", {mode: 0o600});
    },
  };
}

function readSessions(path: string): Record<string, unknown> {
  if (!existsSync(path)) {
    return {};
  }

  const sessions: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!isObject(sessions)) {
    throw new Error(`${path} doesn't hold sessions`);
  }

  return sessions;
}
