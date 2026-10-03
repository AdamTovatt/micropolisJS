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
        private static readonly TimeSpan CloseHandshakeTimeout = TimeSpan.FromSeconds(5);

        // The longest a timer can wait; a token outliving it closes then, and the client reconnects with it
        private static readonly TimeSpan LongestTimerDelay = TimeSpan.FromMilliseconds(uint.MaxValue - 1);

        public static void Map(WebApplication app)
        {
            app.Map(Path, ConnectAsync).RequireAuthorization();
        }

        private static async Task ConnectAsync(HttpContext context, PlayerPresence presence, TimeProvider time, IHostApplicationLifetime lifetime)
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
            using CancellationTokenSource receiving = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);

            TimeSpan untilExpiry = expiresAt.Value - time.GetUtcNow();
            TimeSpan expiryDelay = untilExpiry < TimeSpan.Zero ? TimeSpan.Zero : untilExpiry > LongestTimerDelay ? LongestTimerDelay : untilExpiry;
            using ITimer expiry = time.CreateTimer(
                _ => connection.Close(WebSocketCloseStatus.PolicyViolation, "token expired"), null, expiryDelay, Timeout.InfiniteTimeSpan);
            using CancellationTokenRegistration stopping = lifetime.ApplicationStopping.Register(
                () => connection.Close(WebSocketCloseStatus.EndpointUnavailable, "server stopping"));

            presence.Connect(connection);
            Task sending = SendAsync();

            // Once the close frame is out the client has a short while to answer it, and once sending has failed
            // there is no connection left to read from
            async Task SendAsync()
            {
                try
                {
                    await connection.SendAllAsync(socket, context.RequestAborted);
                    receiving.CancelAfter(CloseHandshakeTimeout);
                }
                catch
                {
                    receiving.Cancel();
                    throw;
                }
            }

            try
            {
                await ReceiveUntilClosedAsync(socket, receiving.Token);
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
                presence.Disconnect(connection);
                connection.Close(WebSocketCloseStatus.NormalClosure, null);

                if (socket.State != WebSocketState.Closed)
                {
                    socket.Abort();
                }

                await IgnoreFailureAsync(sending);
            }
        }

        // Clients send nothing, so anything but the close is read and dropped
        private static async Task ReceiveUntilClosedAsync(WebSocket socket, CancellationToken cancellationToken)
        {
            byte[] buffer = new byte[1024];

            while (true)
            {
                WebSocketReceiveResult result = await socket.ReceiveAsync(buffer, cancellationToken);

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    return;
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
