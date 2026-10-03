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
using System.Net.WebSockets;
using System.Security.Claims;
using EasyReasy.Auth;
using Micropolis.Rules;
using Microsoft.AspNetCore.TestHost;

namespace Micropolis.Server.Tests
{
    [TestClass]
    public sealed class CityEndpointTests
    {
        [TestMethod]
        public async Task Connect_NoToken_IsRefused()
        {
            await using TestCity city = await TestCity.StartAsync();
            WebSocketClient client = city.Server.CreateWebSocketClient();

            InvalidOperationException exception = await Assert.ThrowsAsync<InvalidOperationException>(
                () => client.ConnectAsync(new Uri(city.Server.BaseAddress, CityEndpoint.Path), CancellationToken.None));

            StringAssert.Contains(exception.Message, "401");
        }

        [TestMethod]
        public async Task Connect_TokenSignedWithAnotherSecret_IsRefused()
        {
            await using TestCity city = await TestCity.StartAsync();
            string token = new JwtTokenService("another-secret-that-signs-nothing-here-at-all", issuer: null, audience: null, city.Time)
                .CreateToken("someone", PlayerClaims.AuthType, PlayerClaims.For("Eve"), [], city.Time.GetUtcNow().AddDays(1).UtcDateTime);

            InvalidOperationException exception = await Assert.ThrowsAsync<InvalidOperationException>(() => city.ConnectAsync(token));

            StringAssert.Contains(exception.Message, "401");
        }

        [TestMethod]
        public async Task Connect_TokenExpiredASecondAgo_IsRefused()
        {
            await using TestCity city = await TestCity.StartAsync();
            TimeSpan lifetime = TimeSpan.FromHours(1);
            string token = city.CreateToken("someone", "Ada", lifetime);
            city.Time.Advance(lifetime + TimeSpan.FromSeconds(1));

            InvalidOperationException exception = await Assert.ThrowsAsync<InvalidOperationException>(() => city.ConnectAsync(token));

            StringAssert.Contains(exception.Message, "401");
        }

        [TestMethod]
        public async Task Connect_TokenWithoutName_IsRefused()
        {
            await using TestCity city = await TestCity.StartAsync();
            string token = city.CreateTokenWithClaims(new Claim(JwtRegisteredClaimNames.Sub, "someone"));

            InvalidOperationException exception = await Assert.ThrowsAsync<InvalidOperationException>(() => city.ConnectAsync(token));

            StringAssert.Contains(exception.Message, "401");
        }

        [TestMethod]
        public async Task Connect_TokenWithoutExpiry_IsRefused()
        {
            await using TestCity city = await TestCity.StartAsync();
            string token = city.CreateTokenWithoutExpiry("someone", "Ada");

            InvalidOperationException exception = await Assert.ThrowsAsync<InvalidOperationException>(() => city.ConnectAsync(token));

            StringAssert.Contains(exception.Message, "401");
        }

        [TestMethod]
        public async Task Get_NotAWebSocketRequest_IsBadRequest()
        {
            await using TestCity city = await TestCity.StartAsync();
            SignedIn session = await city.SignInAsync("Ada");
            using HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Get, CityEndpoint.Path);
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", session.Token);

            HttpResponseMessage response = await city.Client.SendAsync(request);

            Assert.AreEqual(HttpStatusCode.BadRequest, response.StatusCode);
        }

        [TestMethod]
        public async Task Connect_ValidTokenInQueryStringAsBrowserSendsIt_GetsHelloListingItself()
        {
            await using TestCity city = await TestCity.StartAsync();
            SignedIn ada = await city.SignInAsync("Ada");

            await using TestSocket socket = await city.ConnectAsync(ada.Token);
            HelloMessage hello = await socket.ReceiveAsync<HelloMessage>();

            Assert.AreEqual(ada.PlayerId, hello.You);
            CollectionAssert.AreEqual(new[] { new PlayerInfo(ada.PlayerId, "Ada") }, hello.Players.ToArray());
        }

        [TestMethod]
        public async Task Connect_SecondPlayer_JoinAndLeaveReachFirst()
        {
            await using TestCity city = await TestCity.StartAsync();
            SignedIn ada = await city.SignInAsync("Ada");
            SignedIn grace = await city.SignInAsync("Grace");
            await using TestSocket adaSocket = await city.ConnectAsync(ada.Token);
            await adaSocket.ReceiveAsync<HelloMessage>();

            await using TestSocket graceSocket = await city.ConnectAsync(grace.Token);
            HelloMessage graceHello = await graceSocket.ReceiveAsync<HelloMessage>();
            PlayersMessage joined = await adaSocket.ReceiveAsync<PlayersMessage>();

            PlayerInfo[] both = [new PlayerInfo(ada.PlayerId, "Ada"), new PlayerInfo(grace.PlayerId, "Grace")];
            CollectionAssert.AreEqual(both, graceHello.Players.ToArray());
            CollectionAssert.AreEqual(both, joined.Players.ToArray());

            await graceSocket.CloseAsync();
            PlayersMessage left = await adaSocket.ReceiveAsync<PlayersMessage>();

            CollectionAssert.AreEqual(new[] { new PlayerInfo(ada.PlayerId, "Ada") }, left.Players.ToArray());
        }

