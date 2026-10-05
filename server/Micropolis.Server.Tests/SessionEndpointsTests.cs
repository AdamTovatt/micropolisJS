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

using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using Micropolis.Rules;
using Microsoft.AspNetCore.Http;

namespace Micropolis.Server.Tests
{
    [TestClass]
    public sealed class SessionEndpointsTests
    {
        private const string LengthReason = "1 to 32 characters";
        private const string CharacterReason = "control or invisible formatting characters";

        [TestMethod]
        public async Task SignIn_Name_IssuesTokenForNewPlayerWithNameClaimAndNoRoles()
        {
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();

            SignedIn session = await city.SignInAsync("  Ada  ");
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
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();

            SignedIn first = await city.SignInAsync("Ada");
            SignedIn second = await city.SignInAsync("Ada");

            Assert.AreNotEqual(first.PlayerId, second.PlayerId);
        }

        [TestMethod]
        [DataRow("", LengthReason, DisplayName = "empty")]
        [DataRow("   ", LengthReason, DisplayName = "only whitespace")]
        [DataRow("abcdefghijklmnopqrstuvwxyz0123456", LengthReason, DisplayName = "33 characters")]
        [DataRow("\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600", LengthReason, DisplayName = "17 emoji, 34 UTF-16 code units")]
        [DataRow("Ada\u0007", CharacterReason, DisplayName = "a control character")]
        [DataRow("Ada\u202eEve", CharacterReason, DisplayName = "a right-to-left override")]
        [DataRow("\u200b", CharacterReason, DisplayName = "only a zero-width space")]
        [DataRow("Ada\U000E0001", CharacterReason, DisplayName = "a format character outside the Basic Multilingual Plane")]
        [DataRow("Ada\u2028Eve", CharacterReason, DisplayName = "a line separator")]
        public async Task SignIn_NameBreakingTheRule_IsBadRequestWithThatRule(string name, string reason)
        {
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();

            HttpResponseMessage response = await city.PostSignInAsync(ProtocolJson.Serialize(new SignInRequest(name)));

            Assert.AreEqual(HttpStatusCode.BadRequest, response.StatusCode);
            StringAssert.Contains((await ServerUnderTest.ReadBodyAsync<ErrorResponse>(response)).Error, reason);
        }

        [TestMethod]
        [DataRow("abcdefghijklmnopqrstuvwxyz012345", DisplayName = "32 characters")]
        [DataRow("\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600\U0001F600", DisplayName = "16 emoji, 32 UTF-16 code units")]
        [DataRow("Zoë 東京", DisplayName = "letters of any script")]
        public async Task SignIn_NameWithinTheRule_IsAccepted(string name)
        {
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();

            SignedIn session = await city.SignInAsync(name);

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
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();

            HttpResponseMessage response = await city.PostSignInAsync(body);

            Assert.AreEqual(HttpStatusCode.BadRequest, response.StatusCode);
            StringAssert.Contains((await ServerUnderTest.ReadBodyAsync<ErrorResponse>(response)).Error, "name to sign in under");
        }

        [TestMethod]
        public async Task SignIn_BodyNotUtf8_IsBadRequestWithReason()
        {
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();
            // {"name":"Ad\xff"}, where 0xff never occurs in UTF-8
            using ByteArrayContent content = new ByteArrayContent([.. Encoding.ASCII.GetBytes("{\"name\":\"Ad"), 0xff, .. Encoding.ASCII.GetBytes("\"}")]);
            content.Headers.ContentType = new MediaTypeHeaderValue("application/json");

            HttpResponseMessage response = await city.Client.PostAsync(SessionEndpoints.Path, content);

            Assert.AreEqual(HttpStatusCode.BadRequest, response.StatusCode);
            StringAssert.Contains((await ServerUnderTest.ReadBodyAsync<ErrorResponse>(response)).Error, "name to sign in under");
        }

        [TestMethod]
        [DataRow(true, DisplayName = "with its length declared")]
        [DataRow(false, DisplayName = "sent in chunks of unknown length")]
        public async Task SignIn_BodyLongerThanAnySignIn_IsTooLarge(bool lengthDeclared)
        {
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();
            using HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, SessionEndpoints.Path)
            {
                Content = new StringContent($"{{\"name\":\"{new string('a', SessionEndpoints.MaximumSignInBytes)}\"}}", Encoding.UTF8, "application/json"),
            };

            if (!lengthDeclared)
            {
                request.Content.Headers.ContentLength = null;
                request.Headers.TransferEncodingChunked = true;
            }

            HttpResponseMessage response = await city.Client.SendAsync(request);

            Assert.AreEqual(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
        }

