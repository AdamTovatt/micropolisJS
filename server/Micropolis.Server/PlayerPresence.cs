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

using Micropolis.Rules;

namespace Micropolis.Server
{
    /// <summary>
    /// Who is online, in the order they came online. A player with several connections is listed once: it comes
    /// online with its first connection and goes offline with its last. Every message is queued under one lock, so
    /// each connection receives its hello and the changes after it in the order they happened.
    /// </summary>
    internal sealed class PlayerPresence
    {
        private readonly object _lock = new object();
        private readonly List<OnlinePlayer> _online = new List<OnlinePlayer>();

        /// <summary>
        /// Adds a connection, queues its hello, and tells everyone else when its player has come online.
        /// </summary>
        public void Connect(CityConnection connection)
        {
            lock (_lock)
            {
                OnlinePlayer? player = _online.Find(online => online.Info.Id == connection.Player.Id);
                bool cameOnline = player == null;

                if (player == null)
                {
                    player = new OnlinePlayer(connection.Player);
                    _online.Add(player);
                }

                player.Connections.Add(connection);
                List<PlayerInfo> players = ListPlayers();

                connection.Send(ProtocolJson.Serialize(new HelloMessage(connection.Player.Id, players)));

                if (cameOnline)
                {
                    SendToAllBut(player, new PlayersMessage(players));
                }
            }
        }

        /// <summary>
        /// Removes a connection, and tells everyone else when it was its player's last.
        /// </summary>
        public void Disconnect(CityConnection connection)
        {
            lock (_lock)
            {
                OnlinePlayer? player = _online.Find(online => online.Connections.Contains(connection));

                if (player == null || !player.Connections.Remove(connection) || player.Connections.Count > 0)
                {
                    return;
                }

                _online.Remove(player);
                SendToAllBut(player, new PlayersMessage(ListPlayers()));
            }
        }

        private List<PlayerInfo> ListPlayers()
        {
            return _online.Select(online => online.Info).ToList();
        }

        private void SendToAllBut(OnlinePlayer excluded, ServerMessage message)
        {
            string text = ProtocolJson.Serialize(message);

            foreach (OnlinePlayer player in _online.Where(online => online != excluded))
            {
                foreach (CityConnection connection in player.Connections)
                {
                    connection.Send(text);
                }
            }
        }

        private sealed class OnlinePlayer
        {
            public OnlinePlayer(PlayerInfo info)
            {
                Info = info;
            }

            public PlayerInfo Info { get; }

            public List<CityConnection> Connections { get; } = new List<CityConnection>();
        }
    }
}
