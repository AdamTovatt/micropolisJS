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
using System.Text.Json.Nodes;
using System.Threading.Channels;
using Micropolis.Rules;

namespace Micropolis.Server
{
    /// <summary>
    /// One player's connection to the city: the messages waiting to go out on it, in order. A WebSocket allows one
    /// send at a time, so <see cref="SendAllAsync"/> is the only writer, and closing goes through it too.
    /// </summary>
    internal sealed class CityConnection
    {
        /// <summary>
        /// The most messages a connection holds unsent. A client that falls this far behind is closed, and catches up
        /// from the hello when it reconnects.
        /// </summary>
        public const int MaximumQueued = 256;

        // The most a close frame's description holds, in bytes of UTF-8
        private const int MaxCloseDescriptionBytes = 123;

        private readonly Channel<string> _outbox = Channel.CreateBounded<string>(
            new BoundedChannelOptions(MaximumQueued) { SingleReader = true, FullMode = BoundedChannelFullMode.Wait });
        private readonly object _closeLock = new object();
        private WebSocketCloseStatus _closeStatus = WebSocketCloseStatus.NormalClosure;
        private string? _closeDescription;
        private volatile bool _closing;

        public CityConnection(PlayerInfo player)
        {
            Player = player;
        }

        public PlayerInfo Player { get; }

        /// <summary>
        /// Whether the connection is closing, for whatever reason: what the client sends from then on is not read.
        /// </summary>
        public bool IsClosing => _closing;

        /// <summary>
        /// Queues the answer to the client's request with the id.
        /// </summary>
        public void Answer(long requestId, JsonNode? value)
        {
            Send(ProtocolJson.Serialize(new AnswerMessage(requestId, value)));
        }

        /// <summary>
        /// Queues why the client's request with the id failed.
        /// </summary>
        public void Fail(long requestId, string error)
        {
            Send(ProtocolJson.Serialize(new FailedMessage(requestId, error)));
        }

        /// <summary>
        /// Queues a message, already written as the wire carries it. A closed connection drops it, and a full one
        /// drops it and closes.
        /// </summary>
        public void Send(string message)
        {
            // Fails only when full or closed, and closing a closed connection changes nothing
            if (!_outbox.Writer.TryWrite(message))
            {
                Close(WebSocketCloseStatus.PolicyViolation, "too far behind");
            }
        }

        /// <summary>
        /// Sends what is queued, then closes with the given status. The first close wins. A description longer than a
        /// close frame holds is cut short.
        /// </summary>
        public void Close(WebSocketCloseStatus status, string? description)
        {
            lock (_closeLock)
            {
                _closing = true;

                if (_outbox.Writer.TryComplete())
                {
                    _closeStatus = status;
                    _closeDescription = description is null ? null : CutToCloseFrame(description);
                }
            }
        }

        /// <summary>
        /// Writes every queued message to the socket until <see cref="Close"/>, then the close frame.
        /// </summary>
        public async Task SendAllAsync(WebSocket socket, CancellationToken cancellationToken)
        {
            await foreach (string message in _outbox.Reader.ReadAllAsync(cancellationToken))
            {
                await socket.SendAsync(Encoding.UTF8.GetBytes(message), WebSocketMessageType.Text, endOfMessage: true, cancellationToken);
            }

            if (socket.State is WebSocketState.Open or WebSocketState.CloseReceived)
            {
                WebSocketCloseStatus status;
                string? description;

                lock (_closeLock)
                {
                    status = _closeStatus;
                    description = _closeDescription;
                }

                await socket.CloseOutputAsync(status, description, cancellationToken);
            }
        }

        // The description as a close frame holds it: at most 123 bytes of UTF-8, cut between characters
        private static string CutToCloseFrame(string description)
        {
            int bytes = 0;
            int length = 0;

            foreach (Rune character in description.EnumerateRunes())
            {
                bytes += character.Utf8SequenceLength;

                if (bytes > MaxCloseDescriptionBytes)
                {
                    break;
                }

                length += character.Utf16SequenceLength;
            }

            return description[..length];
        }
    }
}
