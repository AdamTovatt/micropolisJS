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

namespace Micropolis.Server.Tests
{
    [TestClass]
    public sealed class CityConnectionTests
    {
        [TestMethod]
        public async Task Send_AsManyAsItHolds_SendsThemAllAndClosesAsAsked()
        {
            CityConnection connection = new CityConnection(new PlayerInfo("a", "Ada"));

            for (int i = 0; i < CityConnection.MaximumQueued; i++)
            {
                connection.Send($"message {i}");
            }

            connection.Close(WebSocketCloseStatus.NormalClosure, null);
            (int messages, WebSocketCloseStatus? status) = await SendAllAndReadBackAsync(connection);

            Assert.AreEqual(CityConnection.MaximumQueued, messages);
            Assert.AreEqual(WebSocketCloseStatus.NormalClosure, status);
        }

        [TestMethod]
        public async Task Send_OneMoreThanItHolds_DropsItAndClosesWithPolicyViolation()
        {
            CityConnection connection = new CityConnection(new PlayerInfo("a", "Ada"));

            for (int i = 0; i <= CityConnection.MaximumQueued; i++)
            {
                connection.Send($"message {i}");
            }

            // Too late: the first close wins
            connection.Close(WebSocketCloseStatus.NormalClosure, null);
            (int messages, WebSocketCloseStatus? status) = await SendAllAndReadBackAsync(connection);

            Assert.AreEqual(CityConnection.MaximumQueued, messages);
            Assert.AreEqual(WebSocketCloseStatus.PolicyViolation, status);
        }

        [TestMethod]
        public async Task Close_DescriptionLongerThanAFrameHolds_IsCutBetweenCharacters()
        {
            CityConnection connection = new CityConnection(new PlayerInfo("a", "Ada"));

            // Two bytes of UTF-8 each: 61 fit in a close frame's 123 bytes, and the 62nd would split
            connection.Close(WebSocketCloseStatus.PolicyViolation, new string('é', 100));
            (_, _, string? description) = await SendAllAndReadBackWithDescriptionAsync(connection);

            Assert.AreEqual(new string('é', 61), description);
        }

        [TestMethod]
        public void Send_OneMoreThanItHolds_IsClosingFromThen()
        {
            CityConnection connection = new CityConnection(new PlayerInfo("a", "Ada"));

            for (int i = 0; i < CityConnection.MaximumQueued; i++)
            {
                connection.Send($"message {i}");
            }

            Assert.IsFalse(connection.IsClosing);
            connection.Send("one more than it holds");
            Assert.IsTrue(connection.IsClosing);
        }

        // Writes the connection's frames as the server would, then reads them as a client: how many messages came
        // before the close, and the close's status
        private static async Task<(int Messages, WebSocketCloseStatus? Status)> SendAllAndReadBackAsync(CityConnection connection)
        {
            (int messages, WebSocketCloseStatus? status, _) = await SendAllAndReadBackWithDescriptionAsync(connection);
            return (messages, status);
        }

        private static async Task<(int Messages, WebSocketCloseStatus? Status, string? Description)> SendAllAndReadBackWithDescriptionAsync(CityConnection connection)
        {
            using MemoryStream wire = new MemoryStream();
            using WebSocket server = WebSocket.CreateFromStream(wire, isServer: true, subProtocol: null, keepAliveInterval: Timeout.InfiniteTimeSpan);
            await connection.SendAllAsync(server, CancellationToken.None);

            using WebSocket client = WebSocket.CreateFromStream(new MemoryStream(wire.ToArray()), isServer: false, subProtocol: null, keepAliveInterval: Timeout.InfiniteTimeSpan);
            byte[] buffer = new byte[1024];
            int messages = 0;

            while (true)
            {
                WebSocketReceiveResult result = await client.ReceiveAsync(buffer, CancellationToken.None);

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    return (messages, result.CloseStatus, result.CloseStatusDescription);
                }

                messages++;
            }
        }
    }
}
