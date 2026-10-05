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
            (int messages, WebSocketCloseStatus? status, _) = await ConnectionWire.ReadBackAsync(connection);

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
            (int messages, WebSocketCloseStatus? status, _) = await ConnectionWire.ReadBackAsync(connection);

            Assert.AreEqual(CityConnection.MaximumQueued, messages);
            Assert.AreEqual(WebSocketCloseStatus.PolicyViolation, status);
        }

        [TestMethod]
        public async Task Close_DescriptionLongerThanAFrameHolds_IsCutBetweenCharacters()
        {
            CityConnection connection = new CityConnection(new PlayerInfo("a", "Ada"));

            // Two bytes of UTF-8 each: 61 fit in a close frame's 123 bytes, and the 62nd would split
            connection.Close(WebSocketCloseStatus.PolicyViolation, new string('é', 100));
            (_, _, string? description) = await ConnectionWire.ReadBackAsync(connection);

            Assert.AreEqual(new string('é', 61), description);
        }

        [TestMethod]
        public void Closing_FirstClose_IsCancelled()
        {
            CityConnection connection = new CityConnection(new PlayerInfo("a", "Ada"));
            Assert.IsFalse(connection.Closing.IsCancellationRequested);

            connection.Close(WebSocketCloseStatus.NormalClosure, null);

            Assert.IsTrue(connection.Closing.IsCancellationRequested);
        }

        [TestMethod]
        public void Closing_SendOneMoreThanItHolds_IsCancelled()
        {
            CityConnection connection = new CityConnection(new PlayerInfo("a", "Ada"));

            for (int i = 0; i < CityConnection.MaximumQueued; i++)
            {
                connection.Send($"message {i}");
            }

            Assert.IsFalse(connection.Closing.IsCancellationRequested);
            connection.Send("one more than it holds");
            Assert.IsTrue(connection.Closing.IsCancellationRequested);
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
    }
}
