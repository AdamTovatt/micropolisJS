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

using System.Text;
using Micropolis.Rules;

namespace Micropolis.Benchmarks
{
    /// <summary>
    /// One case's state-message bytes per step, and the state hash the measured city ended at, which the timed city
    /// must end at too, so both figures are of one city.
    /// </summary>
    internal sealed record CaseBytes(double BytesPerStep, string StateHash);

    /// <summary>
    /// The state-message bytes per step a player in a city on the server receives: after each turn of its city's loop
    /// that stepped the city, the server builds a batch of the state messages that changed (<see
    /// cref="CityStateMessages"/>), and unless it is empty sends every player in the city its text in one WebSocket
    /// text frame. The loop turns a frame apart, at the 60 steps a second the city runs at, so a turn takes a step on
    /// average, and the city here sends a batch after each step. A turn that takes several steps sends one batch for
    /// them all, which can be smaller than theirs one at a time.
    /// </summary>
    internal static class MessageBytes
    {
        /// <summary>
        /// What the figures measure, as the report says.
        /// </summary>
        public const string Source =
            $"the server's state messages (`{nameof(CityStateMessages)}` in `server/Micropolis.Rules`), taking one step " +
            "a turn of the server's loop, as it does on average at 60 steps a second: a batch after each step unless " +
            "nothing a player is sent changed, each counted as the UTF-8 bytes of the batch's JSON text, the payload of " +
            "the WebSocket text frame every player in the city is sent";

        /// <summary>
        /// The case's bytes per step over the steps after the warmup, and the state hash its city ends at.
        /// </summary>
        public static CaseBytes Measure(BenchmarkCase benchmarkCase, BenchmarkSettings settings)
        {
            Simulation city = benchmarkCase.Start();
            CityStateMessages messages = new CityStateMessages(city);

            for (int step = 0; step < settings.Warmup; step++)
            {
                city.Step();
            }

            // What the warmup changed, which a player would have been sent before the steps measured
            messages.NewMessages();
            long bytes = 0;

            for (int step = 0; step < settings.Steps; step++)
            {
                city.Step();
                bytes += BatchBytes(messages.NewMessages());
            }

            return new CaseBytes((double)bytes / settings.Steps, StateHash.HashSavedState(city.Save()));
        }

        /// <summary>
        /// The bytes of the frame the server sends a batch of state messages in, or none for no messages, which the
        /// server doesn't send.
        /// </summary>
        internal static int BatchBytes(IReadOnlyList<StateMessage> batch)
        {
            return batch.Count == 0 ? 0 : Encoding.UTF8.GetByteCount(ProtocolJson.Serialize(StateBatchMessage.Of(batch)));
        }
    }
}
