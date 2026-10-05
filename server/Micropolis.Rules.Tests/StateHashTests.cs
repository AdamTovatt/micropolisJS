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
    [TestClass]
    public sealed class StateHashTests
    {
        [TestMethod]
        public void HashSavedState_State_IsSha256OfCanonicalTextInLowercaseHex()
        {
            // sha256 of the bytes {"a":"é","b":1}, computed with coreutils' sha256sum, as test/canonicalJson.ts checks
            JsonObject state = new JsonObject { ["b"] = 1, ["a"] = "é" };

            Assert.AreEqual("aa58fba8483623bed37c1b02edfccbdd9a53123837c20bfa4cb4049993a2872e", StateHash.HashSavedState(state));
        }
    }
}
