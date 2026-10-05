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

using System.Net.WebSockets;

namespace Micropolis.Server.Tests
{
    /// <summary>
    /// What a connection writes to its socket, read back as a client reads it.
    /// </summary>
    internal static class ConnectionWire
    {
        // How long a connection has to close, which one a test leaves open never does
        private static readonly TimeSpan CloseTimeout = TimeSpan.FromSeconds(5);

        /// <summary>
        /// Sends everything the connection has to send, until it closes, and gives how many whole messages it sent
        /// before the close, and the close's status and description.
        /// </summary>
        public static async Task<(int Messages, WebSocketCloseStatus? Status, string? Description)> ReadBackAsync(CityConnection connection)
        {
            using MemoryStream wire = new MemoryStream();
            using WebSocket server = WebSocket.CreateFromStream(wire, isServer: true, subProtocol: null, keepAliveInterval: Timeout.InfiniteTimeSpan);
            await connection.SendAllAsync(server, CancellationToken.None).WaitAsync(CloseTimeout);

            using WebSocket client = WebSocket.CreateFromStream(new MemoryStream(wire.ToArray()), isServer: false, subProtocol: null, keepAliveInterval: Timeout.InfiniteTimeSpan);
            byte[] buffer = new byte[256 * 1024];
            int messages = 0;

            while (true)
            {
                WebSocketReceiveResult result = await client.ReceiveAsync(buffer, CancellationToken.None);

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    return (messages, result.CloseStatus, result.CloseStatusDescription);
                }

                if (result.EndOfMessage)
                {
                    messages++;
                }
            }
        }
    }
}