        [TestMethod]
        public async Task Connect_SameTokenTwice_ListsPlayerOnce()
        {
            await using TestCity city = await TestCity.StartAsync();
            SignedIn ada = await city.SignInAsync("Ada");
            SignedIn grace = await city.SignInAsync("Grace");
            await using TestSocket graceSocket = await city.ConnectAsync(grace.Token);
            await graceSocket.ReceiveAsync<HelloMessage>();
            await using TestSocket firstTab = await city.ConnectAsync(ada.Token);
            await firstTab.ReceiveAsync<HelloMessage>();
            await graceSocket.ReceiveAsync<PlayersMessage>();

            await using TestSocket secondTab = await city.ConnectAsync(ada.Token);
            HelloMessage secondHello = await secondTab.ReceiveAsync<HelloMessage>();
            PlayersMessage graceNext = await JoinAndReceiveAsync(city, "Bo", graceSocket);
            PlayersMessage firstTabNext = await firstTab.ReceiveAsync<PlayersMessage>();

            CollectionAssert.AreEqual(
                new[] { new PlayerInfo(grace.PlayerId, "Grace"), new PlayerInfo(ada.PlayerId, "Ada") },
                secondHello.Players.ToArray());
            // Had the second tab announced Ada again, that would have come before Bo's join
            CollectionAssert.AreEqual(new[] { "Grace", "Ada", "Bo" }, graceNext.Players.Select(player => player.Name).ToArray());
            CollectionAssert.AreEqual(new[] { "Grace", "Ada", "Bo" }, firstTabNext.Players.Select(player => player.Name).ToArray());
        }

        [TestMethod]
        public async Task Close_OneOfTwoConnectionsOfAPlayer_KeepsPlayerOnline()
        {
            await using TestCity city = await TestCity.StartAsync();
            SignedIn ada = await city.SignInAsync("Ada");
            SignedIn grace = await city.SignInAsync("Grace");
            await using TestSocket graceSocket = await city.ConnectAsync(grace.Token);
            await graceSocket.ReceiveAsync<HelloMessage>();
            await using TestSocket firstTab = await city.ConnectAsync(ada.Token);
            await firstTab.ReceiveAsync<HelloMessage>();
            await graceSocket.ReceiveAsync<PlayersMessage>();
            await using TestSocket secondTab = await city.ConnectAsync(ada.Token);
            await secondTab.ReceiveAsync<HelloMessage>();

            await firstTab.CloseAsync();
            PlayersMessage afterFirstTab = await JoinAndReceiveAsync(city, "Bo", graceSocket);
            await secondTab.CloseAsync();
            PlayersMessage left = await graceSocket.ReceiveAsync<PlayersMessage>();

            // Had the first tab's close taken Ada offline, that would have come before Bo's join
            CollectionAssert.AreEqual(new[] { "Grace", "Ada", "Bo" }, afterFirstTab.Players.Select(player => player.Name).ToArray());
            CollectionAssert.AreEqual(new[] { "Grace", "Bo" }, left.Players.Select(player => player.Name).ToArray());
        }

        [TestMethod]
        public async Task Connection_DroppedWithoutClose_PlayerLeaves()
        {
            await using TestCity city = await TestCity.StartAsync();
            SignedIn ada = await city.SignInAsync("Ada");
            SignedIn grace = await city.SignInAsync("Grace");
            await using TestSocket graceSocket = await city.ConnectAsync(grace.Token);
            await graceSocket.ReceiveAsync<HelloMessage>();
            await using TestSocket adaSocket = await city.ConnectAsync(ada.Token);
            await adaSocket.ReceiveAsync<HelloMessage>();
            await graceSocket.ReceiveAsync<PlayersMessage>();

            adaSocket.Abort();
            PlayersMessage left = await graceSocket.ReceiveAsync<PlayersMessage>();

            CollectionAssert.AreEqual(new[] { new PlayerInfo(grace.PlayerId, "Grace") }, left.Players.ToArray());
        }