        [TestMethod]
        public async Task SignIn_MoreThanTheLimitInAMinute_IsTooManyRequestsWithReason()
        {
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();

            for (int i = 0; i < SessionEndpoints.SignInsPerMinute; i++)
            {
                await city.SignInAsync("Ada");
            }

            HttpResponseMessage response = await city.PostSignInAsync(ProtocolJson.Serialize(new SignInRequest("Ada")));

            Assert.AreEqual(HttpStatusCode.TooManyRequests, response.StatusCode);
            ErrorResponse error = await ServerUnderTest.ReadBodyAsync<ErrorResponse>(response);
            Assert.IsFalse(string.IsNullOrWhiteSpace(error.Error));
        }

        [TestMethod]
        public async Task SignIn_ThroughTrustedProxy_LimitsEachForwardedClientApart()
        {
            await using ServerUnderTest city = await ServerUnderTest.StartAsync(trustedProxies: "10.0.0.1");

            for (int i = 0; i < SessionEndpoints.SignInsPerMinute; i++)
            {
                Assert.AreEqual(StatusCodes.Status200OK, await SignInFromAsync(city, "10.0.0.1", forwardedFor: "203.0.113.5"));
            }

            Assert.AreEqual(StatusCodes.Status200OK, await SignInFromAsync(city, "10.0.0.1", forwardedFor: "203.0.113.6"));
            Assert.AreEqual(StatusCodes.Status429TooManyRequests, await SignInFromAsync(city, "10.0.0.1", forwardedFor: "203.0.113.5"));
        }

        [TestMethod]
        public async Task SignIn_ForwardedForFromUntrustedAddress_IsIgnored()
        {
            // Otherwise any client could sign in without end by naming a new address each time
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();

            for (int i = 0; i < SessionEndpoints.SignInsPerMinute; i++)
            {
                Assert.AreEqual(StatusCodes.Status200OK, await SignInFromAsync(city, "198.51.100.7", forwardedFor: $"203.0.113.{i}"));
            }

            Assert.AreEqual(StatusCodes.Status429TooManyRequests, await SignInFromAsync(city, "198.51.100.7", forwardedFor: "203.0.113.99"));
        }

        [TestMethod]
        public async Task GetSession_NoToken_IsUnauthorizedAsTheClientExpects()
        {
            // The client takes a 401 here as the sign that this server answers, and a sign-in is needed
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();

            HttpResponseMessage response = await GetSessionAsync(city, token: null);

            Assert.AreEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        }

        [TestMethod]
        public async Task GetSession_ValidToken_AnswersThePlayer()
        {
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();
            SignedIn session = await city.SignInAsync("Ada");

            HttpResponseMessage response = await GetSessionAsync(city, session.Token);

            Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
            Assert.AreEqual(new PlayerResponse(session.PlayerId, "Ada"), await ServerUnderTest.ReadBodyAsync<PlayerResponse>(response));
        }

        [TestMethod]
        public async Task GetSession_TokenExpiredASecondAgo_IsUnauthorized()
        {
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();
            TimeSpan lifetime = TimeSpan.FromHours(1);
            string token = city.CreateToken("someone", "Ada", lifetime);
            city.Time.Advance(lifetime + TimeSpan.FromSeconds(1));

            HttpResponseMessage response = await GetSessionAsync(city, token);

            Assert.AreEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        }

        [TestMethod]
        public async Task GetSession_TokenWithoutName_IsUnauthorized()
        {
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();
            string token = city.CreateTokenWithClaims(new Claim(JwtRegisteredClaimNames.Sub, "someone"));

            HttpResponseMessage response = await GetSessionAsync(city, token);

            Assert.AreEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        }

        [TestMethod]
        public async Task GetSession_TokenWithoutExpiry_IsUnauthorized()
        {
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();
            string token = city.CreateTokenWithoutExpiry("someone", "Ada");

            HttpResponseMessage response = await GetSessionAsync(city, token);

            Assert.AreEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        }

        [TestMethod]
        public async Task GetSession_TokenInQueryString_IsUnauthorized()
        {
            // Only the city's socket takes a token from the query, where a browser has no other way to send it
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();
            SignedIn session = await city.SignInAsync("Ada");

            HttpResponseMessage response = await city.Client.GetAsync($"{SessionEndpoints.Path}?access_token={Uri.EscapeDataString(session.Token)}");

            Assert.AreEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        }

        // A sign-in arriving from the given address, carrying the given X-Forwarded-For, as a proxy sends one
        private static async Task<int> SignInFromAsync(ServerUnderTest city, string remoteAddress, string forwardedFor)
        {
            HttpContext context = await city.Server.SendAsync(request =>
            {
                request.Request.Method = HttpMethods.Post;
                request.Request.Path = SessionEndpoints.Path;
                request.Request.ContentType = "application/json";
                request.Request.Headers["X-Forwarded-For"] = forwardedFor;
                request.Request.Body = new MemoryStream(Encoding.UTF8.GetBytes(ProtocolJson.Serialize(new SignInRequest("Ada"))));
                request.Connection.RemoteIpAddress = IPAddress.Parse(remoteAddress);
            });

            return context.Response.StatusCode;
        }

        private static async Task<HttpResponseMessage> GetSessionAsync(ServerUnderTest city, string? token)
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
