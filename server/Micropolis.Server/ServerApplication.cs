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

using System.Text;
using System.Threading.RateLimiting;
using EasyReasy.Auth;
using Micropolis.Rules;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Micropolis.Server
{
    /// <summary>
    /// The server: sign-in, the city's WebSocket and, outside development, the built client.
    /// </summary>
    internal static class ServerApplication
    {
        /// <summary>
        /// The configuration key, and so the environment variable, holding the secret that signs players' tokens.
        /// </summary>
        public const string JwtSecretKey = "JWT_SECRET";

        // HS256 needs a key of at least 256 bits
        private const int MinimumJwtSecretBytes = 32;

        /// <summary>
        /// How many players one client address may sign in a minute.
        /// </summary>
        public const int SignInsPerMinute = 10;

        private static readonly TimeSpan KeepAliveInterval = TimeSpan.FromSeconds(15);
        private static readonly TimeSpan KeepAliveTimeout = TimeSpan.FromSeconds(15);

        /// <summary>
        /// Configures the services and the request pipeline on the builder and builds the application.
        /// </summary>
        /// <exception cref="InvalidOperationException">The configuration has no usable signing secret.</exception>
        public static WebApplication Build(WebApplicationBuilder builder)
        {
            string jwtSecret = ReadJwtSecret(builder.Configuration);

            builder.Services.AddEasyReasyAuth(jwtSecret, options =>
            {
                // A browser cannot set a header on a WebSocket, so the city's socket alone takes its token from the
                // query
                options.QueryStringTokenPaths = [CityEndpoint.Path];
                // This server both issues and checks the tokens, so there are no two clocks to allow for, and a token
                // accepted past its expiry would open a connection only for its expiry to close it at once
                options.ClockSkew = TimeSpan.Zero;
            });
            builder.Services.AddRateLimiter(options =>
            {
                // Per client address as the server sees it: behind a reverse proxy that is the proxy's address,
                // until the forwarded headers are honoured
                options.AddPolicy(SessionEndpoints.SignInRateLimit, context => RateLimitPartition.GetFixedWindowLimiter(
                    context.Connection.RemoteIpAddress?.ToString() ?? "",
                    _ => new FixedWindowRateLimiterOptions { PermitLimit = SignInsPerMinute, Window = TimeSpan.FromMinutes(1) }));
                options.OnRejected = (context, _) => new ValueTask(SessionEndpoints
                    .Body(StatusCodes.Status429TooManyRequests, new ErrorResponse("Too many sign-ins from here. Try again in a minute."))
                    .ExecuteAsync(context.HttpContext));
            });
            // Tests register their own clock first
            builder.Services.TryAddSingleton(TimeProvider.System);
            builder.Services.AddSingleton<PlayerPresence>();

            WebApplication app = builder.Build();

            // There are no credentials to guess, and a 401 means an expired token the client replaces at once, so
            // the library's delay after failed authentications would only slow players down
            app.UseEasyReasyAuth(options => options.Enabled = false);
            app.UseRateLimiter();
            // A connection that drops without a close leaves its player online until a ping goes unanswered
            app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = KeepAliveInterval, KeepAliveTimeout = KeepAliveTimeout });
            app.UseDefaultFiles();
            app.UseStaticFiles();

            SessionEndpoints.Map(app);
            CityEndpoint.Map(app);

            return app;
        }

        // Read here rather than when the token service is first resolved, so a server without its secret fails at
        // startup instead of at the first sign-in
        private static string ReadJwtSecret(IConfiguration configuration)
        {
            string? secret = configuration[JwtSecretKey];

            if (string.IsNullOrWhiteSpace(secret))
            {
                throw new InvalidOperationException($"{JwtSecretKey} is required: the secret that signs players' tokens.");
            }

            if (Encoding.UTF8.GetByteCount(secret) < MinimumJwtSecretBytes)
            {
                throw new InvalidOperationException($"{JwtSecretKey} must be at least {MinimumJwtSecretBytes} bytes long.");
            }

            return secret;
        }
    }
}
