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

using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;

namespace Micropolis.Server.Tests
{
    [TestClass]
    public sealed class ServerApplicationTests
    {
        // The city database a server the test builds makes
        private string _database = "";

        [TestInitialize]
        public void NewDatabase()
        {
            _database = TestCityDatabase.NewFile();
        }

        [TestCleanup]
        public void DeleteDatabase()
        {
            TestCityDatabase.Delete(_database);
        }

        [TestMethod]
        [DataRow(null, DisplayName = "no secret")]
        [DataRow("", DisplayName = "an empty secret")]
        [DataRow("   ", DisplayName = "a whitespace secret")]
        public void Build_WithoutSigningSecret_Fails(string? secret)
        {
            InvalidOperationException exception = Assert.ThrowsExactly<InvalidOperationException>(
                () => ServerApplication.Build(ServerUnderTest.CreateBuilder(_database, secret)));

            StringAssert.Contains(exception.Message, ServerApplication.JwtSecretKey);
            StringAssert.Contains(exception.Message, "required");
        }

        [TestMethod]
        public void Build_SigningSecretShorterThan32Bytes_Fails()
        {
            InvalidOperationException exception = Assert.ThrowsExactly<InvalidOperationException>(
                () => ServerApplication.Build(ServerUnderTest.CreateBuilder(_database, new string('x', 31))));

            StringAssert.Contains(exception.Message, "32 bytes");
        }

        [TestMethod]
        [DataRow(ServerApplication.NoTrustedProxies, DisplayName = "no proxies")]
        [DataRow("10.0.0.1", DisplayName = "one proxy")]
        [DataRow("10.0.0.1, 2001:db8::1", DisplayName = "two proxies")]
        public async Task Build_SigningSecretAndTrustedProxies_Starts(string trustedProxies)
        {
            await using WebApplication app = ServerApplication.Build(ServerUnderTest.CreateBuilder(_database, ServerUnderTest.Secret, trustedProxies));

            await app.StartAsync();
            await app.StopAsync();
        }

        [TestMethod]
        [DataRow(null, DisplayName = "no setting")]
        [DataRow("", DisplayName = "an empty setting")]
        public void Build_WithoutTrustedProxies_Fails(string? trustedProxies)
        {
            InvalidOperationException exception = Assert.ThrowsExactly<InvalidOperationException>(
                () => ServerApplication.Build(ServerUnderTest.CreateBuilder(_database, ServerUnderTest.Secret, trustedProxies)));

            StringAssert.Contains(exception.Message, ServerApplication.TrustedProxiesKey);
            StringAssert.Contains(exception.Message, "required");
        }

        [TestMethod]
        [DataRow(null, DisplayName = "no setting")]
        [DataRow("", DisplayName = "an empty setting")]
        [DataRow("   ", DisplayName = "a whitespace setting")]
        public void Build_WithoutCityDatabase_Fails(string? cityDatabase)
        {
            WebApplicationBuilder builder = ServerUnderTest.CreateBuilder(_database, ServerUnderTest.Secret);
            builder.Configuration[ServerApplication.CityDatabaseKey] = cityDatabase;

            InvalidOperationException exception = Assert.ThrowsExactly<InvalidOperationException>(() => ServerApplication.Build(builder));

            StringAssert.Contains(exception.Message, ServerApplication.CityDatabaseKey);
            StringAssert.Contains(exception.Message, "required");
        }

        [TestMethod]
        public async Task Build_CityDatabaseThatIsntOne_FailsAsTheStore()
        {
            await TestCityDatabase.WriteNotADatabaseAsync(_database);

            Assert.ThrowsExactly<CityStoreException>(() => ServerApplication.Build(ServerUnderTest.CreateBuilder(_database, ServerUnderTest.Secret)));
        }

        [TestMethod]
        public async Task Build_NewCityDatabase_MakesItForTheStore()
        {
            await using WebApplication app = ServerApplication.Build(ServerUnderTest.CreateBuilder(_database, ServerUnderTest.Secret));
            CityStore store = app.Services.GetRequiredService<CityStore>();
            string city = CityId.New();

            await store.WriteAsync(city, "a save");

            Assert.AreEqual("a save", await store.ReadAsync(city));
        }

        [TestMethod]
        public void Build_CityClockNeitherManualNorUnset_Fails()
        {
            WebApplicationBuilder builder = ServerUnderTest.CreateBuilder(_database, ServerUnderTest.Secret);
            builder.Configuration[ServerApplication.CityClockKey] = "fast";

            InvalidOperationException exception = Assert.ThrowsExactly<InvalidOperationException>(() => ServerApplication.Build(builder));

            StringAssert.Contains(exception.Message, ServerApplication.CityClockKey);
            StringAssert.Contains(exception.Message, "\"fast\"");
        }

        [TestMethod]
        [TestCategory(ReleaseBuild.Category)]
        public void Build_ManualCityClockInAReleaseBuild_Fails()
        {
            if (DebugChannel.IsBuiltIn)
            {
                Assert.Inconclusive("A Debug build takes the manual clock.");
            }

            WebApplicationBuilder builder = ServerUnderTest.CreateBuilder(_database, ServerUnderTest.Secret);
            builder.Configuration[ServerApplication.CityClockKey] = ServerApplication.ManualClock;

            InvalidOperationException exception = Assert.ThrowsExactly<InvalidOperationException>(() => ServerApplication.Build(builder));

            StringAssert.Contains(exception.Message, "debug channel");
        }

        [TestMethod]
        public async Task Build_RelativeCityDatabase_ResolvesItAgainstTheContentRoot()
        {
            string relative = Path.GetFileName(_database);
            WebApplicationBuilder builder = ServerUnderTest.CreateBuilder(relative, ServerUnderTest.Secret);
            string resolved = Path.Combine(builder.Environment.ContentRootPath, relative);

            try
            {
                await using WebApplication app = ServerApplication.Build(builder);

                Assert.AreEqual(resolved, app.Services.GetRequiredService<CityStore>().Location);
                Assert.IsTrue(File.Exists(resolved), "The server didn't make the database where it resolved it");
            }
            finally
            {
                TestCityDatabase.Delete(resolved);
            }
        }

        [TestMethod]
        public void Build_TrustedProxyNotAnAddress_Fails()
        {
            InvalidOperationException exception = Assert.ThrowsExactly<InvalidOperationException>(
                () => ServerApplication.Build(ServerUnderTest.CreateBuilder(_database, ServerUnderTest.Secret, "10.0.0.1, proxy.example")));

            StringAssert.Contains(exception.Message, "proxy.example");
        }
    }
}
