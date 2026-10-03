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
using System.Text.Json;
using System.Threading.RateLimiting;
using EasyReasy.Auth;
using Micropolis.Rules;
using Microsoft.AspNetCore.RateLimiting;

namespace Micropolis.Server
{
    /// <summary>
    /// Signing in, as protocol/README.md describes it. A display name is all a player gives: there are no passwords,
    /// no refresh tokens and no user database, so the library's own login endpoint stays unused. The bodies are read
    /// and written by <see cref="ProtocolJson"/>, which the shared examples pin to the client's.
    /// </summary>
    internal static class SessionEndpoints
    {
        public const string Path = "/api/session";

        /// <summary>
        /// How many players one client address may sign in a minute. Anyone may sign in, so this is what stops one
        /// client from minting players without end.
        /// </summary>
        public const int SignInsPerMinute = 10;

        /// <summary>
        /// The longest sign-in body read: a name of 32 UTF-16 code units, each escaped in JSON, fits several times.
        /// </summary>
        public const int MaximumSignInBytes = 1024;

        private const string SignInRateLimit = "sign-in";

        // Invalid UTF-8 is refused rather than read as replacement characters
        private static readonly UTF8Encoding StrictUtf8 = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);

        /// <summary>
        /// Adds the rate limit on signing in, per client address as <see cref="ServerApplication"/> resolves it from
        /// any trusted proxy.
        /// </summary>
        public static void AddRateLimit(RateLimiterOptions options)
        {
            options.AddPolicy(SignInRateLimit, context => RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = SignInsPerMinute, Window = TimeSpan.FromMinutes(1) }));
            // The server's only rate limit, so every rejection is a sign-in's
            options.OnRejected = (context, _) => new ValueTask(
                Body(StatusCodes.Status429TooManyRequests, new ErrorResponse("Too many sign-ins from here. Try again in a minute."))
                    .ExecuteAsync(context.HttpContext));
        }

        public static void Map(WebApplication app)
        {
            app.MapPost(Path, SignInAsync).AllowAnonymous().RequireRateLimiting(SignInRateLimit);
            app.MapGet(Path, GetSession).RequireAuthorization();
        }

        // Every sign-in is a new player, under a new id
        private static async Task<IResult> SignInAsync(HttpRequest request, IJwtTokenService tokens, TimeProvider time)
        {
            byte[]? bytes = await ReadBoundedAsync(request);

            if (bytes == null)
            {
                return Body(StatusCodes.Status413PayloadTooLarge, new ErrorResponse("A sign-in is a name and nothing more."));
            }

            SignInRequest signIn;

            try
            {
                signIn = ProtocolJson.DeserializeSessionBody<SignInRequest>(StrictUtf8.GetString(bytes));
            }
            catch (Exception exception) when (exception is JsonException or DecoderFallbackException)
            {
                return Body(StatusCodes.Status400BadRequest, new ErrorResponse("Send the name to sign in under."));
            }

            if (!PlayerName.TryNormalize(signIn.Name, out string? name, out string? error))
            {
                return Body(StatusCodes.Status400BadRequest, new ErrorResponse(error));
            }

            string playerId = Guid.NewGuid().ToString("N");
            DateTime expiresAt = time.GetUtcNow().Add(PlayerClaims.TokenLifetime).UtcDateTime;
            string token = tokens.CreateToken(playerId, PlayerClaims.AuthType, PlayerClaims.For(name), [], expiresAt);

            return Body(StatusCodes.Status200OK, new SessionResponse(token, name));
        }

        private static IResult GetSession(HttpContext context)
        {
            PlayerInfo? player = PlayerClaims.ReadPlayer(context);

            if (player == null)
            {
                return Results.Unauthorized();
            }

            return Body(StatusCodes.Status200OK, new PlayerResponse(player.Value.Id, player.Value.Name));
        }

        // The body, or null when it is longer than any sign-in
        private static async Task<byte[]?> ReadBoundedAsync(HttpRequest request)
        {
            // One byte more than the limit, so a body over it is seen before the buffer fills
            byte[] buffer = new byte[MaximumSignInBytes + 1];
            int length = 0;
            int read;

            while ((read = await request.Body.ReadAsync(buffer.AsMemory(length), request.HttpContext.RequestAborted)) > 0)
            {
                length += read;

                if (length > MaximumSignInBytes)
                {
                    return null;
                }
            }

            return buffer[..length];
        }

        private static IResult Body(int statusCode, SessionBody body)
        {
            return Results.Text(ProtocolJson.Serialize(body), "application/json", Encoding.UTF8, statusCode);
        }
    }
}
