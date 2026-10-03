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
using EasyReasy.Auth;
using Micropolis.Rules;

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
        /// The rate limiting policy on signing in: anyone may sign in, so each client address gets a few a minute.
        /// </summary>
        public const string SignInRateLimit = "sign-in";

        public static void Map(WebApplication app)
        {
            app.MapPost(Path, SignInAsync).AllowAnonymous().RequireRateLimiting(SignInRateLimit);
            app.MapGet(Path, GetSession).RequireAuthorization();
        }

        // Every sign-in is a new player, under a new id
        private static async Task<IResult> SignInAsync(HttpRequest request, IJwtTokenService tokens, TimeProvider time)
        {
            SignInRequest signIn;

            try
            {
                using StreamReader reader = new StreamReader(request.Body);
                signIn = ProtocolJson.DeserializeSessionBody<SignInRequest>(await reader.ReadToEndAsync(request.HttpContext.RequestAborted));
            }
            catch (JsonException)
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

            return Body(StatusCodes.Status200OK, new SessionResponse(token, playerId, name));
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

        /// <summary>
        /// A response carrying the body as the protocol writes it.
        /// </summary>
        public static IResult Body(int statusCode, SessionBody body)
        {
            return Results.Text(ProtocolJson.Serialize(body), "application/json", Encoding.UTF8, statusCode);
        }
    }
}
