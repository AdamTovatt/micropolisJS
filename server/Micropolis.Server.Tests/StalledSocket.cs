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

using System.Diagnostics;
using System.Net.WebSockets;

namespace Micropolis.Server.Tests
{
    /// <summary>
    /// The server's side of a WebSocket whose client has stopped reading and sends nothing: a send waits until it is
    /// cancelled, as a real socket's does once the client's window is full, and so does a receive. Cancelling either
    /// aborts the socket, as a real socket's cancelled send or receive does, without counting as the server's
    /// <see cref="Abort"/>.
    /// </summary>
    internal sealed class StalledSocket : WebSocket
    {
        private readonly TaskCompletionSource _sending = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        private WebSocketState _state = WebSocketState.Open;

        /// <summary>
        /// Finishes once a send has begun, and waits.
        /// </summary>
        public Task Sending => _sending.Task;

        /// <summary>
        /// Whether the server has dropped the socket.
        /// </summary>
        public bool Dropped { get; private set; }

        public override WebSocketCloseStatus? CloseStatus => null;

        public override string? CloseStatusDescription => null;

        public override WebSocketState State => _state;

        public override string? SubProtocol => null;

        public override async Task SendAsync(ArraySegment<byte> buffer, WebSocketMessageType messageType, bool endOfMessage, CancellationToken cancellationToken)
        {
            _sending.TrySetResult();
            await WaitUntilCancelledAsync(cancellationToken);
        }

        public override async Task<WebSocketReceiveResult> ReceiveAsync(ArraySegment<byte> buffer, CancellationToken cancellationToken)
        {
            await WaitUntilCancelledAsync(cancellationToken);
            throw new UnreachableException();
        }

        public override Task CloseOutputAsync(WebSocketCloseStatus closeStatus, string? statusDescription, CancellationToken cancellationToken)
        {
            return WaitUntilCancelledAsync(cancellationToken);
        }

        public override Task CloseAsync(WebSocketCloseStatus closeStatus, string? statusDescription, CancellationToken cancellationToken)
        {
            return WaitUntilCancelledAsync(cancellationToken);
        }

        public override void Abort()
        {
            Dropped = true;
            _state = WebSocketState.Aborted;
        }

        public override void Dispose()
        {
            _state = WebSocketState.Closed;
        }

        private async Task WaitUntilCancelledAsync(CancellationToken cancellationToken)
        {
            try
            {
                await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
            }
            finally
            {
                _state = WebSocketState.Aborted;
            }
        }
    }
}
