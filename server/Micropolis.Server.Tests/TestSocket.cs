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

namespace Micropolis.Server.Tests
{
    /// <summary>
    /// A client's end of the city's WebSocket, reading the server's messages one at a time.
    /// </summary>
    internal sealed class TestSocket : IAsyncDisposable
    {
        private static readonly TimeSpan MessageTimeout = TimeSpan.FromSeconds(5);
        private static readonly TimeSpan QuietPeriod = TimeSpan.FromMilliseconds(200);

        private readonly WebSocket _socket;
        private Task<WebSocketReceiveResult>? _pendingReceive;
        private readonly byte[] _buffer = new byte[64 * 1024];

        public TestSocket(WebSocket socket)
        {
            _socket = socket;
        }

        /// <summary>
        /// The next message, which must arrive within the given time, or a few seconds when none is given.
        /// </summary>
        public async Task<T> ReceiveAsync<T>(TimeSpan? within = null) where T : ServerMessage
        {
            ServerMessage message = ProtocolJson.DeserializeServerMessage(await ReceiveTextAsync(within));
            return message as T ?? throw new AssertFailedException($"Expected a {typeof(T).Name}, got {message}.");
        }

        /// <summary>
        /// The next message's text, as the server wrote it, however many frames it took.
        /// </summary>
        public async Task<string> ReceiveTextAsync(TimeSpan? within = null)
        {
            TimeSpan timeout = within ?? MessageTimeout;
            using MemoryStream message = new MemoryStream();

            while (true)
            {
                WebSocketReceiveResult result = await ReceiveFrameAsync(timeout)
                    ?? throw new TimeoutException($"No message within {timeout}.");

                Assert.AreEqual(WebSocketMessageType.Text, result.MessageType, $"Expected a message, got a {result.MessageType} frame.");
                message.Write(_buffer, 0, result.Count);

                if (result.EndOfMessage)
                {
                    return Encoding.UTF8.GetString(message.ToArray());
                }
            }
        }

        public async Task SendAsync(ClientMessage message)
        {
            await SendTextAsync(ProtocolJson.Serialize(message));
        }

        public async Task SendTextAsync(string text)
        {
            await _socket.SendAsync(Encoding.UTF8.GetBytes(text), WebSocketMessageType.Text, endOfMessage: true, CancellationToken.None);
        }

        /// <summary>
        /// Sends one text message as the frames given, each its bytes as they are, valid UTF-8 or not.
        /// </summary>
        public async Task SendFramesAsync(params byte[][] frames)
        {
            for (int i = 0; i < frames.Length; i++)
            {
                await _socket.SendAsync(frames[i], WebSocketMessageType.Text, endOfMessage: i == frames.Length - 1, CancellationToken.None);
            }
        }

        public async Task SendBinaryAsync(byte[] bytes)
        {
            await _socket.SendAsync(bytes, WebSocketMessageType.Binary, endOfMessage: true, CancellationToken.None);
        }

        /// <summary>
        /// Fails if a message arrives within a short while.
        /// </summary>
        public async Task ExpectNothingAsync()
        {
            WebSocketReceiveResult? result = await ReceiveFrameAsync(QuietPeriod);

            if (result != null)
            {
                Assert.Fail($"Expected nothing, got a {result.MessageType} frame: {Encoding.UTF8.GetString(_buffer, 0, result.Count)}");
            }
        }

        /// <summary>
        /// Waits for the server's close frame and answers it, unless told not to.
        /// </summary>
        public async Task<WebSocketCloseStatus?> ReceiveCloseAsync(bool answer = true)
        {
            WebSocketReceiveResult result = await ReceiveFrameAsync(MessageTimeout)
                ?? throw new TimeoutException($"No close within {MessageTimeout}.");

            Assert.AreEqual(WebSocketMessageType.Close, result.MessageType);

            if (answer)
            {
                await _socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
            }

            return result.CloseStatus;
        }

        public async Task CloseAsync()
        {
            await _socket.CloseAsync(WebSocketCloseStatus.NormalClosure, null, CancellationToken.None);
        }

        /// <summary>
        /// Drops the connection without a close, as a client does when its network goes.
        /// </summary>
        public void Abort()
        {
            _socket.Abort();
        }

        public ValueTask DisposeAsync()
        {
            _socket.Dispose();
            return ValueTask.CompletedTask;
        }

        // A receive that outlasts the timeout is kept for the next call, so no frame is lost between calls
        private async Task<WebSocketReceiveResult?> ReceiveFrameAsync(TimeSpan timeout)
        {
            _pendingReceive ??= _socket.ReceiveAsync(_buffer, CancellationToken.None);
            Task finished = await Task.WhenAny(_pendingReceive, Task.Delay(timeout));

            if (finished != _pendingReceive)
            {
                return null;
            }

            WebSocketReceiveResult result = await _pendingReceive;
            _pendingReceive = null;
            return result;
        }
    }
}