        [TestMethod]
        public async Task Close_ClientNeverAnswers_DroppedAfterTheHandshakeTimeoutOnTheServersClock()
        {
            await using TestCity city = await TestCity.StartAsync();
            SignedIn ada = await city.SignInAsync("Ada");
            SignedIn grace = await city.SignInAsync("Grace");
            await using TestSocket graceSocket = await city.ConnectAsync(grace.Token);
            await graceSocket.ReceiveAsync<HelloMessage>();
            string shortToken = city.CreateToken(ada.PlayerId, "Ada", TimeSpan.FromHours(1));
            await using TestSocket adaSocket = await city.ConnectAsync(shortToken);
            await adaSocket.ReceiveAsync<HelloMessage>();
            await graceSocket.ReceiveAsync<PlayersMessage>();

            city.Time.Advance(TimeSpan.FromHours(1));
            await adaSocket.ReceiveCloseAsync(answer: false);
            // The server starts the timeout once its close frame is out; this quiet while lets it, so the clock moves
            // from there
            await graceSocket.ExpectNothingAsync();
            city.Time.Advance(CityEndpoint.CloseHandshakeTimeout - TimeSpan.FromSeconds(1));
            await graceSocket.ExpectNothingAsync();
            city.Time.Advance(TimeSpan.FromSeconds(1));
            // Well inside the timeout in real time, so only the server's clock can have ended the wait
            PlayersMessage left = await graceSocket.ReceiveAsync<PlayersMessage>(within: TimeSpan.FromSeconds(1));

            CollectionAssert.AreEqual(new[] { new PlayerInfo(grace.PlayerId, "Grace") }, left.Players.ToArray());
        }

        [TestMethod]
        public async Task TokenOutlivingTheLongestTimer_WhileConnected_ServerClosesThenSoTheClientReconnects()
        {
            await using TestCity city = await TestCity.StartAsync();
            SignedIn ada = await city.SignInAsync("Ada");
            string longToken = city.CreateToken(ada.PlayerId, "Ada", TimeSpan.FromDays(60));
            await using TestSocket socket = await city.ConnectAsync(longToken);
            await socket.ReceiveAsync<HelloMessage>();

            city.Time.Advance(CityEndpoint.LongestTimerDelay - TimeSpan.FromMinutes(1));
            await socket.ExpectNothingAsync();
            city.Time.Advance(TimeSpan.FromMinutes(1));

            Assert.AreEqual(WebSocketCloseStatus.PolicyViolation, await socket.ReceiveCloseAsync());
        }

        [TestMethod]
        public async Task TokenExpires_WhileConnected_ServerClosesWithPolicyViolationAndPlayerLeaves()
        {
            await using TestCity city = await TestCity.StartAsync();
            SignedIn ada = await city.SignInAsync("Ada");
            SignedIn grace = await city.SignInAsync("Grace");
            await using TestSocket graceSocket = await city.ConnectAsync(grace.Token);
            await graceSocket.ReceiveAsync<HelloMessage>();
            string shortToken = city.CreateToken(ada.PlayerId, "Ada", TimeSpan.FromHours(1));
            await using TestSocket adaSocket = await city.ConnectAsync(shortToken);
            await adaSocket.ReceiveAsync<HelloMessage>();
            await graceSocket.ReceiveAsync<PlayersMessage>();

            city.Time.Advance(TimeSpan.FromMinutes(59));
            await adaSocket.ExpectNothingAsync();
            city.Time.Advance(TimeSpan.FromMinutes(1));

            Assert.AreEqual(WebSocketCloseStatus.PolicyViolation, await adaSocket.ReceiveCloseAsync());
            PlayersMessage left = await graceSocket.ReceiveAsync<PlayersMessage>();
            CollectionAssert.AreEqual(new[] { new PlayerInfo(grace.PlayerId, "Grace") }, left.Players.ToArray());
        }

        [TestMethod]
        public async Task ServerStops_WhileConnected_ClosesConnectionsAsGoingAway()
        {
            // Disposed only after the socket, which the stopping server must close first
            TestCity city = await TestCity.StartAsync();

            try
            {
                SignedIn ada = await city.SignInAsync("Ada");
                await using TestSocket socket = await city.ConnectAsync(ada.Token);
                await socket.ReceiveAsync<HelloMessage>();

                Task stopping = city.App.StopAsync();

                Assert.AreEqual(WebSocketCloseStatus.EndpointUnavailable, await socket.ReceiveCloseAsync());
                await stopping;
            }
            finally
            {
                await city.DisposeAsync();
            }
        }

        // Signs in and connects a new player, and gives the players message that join sends the listener. Every
        // player's messages arrive in order, so anything the server sent the listener before the join comes first. The
        // new player stays connected until the city stops, since leaving would send the listener another message.
        private static async Task<PlayersMessage> JoinAndReceiveAsync(TestCity city, string name, TestSocket listener)
        {
            SignedIn session = await city.SignInAsync(name);
            TestSocket socket = await city.ConnectAsync(session.Token);
            await socket.ReceiveAsync<HelloMessage>();
            return await listener.ReceiveAsync<PlayersMessage>();
        }
    }
}
