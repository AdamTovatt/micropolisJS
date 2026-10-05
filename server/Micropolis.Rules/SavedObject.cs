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

using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Micropolis.Rules
{
    /// <summary>
    /// One object of a save being loaded, read key by key against <c>docs/state-hash.md</c>. Every read checks its
    /// value's type and documented range. An object is read through a function, and once it returns, a key of the
    /// object that the function didn't read fails, so a save with a key missing, unknown or out of range fails with a
    /// <see cref="SaveFormatException"/> naming the key.
    /// </summary>
    /// <remarks>
    /// A JavaScript number is a double, so an integer the save holds is exact only within ±2^53, and is read as a
    /// <see langword="long"/> where the specification gives it no narrower range.
    /// </remarks>
    internal sealed class SavedObject
    {
        private const long MaxSafeInteger = 9007199254740991;

        private readonly JsonObject _object;
        private readonly string _path;
        private readonly HashSet<string> _read = new HashSet<string>(StringComparer.Ordinal);

        private SavedObject(JsonObject value, string path)
        {
            _object = value;
            _path = path;
        }

        /// <summary>
        /// Reads the save itself from its text, which has to be JSON, an object, and hold no object with a key twice:
        /// <c>JSON.parse</c> would keep the last of a key written twice, which a save never holds.
        /// </summary>
        public static T ReadRoot<T>(string saveText, Func<SavedObject, T> read)
        {
            try
            {
                using (JsonDocument document = JsonDocument.Parse(saveText))
                {
                    RejectRepeatedKeys(document.RootElement, "state");
                }
            }
            catch (JsonException exception)
            {
                throw new SaveFormatException("state", $"is not JSON: {exception.Message}");
            }
            catch (InvalidOperationException)
            {
                // A key that is a lone surrogate, which no key of a save is
                throw new SaveFormatException("state", "holds a key that is not text");
            }

            return ReadComplete(JsonNode.Parse(saveText), "state", read);
        }

        public T ReadObject<T>(string key, Func<SavedObject, T> read)
        {
            return ReadComplete(Get(key), PathOf(key), read);
        }

        public void ReadObject(string key, Action<SavedObject> read)
        {
            ReadComplete(Get(key), PathOf(key), saved =>
            {
                read(saved);
                return true;
            });
        }

        public List<T> ReadObjectList<T>(string key, Func<SavedObject, T> read)
        {
            return ReadList(key, null, (node, path) => ReadComplete(node, path, read));
        }

        public List<T> ReadObjectList<T>(string key, int count, Func<SavedObject, T> read)
        {
            return ReadList(key, count, (node, path) => ReadComplete(node, path, read));
        }

        public bool ReadBool(string key)
        {
            JsonNode? node = Get(key);

            if (node is not JsonValue value || (value.GetValueKind() != JsonValueKind.True && value.GetValueKind() != JsonValueKind.False))
            {
                throw new SaveFormatException(PathOf(key), "must be true or false");
            }

            return value.GetValueKind() == JsonValueKind.True;
        }

        public bool ReadBool(string key, IReadOnlyCollection<bool> allowed)
        {
            bool value = ReadBool(key);

            if (!allowed.Contains(value))
            {
                throw new SaveFormatException(PathOf(key), $"must be {string.Join(" or ", allowed.Select(Written))}, got {Written(value)}");
            }

            return value;
        }

        /// <summary>
        /// An integer the specification gives no range: any a JavaScript number holds exactly, within ±2^53.
        /// </summary>
        public long ReadSafeInteger(string key)
        {
            return AsInteger(Get(key), PathOf(key), -MaxSafeInteger, MaxSafeInteger);
        }

        public long? ReadNullableSafeInteger(string key)
        {
            JsonNode? node = Get(key);
            return node == null ? null : AsInteger(node, PathOf(key), -MaxSafeInteger, MaxSafeInteger);
        }

        /// <summary>
        /// An integer the specification gives a range, from <paramref name="min"/> to <paramref name="max"/>.
        /// </summary>
        public int ReadInt(string key, int min, int max)
        {
            return (int)AsInteger(Get(key), PathOf(key), min, max);
        }

        /// <summary>
        /// An integer that numbers a member of <typeparamref name="T"/>.
        /// </summary>
        public T ReadEnum<T>(string key) where T : struct, Enum
        {
            string path = PathOf(key);
            long number = AsInteger(Get(key), path, -MaxSafeInteger, MaxSafeInteger);
            T[] members = Enum.GetValues<T>();

            if (!members.Any(member => Convert.ToInt64(member, CultureInfo.InvariantCulture) == number))
            {
                throw new SaveFormatException(path, $"must be one of {string.Join(", ", members.Select(member => Convert.ToInt64(member, CultureInfo.InvariantCulture)))}, got {number}");
            }

            return (T)Enum.ToObject(typeof(T), number);
        }

        /// <summary>
        /// A string that names a member of <typeparamref name="T"/>, as <see cref="SavedName"/> writes it.
        /// </summary>
        public T ReadName<T>(string key) where T : struct, Enum
        {
            return SavedName.Parse<T>(ReadString(key, SavedName.All<T>()));
        }

        public uint ReadUInt32(string key)
        {
            return (uint)AsInteger(Get(key), PathOf(key), uint.MinValue, uint.MaxValue);
        }

        /// <summary>
        /// A number that need not be an integer, from <paramref name="min"/> to <paramref name="max"/>.
        /// </summary>
        public double ReadNumber(string key, double min, double max)
        {
            string path = PathOf(key);
            double number = AsNumber(Get(key), path);

            if (number < min || number > max)
            {
                throw new SaveFormatException(path, $"must be from {Format(min)} to {Format(max)}, got {Format(number)}");
            }

            return number;
        }

        /// <summary>
        /// A number that need not be an integer, with no documented range.
        /// </summary>
        public double ReadNumber(string key)
        {
            return AsNumber(Get(key), PathOf(key));
        }

        public string ReadString(string key, IReadOnlyCollection<string> allowed)
        {
            return AsString(Get(key), PathOf(key), allowed);
        }

        public string? ReadNullableString(string key, IReadOnlyCollection<string> allowed)
        {
            JsonNode? node = Get(key);
            return node == null ? null : AsString(node, PathOf(key), allowed);
        }

        public long[] ReadSafeIntegerList(string key, int count)
        {
            return ReadList(key, count, (node, path) => AsInteger(node, path, -MaxSafeInteger, MaxSafeInteger)).ToArray();
        }

        public int[] ReadIntList(string key, int count, int min, int max)
        {
            return ReadList(key, count, (node, path) => (int)AsInteger(node, path, min, max)).ToArray();
        }

        public uint[] ReadUInt32List(string key, int count)
        {
            return ReadList(key, count, (node, path) => (uint)AsInteger(node, path, uint.MinValue, uint.MaxValue)).ToArray();
        }

        // Fails on a key of this object that nothing read: one the specification doesn't have
        private void Complete()
        {
            foreach (string key in _object.Select(member => member.Key))
            {
                if (!_read.Contains(key))
                {
                    throw new SaveFormatException(PathOf(key), "is not a key the save may hold");
                }
            }
        }

        /// <summary>
        /// Reports a value of a key read earlier that the specification doesn't allow, naming the key.
        /// </summary>
        public SaveFormatException Invalid(string key, string problem)
        {
            return new SaveFormatException(PathOf(key), problem);
        }

        private JsonNode? Get(string key)
        {
            if (!_object.TryGetPropertyValue(key, out JsonNode? node))
            {
                throw new SaveFormatException(PathOf(key), "is missing");
            }

            _read.Add(key);
            return node;
        }

        private string PathOf(string key)
        {
            return Join(_path, key);
        }

        private static string Join(string path, string key)
        {
            return path == "state" ? key : $"{path}.{key}";
        }

        private static void RejectRepeatedKeys(JsonElement element, string path)
        {
            if (element.ValueKind == JsonValueKind.Object)
            {
                HashSet<string> keys = new HashSet<string>(StringComparer.Ordinal);

                foreach (JsonProperty property in element.EnumerateObject())
                {
                    string propertyPath = Join(path, property.Name);

                    if (!keys.Add(property.Name))
                    {
                        throw new SaveFormatException(propertyPath, "is written more than once");
                    }

                    RejectRepeatedKeys(property.Value, propertyPath);
                }
            }
            else if (element.ValueKind == JsonValueKind.Array)
            {
                int i = 0;

                foreach (JsonElement entry in element.EnumerateArray())
                {
                    RejectRepeatedKeys(entry, $"{path}[{i}]");
                    i++;
                }
            }
        }

        private List<T> ReadList<T>(string key, int? count, Func<JsonNode?, string, T> read)
        {
            string path = PathOf(key);

            if (Get(key) is not JsonArray array)
            {
                throw new SaveFormatException(path, "must be a list");
            }

            if (count != null && array.Count != count)
            {
                throw new SaveFormatException(path, $"must hold {count} entries, got {array.Count}");
            }

            return array.Select((node, i) => read(node, $"{path}[{i}]")).ToList();
        }

        private static T ReadComplete<T>(JsonNode? node, string path, Func<SavedObject, T> read)
        {
            if (node is not JsonObject value)
            {
                throw new SaveFormatException(path, "must be an object");
            }

            SavedObject saved = new SavedObject(value, path);
            T result = read(saved);
            saved.Complete();
            return result;
        }

        private static double AsNumber(JsonNode? node, string path)
        {
            if (node is not JsonValue value || value.GetValueKind() != JsonValueKind.Number || !JsonNumber.TryGetDouble(value, out double number)
                || !double.IsFinite(number))
            {
                throw new SaveFormatException(path, "must be a number");
            }

            return number;
        }

        private static long AsInteger(JsonNode? node, string path, long min, long max)
        {
            double number = AsNumber(node, path);

            if (Math.Floor(number) != number)
            {
                throw new SaveFormatException(path, $"must be an integer, got {Format(number)}");
            }

            if (number < min || number > max)
            {
                throw new SaveFormatException(path, $"must be from {min} to {max}, got {Format(number)}");
            }

            return (long)number;
        }

        private static string AsString(JsonNode? node, string path, IReadOnlyCollection<string> allowed)
        {
            if (node is not JsonValue value || value.GetValueKind() != JsonValueKind.String)
            {
                throw new SaveFormatException(path, "must be a string");
            }

            string text = JsonString.Get(value);

            if (!allowed.Contains(text))
            {
                throw new SaveFormatException(path, $"must be one of {string.Join(", ", allowed.Select(entry => $"\"{entry}\""))}, got \"{text}\"");
            }

            return text;
        }

        private static string Format(double number)
        {
            return number.ToString("R", CultureInfo.InvariantCulture);
        }

        private static string Written(bool value)
        {
            return value ? "true" : "false";
        }
    }
}
