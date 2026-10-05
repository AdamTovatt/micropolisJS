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
using System.Text;
using System.Text.Json.Nodes;
using EasyReasy.Auth;
using Micropolis.Rules;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Time.Testing;

namespace Micropolis.Server.Tests
{
    [TestClass]
    public sealed class CityEndpointTests
    {
        [TestMethod]
        public async Task Connect_NoToken_IsRefused()
        {
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();
            WebSocketClient client = city.Server.CreateWebSocketClient();

            InvalidOperationException exception = await Assert.ThrowsAsync<InvalidOperationException>(
                () => client.ConnectAsync(new Uri(city.Server.BaseAddress, CityEndpoint.Path), CancellationToken.None));

            StringAssert.Contains(exception.Message, "401");
        }

        [TestMethod]
        public async Task Connect_TokenSignedWithAnotherSecret_IsRefused()
        {
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();
            string token = new JwtTokenService("another-secret-that-signs-nothing-here-at-all", issuer: null, audience: null, city.Time)
                .CreateToken("someone", PlayerClaims.AuthType, PlayerClaims.For("Eve"), [], city.Time.GetUtcNow().AddDays(1).UtcDateTime);

            InvalidOperationException exception = await Assert.ThrowsAsync<InvalidOperationException>(() => city.ConnectAsync(token));

            StringAssert.Contains(exception.Message, "401");
        }

        [TestMethod]
        public async Task Connect_TokenExpiredASecondAgo_IsRefused()
        {
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();
            TimeSpan lifetime = TimeSpan.FromHours(1);
            string token = city.CreateToken("someone", "Ada", lifetime);
            city.Time.Advance(lifetime + TimeSpan.FromSeconds(1));

            InvalidOperationException exception = await Assert.ThrowsAsync<InvalidOperationException>(() => city.ConnectAsync(token));

            StringAssert.Contains(exception.Message, "401");
        }

        [TestMethod]
        public async Task Connect_TokenWithoutName_IsRefused()
        {
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();
            string token = city.CreateTokenWithClaims(new Claim(JwtRegisteredClaimNames.Sub, "someone"));

            InvalidOperationException exception = await Assert.ThrowsAsync<InvalidOperationException>(() => city.ConnectAsync(token));

            StringAssert.Contains(exception.Message, "401");
        }

        [TestMethod]
        public async Task Connect_TokenWithoutExpiry_IsRefused()
        {
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();
            string token = city.CreateTokenWithoutExpiry("someone", "Ada");

            InvalidOperationException exception = await Assert.ThrowsAsync<InvalidOperationException>(() => city.ConnectAsync(token));

            StringAssert.Contains(exception.Message, "401");
        }

        [TestMethod]
        public async Task Get_NotAWebSocketRequest_IsBadRequest()
        {
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();
            SignedIn session = await city.SignInAsync("Ada");
            using HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Get, CityEndpoint.Path);
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", session.Token);

            HttpResponseMessage response = await city.Client.SendAsync(request);

            Assert.AreEqual(HttpStatusCode.BadRequest, response.StatusCode);
        }

        [TestMethod]
        public async Task Connect_ValidTokenInQueryStringAsBrowserSendsIt_GetsHelloListingItself()
        {
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();
            SignedIn ada = await city.SignInAsync("Ada");

            await using TestSocket socket = await city.ConnectAsync(ada.Token);
            HelloMessage hello = await socket.ReceiveAsync<HelloMessage>();

            Assert.AreEqual(ada.PlayerId, hello.You);
            CollectionAssert.AreEqual(new[] { new PlayerInfo(ada.PlayerId, "Ada") }, hello.Players.ToArray());
        }

        [TestMethod]
        public async Task Connect_SecondPlayer_JoinAndLeaveReachFirst()
        {
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();
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
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();
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
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();
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
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();
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
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();
            SignedIn ada = await city.SignInAsync("Ada");
            SignedIn grace = await city.SignInAsync("Grace");
            await using TestSocket graceSocket = await city.ConnectAsync(grace.Token);
            await graceSocket.ReceiveAsync<HelloMessage>();
            string shortToken = city.CreateToken(ada.PlayerId, "Ada", TimeSpan.FromHours(1));
            await using TestSocket adaSocket = await city.ConnectAsync(shortToken);
            await adaSocket.ReceiveAsync<HelloMessage>();
            await graceSocket.ReceiveAsync<PlayersMessage>();

            // The server starts the timeout as the expiry closes the connection
            city.Time.Advance(TimeSpan.FromHours(1));
            await adaSocket.ReceiveCloseAsync(answer: false);
            city.Time.Advance(CityEndpoint.CloseHandshakeTimeout - TimeSpan.FromSeconds(1));
            await graceSocket.ExpectNothingAsync();
            city.Time.Advance(TimeSpan.FromSeconds(1));
            // Well inside the timeout in real time, so only the server's clock can have ended the wait
            PlayersMessage left = await graceSocket.ReceiveAsync<PlayersMessage>(within: TimeSpan.FromSeconds(1));

            CollectionAssert.AreEqual(new[] { new PlayerInfo(grace.PlayerId, "Grace") }, left.Players.ToArray());
        }

