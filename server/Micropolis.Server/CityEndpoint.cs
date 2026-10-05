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

        // How long a client has, once its connection starts to close, to read what is left and answer the close frame
        // before the connection is dropped
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

        private static async Task ConnectAsync(HttpContext context, PlayerPresence presence, CityRegistry registry, CityLimits limits,
            TimeProvider time, IHostApplicationLifetime lifetime, ILogger<CitySession> logger)
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

            TimeSpan untilExpiry = expiresAt.Value - time.GetUtcNow();
            TimeSpan expiryDelay = untilExpiry < TimeSpan.Zero ? TimeSpan.Zero : untilExpiry > LongestTimerDelay ? LongestTimerDelay : untilExpiry;
            using ITimer expiry = time.CreateTimer(
                _ => connection.Close(WebSocketCloseStatus.PolicyViolation, "token expired"), null, expiryDelay, Timeout.InfiniteTimeSpan);
            using CancellationTokenRegistration stopping = lifetime.ApplicationStopping.Register(
                () => connection.Close(WebSocketCloseStatus.EndpointUnavailable, "server stopping"));

            // The address as the server resolves it from any trusted proxy, as the sign-in rate limit takes it
            CitySession session = new CitySession(connection, registry, limits, context.Connection.RemoteIpAddress?.ToString() ?? "", time, logger);
            presence.Connect(connection);

            try
            {
                await ServeAsync(socket, connection, session.ReceiveAsync, time, context.RequestAborted);
            }
            finally
            {
                try
                {
                    await session.LeaveAsync();
                }
                finally
                {
                    // Only once the connection has left its city, which its city's last player leaving saves to the store
                    // and unloads: the end-to-end runner waits for a player to go offline before joining their city again
                    presence.Disconnect(connection);
                }
            }
        }

        /// <summary>
        /// Carries the connection on the socket until it ends: what the client sends goes to receive, in the order it
        /// came, and what the connection has queued goes out, then its close. Once the connection starts to close, for
        /// whatever reason, the client has <see cref="CloseHandshakeTimeout"/> on the server's clock to read what is
        /// left and answer the close, after which a send in flight is cancelled and the socket dropped, so a client
        /// that stops reading is closed all the same once its connection falls too far behind.
        /// </summary>
        internal static async Task ServeAsync(WebSocket socket, CityConnection connection, Func<string, Task> receive, TimeProvider time,
            CancellationToken aborted)
        {
            // On the server's clock, as the token's expiry is
            using CancellationTokenSource closeHandshake = new CancellationTokenSource(Timeout.InfiniteTimeSpan, time);
            using CancellationTokenSource connected = CancellationTokenSource.CreateLinkedTokenSource(aborted, closeHandshake.Token);
            // Disposed before the handshake's source, and waits for the callback if it is running
            using CancellationTokenRegistration closing = connection.Closing.Register(() => closeHandshake.CancelAfter(CloseHandshakeTimeout));
            Task sending = SendAsync();

            // Once sending has failed there is no connection left to read from
            async Task SendAsync()
            {
                try
                {
                    await connection.SendAllAsync(socket, connected.Token);
                }
                catch
                {
                    connected.Cancel();
                    throw;
                }
            }

            try
            {
                await ReceiveUntilClosedAsync(socket, connection, receive, connected.Token);
                connection.Close(WebSocketCloseStatus.NormalClosure, null);
                await sending;
            }
            catch (OperationCanceledException) when (connected.IsCancellationRequested)
            {
                // The client went away, or never answered the close, or stopped reading: there is no one left to tell
            }
            catch (WebSocketException)
            {
                // The connection broke
            }
            finally
            {
                connection.Close(WebSocketCloseStatus.NormalClosure, null);

                if (socket.State != WebSocketState.Closed)
                {
                    socket.Abort();
                }

                await IgnoreFailureAsync(sending);
            }
        }

        // Each message, one text message of one or more frames, goes to receive in the order it came, until the
        // connection closes for any reason: what the client sends after that, before it answers the close, is read and
        // dropped. A binary message, one longer than any the protocol has, or one that isn't UTF-8 closes the connection.
        private static async Task ReceiveUntilClosedAsync(WebSocket socket, CityConnection connection, Func<string, Task> receive,
            CancellationToken cancellationToken)
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
                    await receive(text);
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
