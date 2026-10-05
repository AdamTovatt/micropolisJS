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

using System.Diagnostics;
using System.Numerics;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The rules for simulation code, held over the compiled Micropolis.Rules: no clock, no randomness but
    /// <see cref="RandomStream"/>, nothing read from the machine, and no <c>Math</c> function whose result can differ
    /// between runtimes. The check reads the assembly's metadata, which lists every type and member of another assembly
    /// the code refers to, so a reference is found however the source spells it.
    /// </summary>
    [TestClass]
    public sealed class PortableRulesTests
    {
        // Clocks, randomness, the machine and hashing seeded per process: what makes a city differ from one run to the
        // next. A generic math interface that offers transcendental functions is forbidden whole, since a call through
        // it names the interface, not the number type.
        private static readonly HashSet<string> ForbiddenTypes =
        [
            "System.DateTime",
            "System.DateTimeOffset",
            "System.TimeProvider",
            "System.TimeZoneInfo",
            "System.Random",
            "System.HashCode",
            "System.Diagnostics.Stopwatch",
            "System.Security.Cryptography.RandomNumberGenerator",
            "System.Threading.Timer",
            "System.Timers.Timer",
            "System.Numerics.Complex",
            "System.Numerics.IExponentialFunctions`1",
            "System.Numerics.IFloatingPointIeee754`1",
            "System.Numerics.IHyperbolicFunctions`1",
            "System.Numerics.ILogarithmicFunctions`1",
            "System.Numerics.IPowerFunctions`1",
            "System.Numerics.IRootFunctions`1",
            "System.Numerics.ITrigonometricFunctions`1",
        ];

        // Members forbidden on types that are otherwise fine. A string's hash code, seeded per process, is not among them,
        // since no metadata names it: the compiler calls it as object's GetHashCode, as every record's own hashing does.
        private static readonly HashSet<string> ForbiddenMembers =
        [
            "System.Guid.NewGuid",
            "System.Guid.CreateVersion7",
        ];

        // Types whose every member is forbidden but those given: the machine's environment, but the thread id, which the
        // iterators and generated regexes the compiler writes read, and no city state does
        private static readonly IReadOnlyDictionary<string, HashSet<string>> ForbiddenBut = new Dictionary<string, HashSet<string>>
        {
            ["System.Environment"] = ["get_CurrentManagedThreadId"],
        };

        // The Math functions whose results are exact everywhere: every other function of Math and MathF is forbidden
        private static readonly HashSet<string> PortableMath =
        [
            "Abs", "BigMul", "Ceiling", "Clamp", "CopySign", "DivRem", "Floor", "Max", "Min", "Round", "Sign", "Truncate",
        ];

        private static readonly HashSet<string> MathTypes = ["System.Math", "System.MathF"];

        // The transcendental functions the number types offer as their own static members, which generic math reaches
        private static readonly HashSet<string> NumberTypes = ["System.Double", "System.Single", "System.Half"];

        private static readonly string[] Transcendental =
        [
            "Acos", "Asin", "Atan", "Cbrt", "Cos", "Exp", "FusedMultiplyAdd", "Hypot", "Log", "Pow", "Reciprocal", "RootN",
            "Sin", "Sqrt", "Tan",
        ];

        [TestMethod]
        public void References_MicropolisRules_AreAllPortable()
        {
            IReadOnlyList<string> references = References(typeof(Simulation).Assembly.Location);

            // The scan reads references at all: the rules call Math.Floor, which is portable
            CollectionAssert.Contains(references.ToList(), "System.Math.Floor");
            string forbidden = string.Join(", ", references.Where(IsForbidden));
            Assert.IsTrue(forbidden.Length == 0, $"Forbidden: {forbidden}");
        }

        // Code that breaks each rule, in this assembly, is found
        [TestMethod]
        public void References_CodeThatBreaksTheRules_AreFound()
        {
            List<string> forbidden = References(typeof(PortableRulesTests).Assembly.Location).Where(IsForbidden).ToList();

            string[] planted =
            [
                "System.DateTime", "System.DateTime.get_Now", "System.Environment.get_TickCount64", "System.Random",
                "System.Diagnostics.Stopwatch", "System.Guid.NewGuid", "System.Math.Sqrt", "System.MathF.Sin", "System.Double.Pow",
                "System.Numerics.IRootFunctions`1", "System.HashCode",
            ];

            string missed = string.Join(", ", planted.Where(reference => !forbidden.Contains(reference)));
            Assert.IsTrue(missed.Length == 0, $"Not found: {missed}");
            Assert.DoesNotContain("System.Math.Floor", forbidden);
            Assert.DoesNotContain("System.Environment.get_CurrentManagedThreadId", forbidden);
        }

        private static bool IsForbidden(string reference)
        {
            int dot = reference.LastIndexOf('.');
            string type = reference[..dot];
            string member = reference[(dot + 1)..];

            return ForbiddenTypes.Contains(reference) || ForbiddenTypes.Contains(type) || ForbiddenMembers.Contains(reference) ||
                   (ForbiddenBut.TryGetValue(type, out HashSet<string>? allowed) && !allowed.Contains(member)) ||
                   (MathTypes.Contains(type) && !PortableMath.Contains(member)) ||
                   (NumberTypes.Contains(type) && Transcendental.Any(name => member.StartsWith(name, StringComparison.Ordinal)));
        }

        // Every type the assembly refers to in another assembly, by its full name, and every member of one, by its
        // type's full name and its own
        private static IReadOnlyList<string> References(string assemblyPath)
        {
            using FileStream file = File.OpenRead(assemblyPath);
            using PEReader assembly = new PEReader(file);
            MetadataReader metadata = assembly.GetMetadataReader();
            List<string> references = new List<string>();

            foreach (TypeReferenceHandle handle in metadata.TypeReferences)
            {
                references.Add(TypeName(metadata, handle));
            }

            foreach (MemberReferenceHandle handle in metadata.MemberReferences)
            {
                MemberReference member = metadata.GetMemberReference(handle);

                if (member.Parent.Kind == HandleKind.TypeReference)
                {
                    references.Add($"{TypeName(metadata, (TypeReferenceHandle)member.Parent)}.{metadata.GetString(member.Name)}");
                }
            }

            return references;
        }

        private static string TypeName(MetadataReader metadata, TypeReferenceHandle handle)
        {
            TypeReference type = metadata.GetTypeReference(handle);
            string name = metadata.GetString(type.Name);

            // A nested type is named by the type it is nested in
            if (type.ResolutionScope.Kind == HandleKind.TypeReference)
            {
                return $"{TypeName(metadata, (TypeReferenceHandle)type.ResolutionScope)}+{name}";
            }

            string space = metadata.GetString(type.Namespace);
            return space.Length == 0 ? name : $"{space}.{name}";
        }

        // Never called: the code the negative control finds, compiled in as any method is
        internal static double BreaksTheRules()
        {
            Stopwatch stopwatch = Stopwatch.StartNew();
            double clock = DateTime.Now.Ticks + Environment.TickCount64 + new Random().Next() + Guid.NewGuid().GetHashCode();
            return clock + Math.Sqrt(2) + MathF.Sin(1) + double.Pow(2, 0.5) + Math.Floor(1.5) + stopwatch.ElapsedTicks + Root(2.0) +
                   HashCode.Combine(1, 2) + Environment.CurrentManagedThreadId;
        }

        // A square root through generic math, which names the interface rather than double
        internal static T Root<T>(T value) where T : IRootFunctions<T>
        {
            return T.Sqrt(value);
        }
    }
}
