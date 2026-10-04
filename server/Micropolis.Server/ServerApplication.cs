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

using System.Net;
using System.Text;
using EasyReasy.Auth;
using Microsoft.AspNetCore.HttpOverrides;
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

        /// <summary>
        /// The configuration key, and so the environment variable, listing the addresses of the reverse proxies whose
        /// <c>X-Forwarded-For</c> header names the client, separated by commas, or <c>none</c>.
        /// </summary>
        public const string TrustedProxiesKey = "TRUSTED_PROXIES";

        /// <summary>
        /// The value of <see cref="TrustedProxiesKey"/> for a server that clients reach directly.
        /// </summary>
        public const string NoTrustedProxies = "none";

        /// <summary>
        /// The configuration key, and so the environment variable, naming the directory the server keeps its cities in,
        /// relative to the content root or absolute.
        /// </summary>
        public const string CityStoreKey = "CITY_STORE";

        /// <summary>
        /// The configuration key, and so the environment variable, a test server sets to <see cref="ManualClock"/> so
        /// that its cities' loops turn only when the debug channel says. Without it, cities run on the server's clock.
        /// </summary>
        public const string CityClockKey = "CITY_CLOCK";

        /// <summary>
        /// The value of <see cref="CityClockKey"/> for cities whose loops the debug channel turns.
        /// </summary>
        public const string ManualClock = "manual";

        // HS256 needs a key of at least 256 bits
        private const int MinimumJwtSecretBytes = 32;

        private static readonly TimeSpan KeepAliveInterval = TimeSpan.FromSeconds(15);
        private static readonly TimeSpan KeepAliveTimeout = TimeSpan.FromSeconds(15);

        /// <summary>
        /// Configures the services and the request pipeline on the builder and builds the application.
        /// </summary>
        /// <exception cref="InvalidOperationException">
        /// The configuration has no usable signing secret, or does not say which proxies to trust.
        /// </exception>
        public static WebApplication Build(WebApplicationBuilder builder)
        {
            string jwtSecret = ReadJwtSecret(builder.Configuration);
            ForwardedHeadersOptions? forwardedHeaders = ReadTrustedProxies(builder.Configuration);
            string cityStore = ReadCityStore(builder.Configuration, builder.Environment);
            bool manualClock = ReadManualClock(builder.Configuration);

            builder.Services.AddEasyReasyAuth(jwtSecret, options =>
            {
                // A browser cannot set a header on a WebSocket, so the city's socket alone takes its token from the
                // query
                options.QueryStringTokenPaths = [CityEndpoint.Path];
                // This server both issues and checks the tokens, so there are no two clocks to allow for, and a token
                // accepted past its expiry would open a connection only for its expiry to close it at once
                options.ClockSkew = TimeSpan.Zero;
            });
            builder.Services.AddRateLimiter(SessionEndpoints.AddRateLimit);
            // Tests register their own clock first
            builder.Services.TryAddSingleton(TimeProvider.System);
            builder.Services.AddSingleton<PlayerPresence>();
            builder.Services.AddSingleton(new CityStore(cityStore));
            builder.Services.AddSingleton(services => new ServerClock(services.GetRequiredService<TimeProvider>(), manualClock));
            builder.Services.AddSingleton<CityRegistry>();
            builder.Services.AddSingleton<CityLimits>();
            builder.Services.AddHostedService(services => services.GetRequiredService<CityRegistry>());

            WebApplication app = builder.Build();

            // First, so everything after it, the sign-in rate limit included, sees the client's address
            if (forwardedHeaders != null)
            {
                app.UseForwardedHeaders(forwardedHeaders);
            }

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

        // Required, since where a server keeps its cities is deployment's choice: a default would keep them somewhere no
        // one chose
        private static string ReadCityStore(IConfiguration configuration, IHostEnvironment environment)
        {
            string? directory = configuration[CityStoreKey];

            if (string.IsNullOrWhiteSpace(directory))
            {
                throw new InvalidOperationException($"{CityStoreKey} is required: the directory the server keeps its cities in.");
            }

            return Path.GetFullPath(directory, environment.ContentRootPath);
        }

        // Only a build with the debug channel can turn its cities' loops, so a release build given the manual clock fails
        // at startup
        private static bool ReadManualClock(IConfiguration configuration)
        {
            string? clock = configuration[CityClockKey];

            if (clock is null)
            {
                return false;
            }

            if (clock != ManualClock)
            {
                throw new InvalidOperationException($"{CityClockKey} is {ManualClock} or not set, not \"{clock}\".");
            }

            if (!DebugChannel.IsBuiltIn)
            {
                throw new InvalidOperationException($"{CityClockKey} is {ManualClock} only in a build with the debug channel.");
            }

            return true;
        }

        // Required, with an explicit value for none, since a server behind a proxy it does not trust sees every client
        // at the proxy's address, and one client's sign-ins then use up everyone's. Null for none: the middleware
        // trusts every address when it knows of no proxy at all, so a server without proxies goes without it.
        private static ForwardedHeadersOptions? ReadTrustedProxies(IConfiguration configuration)
        {
            string? value = configuration[TrustedProxiesKey];

            if (string.IsNullOrWhiteSpace(value))
            {
                throw new InvalidOperationException(
                    $"{TrustedProxiesKey} is required: the addresses of the reverse proxies in front of the server, separated by commas, or {NoTrustedProxies}.");
            }

            if (value.Trim() == NoTrustedProxies)
            {
                return null;
            }

            ForwardedHeadersOptions options = new ForwardedHeadersOptions { ForwardedHeaders = ForwardedHeaders.XForwardedFor };
            // Only the listed proxies, not the loopback ones trusted by default
            options.KnownIPNetworks.Clear();
            options.KnownProxies.Clear();

            foreach (string entry in value.Split(',', StringSplitOptions.TrimEntries))
            {
                if (!IPAddress.TryParse(entry, out IPAddress? proxy))
                {
                    throw new InvalidOperationException($"{TrustedProxiesKey} holds \"{entry}\", which is not an IP address.");
                }

                options.KnownProxies.Add(proxy);
            }

            return options;
        }
    }
}
