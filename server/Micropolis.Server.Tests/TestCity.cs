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

using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using EasyReasy.Auth;
using Micropolis.Rules;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Time.Testing;
using Microsoft.IdentityModel.Tokens;

namespace Micropolis.Server.Tests
{
    /// <summary>
    /// The real server on a <see cref="TestServer"/>, with its own signing secret and a clock the test moves.
    /// </summary>
    internal sealed class TestCity : IAsyncDisposable
    {
        public const string Secret = "test-only-signing-secret-for-the-server-tests";

        private TestCity(WebApplication app, FakeTimeProvider time)
        {
            App = app;
            Time = time;
            Server = app.GetTestServer();
            Client = Server.CreateClient();
        }

        public WebApplication App { get; }
        public FakeTimeProvider Time { get; }
        public TestServer Server { get; }
        public HttpClient Client { get; }

        public static async Task<TestCity> StartAsync(string trustedProxies = ServerApplication.NoTrustedProxies)
        {
            FakeTimeProvider time = new FakeTimeProvider();
            WebApplicationBuilder builder = CreateBuilder(Secret, trustedProxies);
            builder.Services.AddSingleton<TimeProvider>(time);

            WebApplication app = ServerApplication.Build(builder);
            await app.StartAsync();
            return new TestCity(app, time);
        }

        /// <summary>
        /// A builder configured as the tests run the server: the given secret and trusted proxies, pinned over any in
        /// the environment.
        /// </summary>
        public static WebApplicationBuilder CreateBuilder(string? secret, string? trustedProxies = ServerApplication.NoTrustedProxies)
        {
            WebApplicationBuilder builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Testing" });
            builder.Configuration.AddInMemoryCollection([
                new KeyValuePair<string, string?>(ServerApplication.JwtSecretKey, secret),
                new KeyValuePair<string, string?>(ServerApplication.TrustedProxiesKey, trustedProxies),
            ]);
            builder.WebHost.UseTestServer();
            builder.Logging.ClearProviders();
            return builder;
        }

        /// <summary>
        /// Signs in a new player, giving the player id the token's subject carries along with the session.
        /// </summary>
        public async Task<SignedIn> SignInAsync(string name)
        {
            HttpResponseMessage response = await PostSignInAsync(ProtocolJson.Serialize(new SignInRequest(name)));
            response.EnsureSuccessStatusCode();
            SessionResponse session = await ReadBodyAsync<SessionResponse>(response);
            return new SignedIn(session.Token, new JwtSecurityTokenHandler().ReadJwtToken(session.Token).Subject, session.Name);
        }

        public async Task<HttpResponseMessage> PostSignInAsync(string body)
        {
            using StringContent content = new StringContent(body, Encoding.UTF8, "application/json");
            return await Client.PostAsync(SessionEndpoints.Path, content);
        }

        /// <summary>
        /// The response's body, read as the client's protocol reads it.
        /// </summary>
        public static async Task<TBody> ReadBodyAsync<TBody>(HttpResponseMessage response) where TBody : SessionBody
        {
            return ProtocolJson.DeserializeSessionBody<TBody>(await response.Content.ReadAsStringAsync());
        }

        /// <summary>
        /// A token the server's own token service mints on the server's clock, for the lifetimes sign-in never issues.
        /// </summary>
        public string CreateToken(string playerId, string name, TimeSpan lifetime)
        {
            IJwtTokenService tokens = App.Services.GetRequiredService<IJwtTokenService>();
            return tokens.CreateToken(playerId, PlayerClaims.AuthType, PlayerClaims.For(name), [], Time.GetUtcNow().Add(lifetime).UtcDateTime);
        }

        /// <summary>
        /// A token signed with this server's secret, valid for a day on the server's clock, carrying only the given
        /// claims besides the authentication type the token service adds.
        /// </summary>
        public string CreateTokenWithClaims(params Claim[] claims)
        {
            DateTime now = Time.GetUtcNow().UtcDateTime;
            return SignToken(claims, now.AddMinutes(-10), now.AddDays(1));
        }

        /// <summary>
        /// A token signed with this server's secret, valid from ten minutes ago on the server's clock, with no expiry.
        /// </summary>
        public string CreateTokenWithoutExpiry(string playerId, string name)
        {
            return SignToken([new Claim(JwtRegisteredClaimNames.Sub, playerId), .. PlayerClaims.For(name)], Time.GetUtcNow().UtcDateTime.AddMinutes(-10), expires: null);
        }

        private static string SignToken(IEnumerable<Claim> claims, DateTime notBefore, DateTime? expires)
        {
            SigningCredentials credentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Secret)), SecurityAlgorithms.HmacSha256);
            JwtSecurityToken token = new JwtSecurityToken(
                claims: [new Claim("auth_type", PlayerClaims.AuthType), .. claims],
                notBefore: notBefore,
                expires: expires,
                signingCredentials: credentials);

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        /// <summary>
        /// Connects to the city's socket as a browser does, with the token in the query string and no header.
        /// </summary>
        public async Task<TestSocket> ConnectAsync(string token)
        {
            WebSocketClient client = Server.CreateWebSocketClient();
            Uri uri = new Uri(Server.BaseAddress, $"{CityEndpoint.Path}?access_token={Uri.EscapeDataString(token)}");
            return new TestSocket(await client.ConnectAsync(uri, CancellationToken.None));
        }

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await App.DisposeAsync();
        }
    }

    /// <summary>
    /// A signed-in player as the tests know them.
    /// </summary>
    internal sealed record SignedIn(string Token, string PlayerId, string Name);
}
