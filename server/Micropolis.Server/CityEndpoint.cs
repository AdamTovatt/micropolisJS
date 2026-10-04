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

using System.Net.WebSockets;
using System.Text;
using Micropolis.Rules;

namespace Micropolis.Server
{
    /// <summary>
    /// The city's WebSocket, as protocol/README.md describes it. The token is checked when the socket connects, and
    /// the server closes the connection when the token expires, after which the client reconnects with a fresh one.
    /// </summary>
    internal static class CityEndpoint
    {
        public const string Path = "/ws/city";

        // How long a client has to answer the server's close frame before the connection is dropped
        internal static readonly TimeSpan CloseHandshakeTimeout = TimeSpan.FromSeconds(5);

        // The longest a timer can wait; a token outliving it closes then, and the client reconnects with it
        internal static readonly TimeSpan LongestTimerDelay = TimeSpan.FromMilliseconds(uint.MaxValue - 1);

        /// <summary>
        /// The longest message a client may send: room for a saved game, the longest message the protocol has.
        /// </summary>
        internal const int MaxMessageBytes = 4 * 1024 * 1024;

        public static void Map(WebApplication app)
        {
            app.Map(Path, ConnectAsync).RequireAuthorization();
        }

        private static async Task ConnectAsync(HttpContext context, PlayerPresence presence, CityRegistry registry, TimeProvider time,
            IHostApplicationLifetime lifetime, ILogger<CitySession> logger)
        {
            if (!context.WebSockets.IsWebSocketRequest)
            {
                context.Response.StatusCode = StatusCodes.Status400BadRequest;
                return;
            }

            PlayerInfo? player = PlayerClaims.ReadPlayer(context);
            DateTimeOffset? expiresAt = PlayerClaims.ReadExpiry(context);

            if (player == null || expiresAt == null)
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return;
            }

            using WebSocket socket = await context.WebSockets.AcceptWebSocketAsync();
            CityConnection connection = new CityConnection(player.Value);
            // On the server's clock, as the token's expiry is
            using CancellationTokenSource closeHandshake = new CancellationTokenSource(Timeout.InfiniteTimeSpan, time);
            using CancellationTokenSource receiving = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted, closeHandshake.Token);

            TimeSpan untilExpiry = expiresAt.Value - time.GetUtcNow();
            TimeSpan expiryDelay = untilExpiry < TimeSpan.Zero ? TimeSpan.Zero : untilExpiry > LongestTimerDelay ? LongestTimerDelay : untilExpiry;
            using ITimer expiry = time.CreateTimer(
                _ => connection.Close(WebSocketCloseStatus.PolicyViolation, "token expired"), null, expiryDelay, Timeout.InfiniteTimeSpan);
            using CancellationTokenRegistration stopping = lifetime.ApplicationStopping.Register(
                () => connection.Close(WebSocketCloseStatus.EndpointUnavailable, "server stopping"));

            CitySession session = new CitySession(connection, registry, logger);
            presence.Connect(connection);
            Task sending = SendAsync();

            // Once the close frame is out the client has a short while to answer it, and once sending has failed
            // there is no connection left to read from
            async Task SendAsync()
            {
                try
                {
                    await connection.SendAllAsync(socket, context.RequestAborted);
                    closeHandshake.CancelAfter(CloseHandshakeTimeout);
                }
                catch
                {
                    receiving.Cancel();
                    throw;
                }
            }

            try
            {
                await ReceiveUntilClosedAsync(socket, connection, session, receiving.Token);
                connection.Close(WebSocketCloseStatus.NormalClosure, null);
                await sending;
            }
            catch (OperationCanceledException) when (receiving.IsCancellationRequested)
            {
                // The client went away, or never answered the close: there is no one left to tell
            }
            catch (WebSocketException)
            {
                // The connection broke
            }
            finally
            {
                try
                {
                    await session.LeaveAsync();
                }
                finally
                {
                    presence.Disconnect(connection);
                    connection.Close(WebSocketCloseStatus.NormalClosure, null);

                    if (socket.State != WebSocketState.Closed)
                    {
                        socket.Abort();
                    }

                    await IgnoreFailureAsync(sending);
                }
            }
        }

        // Each message, one text message of one or more frames, goes to the session in the order it came, until the
        // connection closes for any reason: what the client sends after that, before it answers the close, is read and
        // dropped. A binary message, one longer than any the protocol has, or one that isn't UTF-8 closes the connection.
        private static async Task ReceiveUntilClosedAsync(WebSocket socket, CityConnection connection, CitySession session, CancellationToken cancellationToken)
        {
            byte[] buffer = new byte[16 * 1024];
            using MemoryStream message = new MemoryStream();

            while (true)
            {
                WebSocketReceiveResult result = await socket.ReceiveAsync(buffer, cancellationToken);

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    return;
                }

                if (connection.IsClosing)
                {
                    continue;
                }

                if (result.MessageType != WebSocketMessageType.Text)
                {
                    connection.Close(WebSocketCloseStatus.InvalidMessageType, "messages are text");
                    continue;
                }

                if (message.Length + result.Count > MaxMessageBytes)
                {
                    connection.Close(WebSocketCloseStatus.MessageTooBig, $"a message is at most {MaxMessageBytes / (1024 * 1024)} MiB");
                    continue;
                }

                message.Write(buffer, 0, result.Count);

                if (result.EndOfMessage)
                {
                    string text;

                    try
                    {
                        text = StrictUtf8.Encoding.GetString(message.GetBuffer(), 0, (int)message.Length);
                    }
                    catch (DecoderFallbackException)
                    {
                        connection.Close(WebSocketCloseStatus.InvalidPayloadData, "a message is UTF-8");
                        continue;
                    }

                    message.SetLength(0);
                    await session.ReceiveAsync(text);
                }
            }
        }

        private static async Task IgnoreFailureAsync(Task task)
        {
            try
            {
                await task;
            }
            catch (Exception exception) when (exception is OperationCanceledException or WebSocketException)
            {
                // Already reported by the receive side, or the connection is gone
            }
        }
    }
}
