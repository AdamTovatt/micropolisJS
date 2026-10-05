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

namespace Micropolis.Rules
{
    /// <summary>
    /// Listeners by event: an event goes to its key's listeners in the order they were added, and an event no one
    /// listens to goes nowhere. The keys are those of <see cref="RulesEvents"/>, each with the payload it carries.
    /// </summary>
    public sealed class EventEmitter
    {
        // Each listener is an Action of its key's payload, or a bare Action for a key without one
        private readonly Dictionary<EventKey, List<Delegate>> _listeners = new Dictionary<EventKey, List<Delegate>>();

        /// <summary>
        /// Sees every event before its listeners do, whatever its key, by its name and its payload, or
        /// <see langword="null"/> for an event without one, as a test records the simulation's.
        /// </summary>
        internal Action<string, object?>? Observer { get; set; }

        /// <summary>
        /// Adds a listener for the event, unless it already listens to it.
        /// </summary>
        public void AddEventListener<TPayload>(EventName<TPayload> eventName, Action<TPayload> listener)
        {
            Add(eventName, listener);
        }

        /// <summary>
        /// Adds a listener for the event without a payload, unless it already listens to it.
        /// </summary>
        public void AddEventListener(EventName eventName, Action listener)
        {
            Add(eventName, listener);
        }

        /// <summary>
        /// Sends the event to its listeners.
        /// </summary>
        internal void Emit<TPayload>(EventName<TPayload> eventName, TPayload payload)
        {
            Observer?.Invoke(eventName.Name, payload);

            // A copy, as a listener may add another
            foreach (Delegate listener in ListenersFor(eventName).ToArray())
            {
                ((Action<TPayload>)listener)(payload);
            }
        }

        /// <summary>
        /// Sends the event without a payload to its listeners.
        /// </summary>
        internal void Emit(EventName eventName)
        {
            Observer?.Invoke(eventName.Name, null);

            // A copy, as a listener may add another
            foreach (Delegate listener in ListenersFor(eventName).ToArray())
            {
                ((Action)listener)();
            }
        }

        private void Add(EventKey eventName, Delegate listener)
        {
            if (!_listeners.TryGetValue(eventName, out List<Delegate>? listeners))
            {
                listeners = new List<Delegate>();
                _listeners[eventName] = listeners;
            }

            if (!listeners.Contains(listener))
            {
                listeners.Add(listener);
            }
        }

        private IReadOnlyList<Delegate> ListenersFor(EventKey eventName)
        {
            return _listeners.TryGetValue(eventName, out List<Delegate>? listeners) ? listeners : [];
        }
    }
}
