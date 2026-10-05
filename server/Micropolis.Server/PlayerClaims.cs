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

using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using EasyReasy.Auth;
using Micropolis.Rules;

namespace Micropolis.Server
{
    /// <summary>
    /// What a player's token carries. Every token carries the same claims and no roles: the subject is the player id,
    /// and the display name is a claim, since two players may share a name.
    /// </summary>
    internal static class PlayerClaims
    {
        public const string AuthType = "user";
        public const string Name = JwtRegisteredClaimNames.Name;

        public static readonly TimeSpan TokenLifetime = TimeSpan.FromDays(30);

        public static IEnumerable<Claim> For(string name)
        {
            return [new Claim(Name, name)];
        }

        /// <summary>
        /// The authenticated player, or null when the token lacks a claim every player's token carries.
        /// </summary>
        public static PlayerInfo? ReadPlayer(HttpContext context)
        {
            string? id = context.GetUserId();
            string? name = context.GetClaimValue(Name);

            if (id == null || name == null)
            {
                return null;
            }

            return new PlayerInfo(id, name);
        }

        /// <summary>
        /// When the authenticated token expires, or null when it carries no expiry.
        /// </summary>
        public static DateTimeOffset? ReadExpiry(HttpContext context)
        {
            string? expiry = context.GetClaimValue(JwtRegisteredClaimNames.Exp);

            if (!long.TryParse(expiry, NumberStyles.None, CultureInfo.InvariantCulture, out long seconds))
            {
                return null;
            }

            return DateTimeOffset.FromUnixTimeSeconds(seconds);
        }
    }
}
