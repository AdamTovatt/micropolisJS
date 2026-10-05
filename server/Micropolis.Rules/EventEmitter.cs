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

using System.Text.Json.Nodes;

namespace Micropolis.Rules
{
    /// <summary>
    /// Listeners by event name: an event goes to its name's listeners in the order they were added, and an event no one
    /// listens to goes nowhere. Names are the strings of <see cref="Messages"/>.
    /// </summary>
    public sealed class EventEmitter
    {
        private readonly Dictionary<string, List<Action<JsonNode?>>> _listeners = new Dictionary<string, List<Action<JsonNode?>>>();

        /// <summary>
        /// Sees every event before its listeners do, whatever its name, as a test records the simulation's.
        /// </summary>
        internal Action<string, JsonNode?>? Observer { get; set; }

        /// <summary>
        /// Adds a listener for the event, unless it already listens to it.
        /// </summary>
        public void AddEventListener(string eventName, Action<JsonNode?> listener)
        {
            List<Action<JsonNode?>> listeners = ListenersFor(eventName);

            if (!listeners.Contains(listener))
            {
                listeners.Add(listener);
            }
        }

        public void RemoveEventListener(string eventName, Action<JsonNode?> listener)
        {
            ListenersFor(eventName).Remove(listener);
        }

        /// <summary>
        /// Sends the event to its listeners. A payload of <see langword="null"/> is an event emitted without one.
        /// </summary>
        internal void Emit(string eventName, JsonNode? payload = null)
        {
            Observer?.Invoke(eventName, payload);

            // A copy, as a listener may remove itself
            foreach (Action<JsonNode?> listener in ListenersFor(eventName).ToList())
            {
                listener(payload);
            }
        }

        private List<Action<JsonNode?>> ListenersFor(string eventName)
        {
            if (!_listeners.TryGetValue(eventName, out List<Action<JsonNode?>>? listeners))
            {
                listeners = new List<Action<JsonNode?>>();
                _listeners[eventName] = listeners;
            }

            return listeners;
        }
    }
}
