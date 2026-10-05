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

using System.Diagnostics;
using System.Numerics;
using System.Reflection;
using System.Reflection.Emit;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;

namespace Micropolis.Rules.Tests
{
    /// <summary>
    /// The rules for simulation code, held over the compiled Micropolis.Rules: no clock, no randomness but
    /// <see cref="RandomStream"/>, nothing read from the machine, and no <c>Math</c> function whose result can differ
    /// between runtimes. The check reads the assembly's metadata, which lists every type and member of another assembly
    /// the code refers to, so a reference is found however the source spells it. The trip router, whose routes must be
    /// the same on every runtime, holds no floating point at all, which its instructions show.
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

        [TestMethod]
        public void Instructions_TripRouter_HoldNoFloatingPoint()
        {
            Assert.AreEqual("", string.Join(", ", FloatingPoint(typeof(TripRouter))));
        }

        // Floating point in a field, a local, a method's parameter and return, a call to a method that takes or returns
        // it, and the instructions that load and convert to it, in this assembly, is found
        [TestMethod]
        public void Instructions_CodeWithFloatingPoint_AreFound()
        {
            List<string> found = FloatingPoint(typeof(FloatingPointCode)).ToList();

            CollectionAssert.IsSubsetOf(
                new[]
                {
                    "Scale: Single", "Halve: conv.r8", "Halve: ldc.r8", "Fraction: returns Double", "Fraction: a parameter Double",
                    "Truncated: calls Fraction",
                },
                found, string.Join(", ", found));
        }

        // The floating point a type and the types nested in it hold: each field, local, parameter and return of a
        // floating-point type, each call to a method with one, and each instruction that loads a floating-point constant
        // or converts to floating point
        private static IEnumerable<string> FloatingPoint(Type type)
        {
            const BindingFlags declared = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance |
                                          BindingFlags.Static | BindingFlags.DeclaredOnly;

            foreach (FieldInfo field in type.GetFields(declared).Where(field => IsFloatingPoint(field.FieldType)))
            {
                yield return $"{field.Name}: {field.FieldType.Name}";
            }

            foreach (MethodBase method in type.GetMethods(declared).Concat<MethodBase>(type.GetConstructors(declared)))
            {
                if (method is MethodInfo { ReturnType: Type returned } && IsFloatingPoint(returned))
                {
                    yield return $"{method.Name}: returns {returned.Name}";
                }

                foreach (ParameterInfo parameter in method.GetParameters().Where(parameter => IsFloatingPoint(parameter.ParameterType)))
                {
                    yield return $"{method.Name}: a parameter {parameter.ParameterType.Name}";
                }

                MethodBody? body = method.GetMethodBody();

                if (body is null)
                {
                    continue;
                }

                foreach (LocalVariableInfo local in body.LocalVariables.Where(local => IsFloatingPoint(local.LocalType)))
                {
                    yield return $"{method.Name}: a local {local.LocalType.Name}";
                }

                byte[] instructions = body.GetILAsByteArray()!;

                for (int at = 0; at < instructions.Length;)
                {
                    OpCode instruction = OpCodesByValue[instructions[at] == 0xfe ? (short)(0xfe00 | instructions[at + 1]) : instructions[at]];
                    at += instruction.Size;

                    if (FloatingPointInstructions.Contains(instruction))
                    {
                        yield return $"{method.Name}: {instruction.Name}";
                    }

                    if (instruction.OperandType == OperandType.InlineMethod &&
                        method.Module.ResolveMethod(BitConverter.ToInt32(instructions, at), GenericArguments(method.DeclaringType), GenericArguments(method)) is MethodBase called &&
                        ((called is MethodInfo calledMethod && IsFloatingPoint(calledMethod.ReturnType)) ||
                         called.GetParameters().Any(parameter => IsFloatingPoint(parameter.ParameterType))))
                    {
                        yield return $"{method.Name}: calls {called.Name}";
                    }

                    at += OperandSize(instruction.OperandType, instructions, at);
                }
            }

            foreach (Type nested in type.GetNestedTypes(declared))
            {
                foreach (string found in FloatingPoint(nested))
                {
                    yield return found;
                }
            }
        }

        private static readonly Dictionary<short, OpCode> OpCodesByValue = typeof(OpCodes)
            .GetFields(BindingFlags.Public | BindingFlags.Static)
            .Select(field => (OpCode)field.GetValue(null)!)
            .ToDictionary(instruction => instruction.Value);

        private static readonly HashSet<OpCode> FloatingPointInstructions =
            [OpCodes.Ldc_R4, OpCodes.Ldc_R8, OpCodes.Conv_R4, OpCodes.Conv_R8, OpCodes.Conv_R_Un, OpCodes.Ckfinite];

        // The type arguments a method's tokens are resolved in, none where it is not generic
        private static Type[]? GenericArguments(MemberInfo? member)
        {
            return member switch
            {
                Type { IsGenericType: true } type => type.GetGenericArguments(),
                MethodInfo { IsGenericMethod: true } method => method.GetGenericArguments(),
                _ => null,
            };
        }

        private static bool IsFloatingPoint(Type type)
        {
            return type == typeof(float) || type == typeof(double) || type == typeof(Half) || type == typeof(decimal);
        }

        // The bytes of an instruction's operand, which follows it
        private static int OperandSize(OperandType operand, byte[] instructions, int at)
        {
            return operand switch
            {
                OperandType.InlineNone => 0,
                OperandType.ShortInlineBrTarget or OperandType.ShortInlineI or OperandType.ShortInlineVar => 1,
                OperandType.InlineVar => 2,
                OperandType.InlineI8 or OperandType.InlineR => 8,
                OperandType.InlineSwitch => 4 + 4 * BitConverter.ToInt32(instructions, at),
                _ => 4,
            };
        }

        // Never called: the floating point the negative control finds
        private static class FloatingPointCode
        {
            internal static float Scale = 1.5f;

            internal static int Halve(int value)
            {
                double half = value / 2.0;
                return (int)(half * Scale);
            }

            internal static double Fraction(double value)
            {
                return value - Math.Floor(value);
            }

            // A call whose floating point is gone by the next instruction, cast straight to a whole number
            internal static int Truncated(int value)
            {
                return (int)Fraction(value);
            }
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
