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
using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using Micropolis.Rules;

namespace Micropolis.Server.Tests
{
    [TestClass]
    public sealed class SessionEndpointsTests
    {
        [TestMethod]
        public async Task SignIn_Name_IssuesTokenForNewPlayerWithNameClaimAndNoRoles()
        {
            await using TestCity city = await TestCity.StartAsync();

            SessionResponse session = await city.SignInAsync("  Ada  ");
            JwtSecurityToken token = new JwtSecurityTokenHandler().ReadJwtToken(session.Token);

            Assert.AreEqual("Ada", session.Name);
            Assert.AreEqual(session.PlayerId, token.Subject);
            Assert.AreEqual("Ada", token.Claims.Single(claim => claim.Type == PlayerClaims.Name).Value);
            Assert.IsFalse(token.Claims.Any(claim => claim.Type == ClaimTypes.Role || claim.Type == "role"));
            Assert.AreEqual(city.Time.GetUtcNow().AddDays(30).ToUnixTimeSeconds(), new DateTimeOffset(token.ValidTo).ToUnixTimeSeconds());
        }

        [TestMethod]
        public async Task SignIn_SameNameTwice_GivesTwoPlayers()
        {
            await using TestCity city = await TestCity.StartAsync();

            SessionResponse first = await city.SignInAsync("Ada");
            SessionResponse second = await city.SignInAsync("Ada");

            Assert.AreNotEqual(first.PlayerId, second.PlayerId);
        }

        [TestMethod]
        [DataRow("", DisplayName = "empty")]
        [DataRow("   ", DisplayName = "only whitespace")]
        [DataRow("abcdefghijklmnopqrstuvwxyz0123456", DisplayName = "33 characters")]
        [DataRow("\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600", DisplayName = "17 emoji, 34 UTF-16 code units")]
        [DataRow("Ada\u0007", DisplayName = "a control character")]
        [DataRow("Ada\u202eEve", DisplayName = "a right-to-left override")]
        [DataRow("\u200b", DisplayName = "only a zero-width space")]
        [DataRow("Ada\U000E0001", DisplayName = "a format character outside the Basic Multilingual Plane")]
        [DataRow("Ada\u2028Eve", DisplayName = "a line separator")]
        public async Task SignIn_NameBreakingTheRule_IsBadRequestWithReason(string name)
        {
            await using TestCity city = await TestCity.StartAsync();

            HttpResponseMessage response = await city.PostSignInAsync(ProtocolJson.Serialize(new SignInRequest(name)));

            Assert.AreEqual(HttpStatusCode.BadRequest, response.StatusCode);
            ErrorResponse error = await TestCity.ReadBodyAsync<ErrorResponse>(response);
            Assert.IsFalse(string.IsNullOrWhiteSpace(error.Error));
        }

        [TestMethod]
        [DataRow("abcdefghijklmnopqrstuvwxyz012345", DisplayName = "32 characters")]
        [DataRow("\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600", DisplayName = "16 emoji, 32 UTF-16 code units")]
        [DataRow("Zoë 東京", DisplayName = "letters of any script")]
        public async Task SignIn_NameWithinTheRule_IsAccepted(string name)
        {
            await using TestCity city = await TestCity.StartAsync();

            SessionResponse session = await city.SignInAsync(name);

            Assert.AreEqual(name, session.Name);
        }

        [TestMethod]
        [DataRow("""{"name":"Ada\ud83d"}""", DisplayName = "a lone surrogate")]
        [DataRow("{}", DisplayName = "no name")]
        [DataRow("""{"name":null}""", DisplayName = "a null name")]
        [DataRow("""{"name":"Ada","role":"admin"}""", DisplayName = "an unknown field")]
        [DataRow("Ada", DisplayName = "not JSON")]
        public async Task SignIn_BodyNotASignIn_IsBadRequestWithReason(string body)
        {
            // Written by hand: a serializer would write none of these, and would replace the lone surrogate, as a
            // browser's JSON.stringify does not
            await using TestCity city = await TestCity.StartAsync();

            HttpResponseMessage response = await city.PostSignInAsync(body);

            Assert.AreEqual(HttpStatusCode.BadRequest, response.StatusCode);
            ErrorResponse error = await TestCity.ReadBodyAsync<ErrorResponse>(response);
            Assert.IsFalse(string.IsNullOrWhiteSpace(error.Error));
        }

        [TestMethod]
        public async Task SignIn_MoreThanTheLimitInAMinute_IsTooManyRequestsWithReason()
        {
            await using TestCity city = await TestCity.StartAsync();

            for (int i = 0; i < ServerApplication.SignInsPerMinute; i++)
            {
                await city.SignInAsync("Ada");
            }

            HttpResponseMessage response = await city.PostSignInAsync(ProtocolJson.Serialize(new SignInRequest("Ada")));

            Assert.AreEqual(HttpStatusCode.TooManyRequests, response.StatusCode);
            ErrorResponse error = await TestCity.ReadBodyAsync<ErrorResponse>(response);
            Assert.IsFalse(string.IsNullOrWhiteSpace(error.Error));
        }

        [TestMethod]
        public async Task GetSession_ValidToken_AnswersThePlayer()
        {
            await using TestCity city = await TestCity.StartAsync();
            SessionResponse session = await city.SignInAsync("Ada");

            HttpResponseMessage response = await GetSessionAsync(city, session.Token);

            Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
            Assert.AreEqual(new PlayerResponse(session.PlayerId, "Ada"), await TestCity.ReadBodyAsync<PlayerResponse>(response));
        }

        [TestMethod]
        public async Task GetSession_TokenExpiredASecondAgo_IsUnauthorized()
        {
            await using TestCity city = await TestCity.StartAsync();
            string token = TestCity.CreateExpiredToken("someone", "Ada");

            HttpResponseMessage response = await GetSessionAsync(city, token);

            Assert.AreEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        }

        [TestMethod]
        public async Task GetSession_TokenWithoutName_IsUnauthorized()
        {
            await using TestCity city = await TestCity.StartAsync();
            string token = TestCity.CreateTokenWithClaims(new Claim(JwtRegisteredClaimNames.Sub, "someone"));

            HttpResponseMessage response = await GetSessionAsync(city, token);

            Assert.AreEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        }

        [TestMethod]
        public async Task GetSession_TokenWithoutExpiry_IsUnauthorized()
        {
            await using TestCity city = await TestCity.StartAsync();
            string token = TestCity.CreateTokenWithoutExpiry("someone", "Ada");

            HttpResponseMessage response = await GetSessionAsync(city, token);

            Assert.AreEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        }

        [TestMethod]
        public async Task GetSession_TokenInQueryString_IsUnauthorized()
        {
            // Only the city's socket takes a token from the query, where a browser has no other way to send it
            await using TestCity city = await TestCity.StartAsync();
            SessionResponse session = await city.SignInAsync("Ada");

            HttpResponseMessage response = await city.Client.GetAsync($"{SessionEndpoints.Path}?access_token={Uri.EscapeDataString(session.Token)}");

            Assert.AreEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        }

        [TestMethod]
        public async Task GetSession_NoToken_IsUnauthorized()
        {
            await using TestCity city = await TestCity.StartAsync();

            HttpResponseMessage response = await GetSessionAsync(city, token: null);

            Assert.AreEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        }

        private static async Task<HttpResponseMessage> GetSessionAsync(TestCity city, string? token)
        {
            using HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Get, SessionEndpoints.Path);

            if (token != null)
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            }

            return await city.Client.SendAsync(request);
        }
    }
}
