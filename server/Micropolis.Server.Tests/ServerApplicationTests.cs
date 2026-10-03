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

using Microsoft.AspNetCore.Builder;

namespace Micropolis.Server.Tests
{
    [TestClass]
    public sealed class ServerApplicationTests
    {
        [TestMethod]
        [DataRow(null, DisplayName = "no secret")]
        [DataRow("", DisplayName = "an empty secret")]
        [DataRow("   ", DisplayName = "a whitespace secret")]
        public void Build_WithoutSigningSecret_Fails(string? secret)
        {
            InvalidOperationException exception = Assert.ThrowsExactly<InvalidOperationException>(
                () => ServerApplication.Build(TestCity.CreateBuilder(secret)));

            StringAssert.Contains(exception.Message, ServerApplication.JwtSecretKey);
            StringAssert.Contains(exception.Message, "required");
        }

        [TestMethod]
        public void Build_SigningSecretShorterThan32Bytes_Fails()
        {
            InvalidOperationException exception = Assert.ThrowsExactly<InvalidOperationException>(
                () => ServerApplication.Build(TestCity.CreateBuilder(new string('x', 31))));

            StringAssert.Contains(exception.Message, "32 bytes");
        }

        [TestMethod]
        public async Task Build_SigningSecret_Starts()
        {
            await using WebApplication app = ServerApplication.Build(TestCity.CreateBuilder(TestCity.Secret));

            await app.StartAsync();
            await app.StopAsync();
        }
    }
}
