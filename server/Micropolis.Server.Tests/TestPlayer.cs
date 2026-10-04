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

using System.Text.Json;
using System.Text.Json.Nodes;
using Micropolis.Rules;

namespace Micropolis.Server.Tests
{
    /// <summary>
    /// A signed-in player on the city's socket, as a browser's city source uses it: it makes requests and reads the
    /// answers, keeping the state batches that come before each.
    /// </summary>
    internal sealed class TestPlayer : IAsyncDisposable
    {
        private long _nextId;

        private TestPlayer(SignedIn session, TestSocket socket)
        {
            Session = session;
            Socket = socket;
        }

        public SignedIn Session { get; }

        public TestSocket Socket { get; }

        /// <summary>
        /// Every state batch received, as the wire carried it, in order.
        /// </summary>
        public List<string> Batches { get; } = new List<string>();

        /// <summary>
        /// Every state message received, in order.
        /// </summary>
        public IEnumerable<JsonObject> StateMessages => Batches.SelectMany(batch => JsonNode.Parse(batch, documentOptions: DeepDocuments)!["messages"]!
            .AsArray().Select(message => message!.AsObject()));

        // As deep as the server writes what a player sent, such as a command a result echoes
        private static readonly JsonDocumentOptions DeepDocuments = new JsonDocumentOptions { MaxDepth = 1024 };

        public static async Task<TestPlayer> ConnectAsync(ServerUnderTest city, string name)
        {
            SignedIn session = await city.SignInAsync(name);
            TestSocket socket = await city.ConnectAsync(session.Token);
            await socket.ReceiveAsync<HelloMessage>();
            return new TestPlayer(session, socket);
        }

        /// <summary>
        /// Starts a new city on the seed's map, and gives its id.
        /// </summary>
        public async Task<string> StartAsync(string name = "Town", uint seed = 2026, int level = 0)
        {
            return (string)(await RequestAsync(id => new StartRequest(id, name, seed, level)))!["city"]!;
        }

        public async Task JoinAsync(string city)
        {
            await RequestAsync(id => new JoinRequest(id, city));
        }

        public async Task SendAsync(JsonObject command)
        {
            await Socket.SendAsync(new CommandMessage(command));
        }

        /// <summary>
        /// Makes the request, and gives its answer once it comes, keeping the state batches before it. A request that
        /// fails throws, saying why.
        /// </summary>
        public async Task<JsonNode?> RequestAsync(Func<long, ClientMessage> request)
        {
            long id = _nextId++;
            await Socket.SendAsync(request(id));

            while (true)
            {
                string text = await Socket.ReceiveTextAsync();

                switch (ProtocolJson.DeserializeServerMessage(text))
                {
                    case StateBatchMessage:
                        Batches.Add(text);
                        break;

                    case AnswerMessage answer when answer.Id == id:
                        return answer.Value;

                    case FailedMessage failed when failed.Id == id:
                        throw new RequestFailedException(failed.Error);

                    case PlayersMessage:
                        break;

                    default:
                        throw new AssertFailedException($"Expected the answer to request {id}, got {text}");
                }
            }
        }

        /// <summary>
        /// The answer to a query.
        /// </summary>
        public async Task<JsonObject> AskAsync(JsonObject query)
        {
            return (await RequestAsync(id => new QueryRequest(id, query)))!.AsObject();
        }

        public async Task<string> SaveAsync()
        {
            return (string)(await RequestAsync(id => new SaveRequest(id)))!;
        }

        public async Task<long> CityTimeAsync()
        {
            return (long)(await RequestAsync(id => new CityTimeRequest(id)))!;
        }

        /// <summary>
        /// The city's command log, as the session log carries it.
        /// </summary>
        public async Task<JsonObject> CommandLogAsync()
        {
            return (await RequestAsync(id => new CommandLogRequest(id)))!["log"]!.AsObject();
        }

        /// <summary>
        /// The results of the commands received so far, in order.
        /// </summary>
        public IEnumerable<JsonObject> CommandResults => StateMessages
            .Where(message => (string)message["type"]! == "commandResult")
            .Select(message => message["result"]!.AsObject());

        public async ValueTask DisposeAsync()
        {
            await Socket.DisposeAsync();
        }
    }

    /// <summary>
    /// A request the server answered with its failure.
    /// </summary>
    internal sealed class RequestFailedException : Exception
    {
        public RequestFailedException(string error)
            : base(error)
        {
        }
    }
}
