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
    /// The guards in the reader of <c>conformance/canonicalJson.json</c>, so the canonical text's tests cannot pass
    /// over vectors the file lost.
    /// </summary>
    [TestClass]
    public sealed class CanonicalJsonVectorsTests
    {
        private static readonly string FileText = ConformanceFile.Read("canonicalJson.json");

        [TestMethod]
        public void Parse_SharedFile_ReadsIt()
        {
            Assert.IsNotEmpty(CanonicalJsonVectors.Parse(FileText).Numbers);
        }

        [TestMethod]
        [DataRow("no numbers", "no-numbers", "numbers is empty")]
        [DataRow("no strings", "no-strings", "strings is empty")]
        [DataRow("no documents", "no-documents", "documents is empty")]
        [DataRow("a number with no text", "number-without-text", "text")]
        public void Parse_BrokenFile_Throws(string description, string change, string message)
        {
            JsonObject file = JsonNode.Parse(FileText)!.AsObject();
            Break(file, change);

            ConformanceAssert.Broken(() => CanonicalJsonVectors.Parse(file.ToJsonString()), description, message);
        }

        [TestMethod]
        [DataRow("0x3ff")]
        [DataRow("3ff0000000000000xx")]
        public void NumberVectorValue_MalformedBits_Throws(string bits)
        {
            InvalidDataException exception = Assert.Throws<InvalidDataException>(() => new NumberVector(bits, "1").Value);

            StringAssert.Contains(exception.Message, "sixteen hex digits");
        }

        private static void Break(JsonObject file, string change)
        {
            switch (change)
            {
                case "no-numbers":
                    file["numbers"] = new JsonArray();
                    break;
                case "no-strings":
                    file["strings"] = new JsonArray();
                    break;
                case "no-documents":
                    file["documents"] = new JsonArray();
                    break;
                case "number-without-text":
                    file["numbers"]![0]!.AsObject().Remove("text");
                    break;
                default:
                    throw new ArgumentException($"No change named {change}.", nameof(change));
            }
        }
    }
}