        // The test server's socket never blocks a send, so the test reaches the connection's loop through its seam, on a
        // socket whose send waits as a real one's does once the client stops reading
        [TestMethod]
        public async Task Serve_ClientStopsReadingAndFallsTooFarBehind_DropsTheSocketOnceTheHandshakeTimeoutPassesOnTheServersClock()
        {
            FakeTimeProvider time = new FakeTimeProvider();
            StalledSocket socket = new StalledSocket();
            CityConnection connection = new CityConnection(new PlayerInfo("a", "Ada"));
            Task serving = CityEndpoint.ServeAsync(socket, connection, _ => Task.CompletedTask, time, CancellationToken.None);
            connection.Send("in flight");
            await socket.Sending.WaitAsync(TimeSpan.FromSeconds(5));

            for (int i = 0; i <= CityConnection.MaximumQueued; i++)
            {
                connection.Send($"queued {i}");
            }

            Assert.IsTrue(connection.IsClosing);
            time.Advance(CityEndpoint.CloseHandshakeTimeout - TimeSpan.FromTicks(1));
            // A quiet while, as TestSocket.ExpectNothingAsync gives, in which a connection dropped early would end
            Assert.AreNotSame(serving, await Task.WhenAny(serving, Task.Delay(TimeSpan.FromMilliseconds(200))), "Dropped before the timeout");
            time.Advance(TimeSpan.FromTicks(1));

            // Well past what the connection's own work takes in real time, so only a send that never ends can miss it
            await serving.WaitAsync(TimeSpan.FromSeconds(5));
            Assert.IsTrue(socket.Dropped);
        }

        [TestMethod]
        public async Task TokenOutlivingTheLongestTimer_WhileConnected_ServerClosesThenSoTheClientReconnects()
        {
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();
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
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();
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
            ServerUnderTest city = await ServerUnderTest.StartAsync();

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

        [TestMethod]
        public async Task Receive_BinaryMessage_ClosesAsTheWrongType()
        {
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();
            await using TestPlayer ada = await TestPlayer.ConnectAsync(city, "Ada");
            TestSocket socket = ada.Socket;

            await socket.SendBinaryAsync([1, 2, 3]);

            Assert.AreEqual(WebSocketCloseStatus.InvalidMessageType, await socket.ReceiveCloseAsync());
        }

        [TestMethod]
        public async Task Receive_MessageLongerThanAnyTheProtocolHas_ClosesAsTooBig()
        {
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();
            await using TestPlayer ada = await TestPlayer.ConnectAsync(city, "Ada");
            TestSocket socket = ada.Socket;

            await socket.SendFramesAsync(new byte[CityEndpoint.MaxMessageBytes], [(byte)' ']);

            Assert.AreEqual(WebSocketCloseStatus.MessageTooBig, await socket.ReceiveCloseAsync());
        }

        [TestMethod]
        public async Task Receive_MessageThatIsNotUtf8_ClosesAsInvalidData()
        {
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();
            await using TestPlayer ada = await TestPlayer.ConnectAsync(city, "Ada");
            TestSocket socket = ada.Socket;

            await socket.SendFramesAsync([0x7b, 0xff, 0x7d]);

            Assert.AreEqual(WebSocketCloseStatus.InvalidPayloadData, await socket.ReceiveCloseAsync());
        }

        [TestMethod]
        public async Task Receive_MessageInSeveralFrames_IsReadAsOne()
        {
            await using ServerUnderTest city = await ServerUnderTest.StartAsync();
            await using TestPlayer ada = await TestPlayer.ConnectAsync(city, "Ada");
            TestSocket socket = ada.Socket;
            byte[] message = Encoding.UTF8.GetBytes(ProtocolJson.Serialize(new QueryRequest(7, new JsonObject { ["type"] = "mapPreview", ["seed"] = 2026 })));
            // Split inside the seed, so neither half is a message on its own
            int split = message.Length - 4;

            await socket.SendFramesAsync(message[..split], message[split..]);

            AnswerMessage answer = await socket.ReceiveAsync<AnswerMessage>();
            Assert.AreEqual(7, answer.Id);
            Assert.AreEqual("mapPreview", (string)answer.Value!["type"]!);
        }

        // Signs in and connects a new player, and gives the players message that join sends the listener. Every
        // player's messages arrive in order, so anything the server sent the listener before the join comes first. The
        // new player stays connected until the city stops, since leaving would send the listener another message.
        private static async Task<PlayersMessage> JoinAndReceiveAsync(ServerUnderTest city, string name, TestSocket listener)
        {
            SignedIn session = await city.SignInAsync(name);
            TestSocket socket = await city.ConnectAsync(session.Token);
            await socket.ReceiveAsync<HelloMessage>();
            return await listener.ReceiveAsync<PlayersMessage>();
        }
    }
}
