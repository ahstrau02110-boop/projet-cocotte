// Mini JSON : lecture vers Dictionary/List/double/string/bool, écriture,
// et (dé)sérialisation par réflexion des champs publics (sauvegarde).
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Reflection;
using System.Text;

namespace PantyClicker.Core
{
    public static class Json
    {
        // ------------------------------------------------------------ lecture
        public static object Parse(string s)
        {
            int i = 0;
            var v = ReadValue(s, ref i);
            return v;
        }

        static void Ws(string s, ref int i) { while (i < s.Length && char.IsWhiteSpace(s[i])) i++; }

        static object ReadValue(string s, ref int i)
        {
            Ws(s, ref i);
            if (i >= s.Length) throw new FormatException("JSON incomplet");
            char c = s[i];
            if (c == '{') return ReadObject(s, ref i);
            if (c == '[') return ReadArray(s, ref i);
            if (c == '"') return ReadString(s, ref i);
            if (c == 't' && s.Substring(i, 4) == "true") { i += 4; return true; }
            if (c == 'f' && s.Substring(i, 5) == "false") { i += 5; return false; }
            if (c == 'n' && s.Substring(i, 4) == "null") { i += 4; return null; }
            int start = i;
            while (i < s.Length && "+-0123456789.eE".IndexOf(s[i]) >= 0) i++;
            return double.Parse(s.Substring(start, i - start), NumberStyles.Float, CultureInfo.InvariantCulture);
        }

        static Dictionary<string, object> ReadObject(string s, ref int i)
        {
            var d = new Dictionary<string, object>();
            i++; Ws(s, ref i);
            if (s[i] == '}') { i++; return d; }
            while (true)
            {
                Ws(s, ref i);
                string k = ReadString(s, ref i);
                Ws(s, ref i);
                if (s[i] != ':') throw new FormatException("':' attendu en " + i);
                i++;
                d[k] = ReadValue(s, ref i);
                Ws(s, ref i);
                if (s[i] == ',') { i++; continue; }
                if (s[i] == '}') { i++; return d; }
                throw new FormatException("',' ou '}' attendu en " + i);
            }
        }

        static List<object> ReadArray(string s, ref int i)
        {
            var l = new List<object>();
            i++; Ws(s, ref i);
            if (s[i] == ']') { i++; return l; }
            while (true)
            {
                l.Add(ReadValue(s, ref i));
                Ws(s, ref i);
                if (s[i] == ',') { i++; continue; }
                if (s[i] == ']') { i++; return l; }
                throw new FormatException("',' ou ']' attendu en " + i);
            }
        }

        static string ReadString(string s, ref int i)
        {
            if (s[i] != '"') throw new FormatException("'\"' attendu en " + i);
            i++;
            var sb = new StringBuilder();
            while (s[i] != '"')
            {
                char c = s[i++];
                if (c != '\\') { sb.Append(c); continue; }
                char e = s[i++];
                switch (e)
                {
                    case 'n': sb.Append('\n'); break;
                    case 't': sb.Append('\t'); break;
                    case 'r': sb.Append('\r'); break;
                    case 'b': sb.Append('\b'); break;
                    case 'f': sb.Append('\f'); break;
                    case 'u': sb.Append((char)Convert.ToInt32(s.Substring(i, 4), 16)); i += 4; break;
                    default: sb.Append(e); break;
                }
            }
            i++;
            return sb.ToString();
        }

        // ------------------------------------------------------------ écriture
        public static string Write(object o)
        {
            var sb = new StringBuilder();
            WriteValue(sb, o);
            return sb.ToString();
        }

        static void WriteValue(StringBuilder sb, object o)
        {
            switch (o)
            {
                case null: sb.Append("null"); return;
                case string s: WriteString(sb, s); return;
                case bool b: sb.Append(b ? "true" : "false"); return;
                case double d: sb.Append(Num(d)); return;
                case float f: sb.Append(Num(f)); return;
                case int n: sb.Append(n.ToString(CultureInfo.InvariantCulture)); return;
                case long l: sb.Append(l.ToString(CultureInfo.InvariantCulture)); return;
                case IDictionary dict:
                    sb.Append('{');
                    bool first = true;
                    foreach (DictionaryEntry kv in dict)
                    {
                        if (!first) sb.Append(',');
                        first = false;
                        WriteString(sb, kv.Key.ToString());
                        sb.Append(':');
                        WriteValue(sb, kv.Value);
                    }
                    sb.Append('}');
                    return;
                case IEnumerable list:
                    sb.Append('[');
                    bool f1 = true;
                    foreach (var x in list)
                    {
                        if (!f1) sb.Append(',');
                        f1 = false;
                        WriteValue(sb, x);
                    }
                    sb.Append(']');
                    return;
                default:
                    WriteValue(sb, ToTree(o));
                    return;
            }
        }

        static string Num(double d)
        {
            if (double.IsNaN(d) || double.IsInfinity(d)) return "0";
            return d.ToString("R", CultureInfo.InvariantCulture);
        }

        static void WriteString(StringBuilder sb, string s)
        {
            sb.Append('"');
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
        }

        // ------------------------------------------------------------ objets <-> arbre
        /// <summary>Objet C# (champs publics) vers arbre JSON.</summary>
        public static object ToTree(object o)
        {
            if (o == null || o is string || o is bool || o is double || o is int || o is long || o is float) return o;
            if (o is IDictionary dict)
            {
                var d = new Dictionary<string, object>();
                foreach (DictionaryEntry kv in dict) d[kv.Key.ToString()] = ToTree(kv.Value);
                return d;
            }
            if (o is IEnumerable en)
            {
                var l = new List<object>();
                foreach (var x in en) l.Add(ToTree(x));
                return l;
            }
            var res = new Dictionary<string, object>();
            foreach (var f in o.GetType().GetFields(BindingFlags.Public | BindingFlags.Instance))
            {
                if (f.IsDefined(typeof(NonSerializedAttribute), false)) continue;
                res[f.Name] = ToTree(f.GetValue(o));
            }
            return res;
        }

        /// <summary>Arbre JSON vers objet du type demandé (champs absents = valeur par défaut du type).</summary>
        public static object FromTree(object tree, Type t)
        {
            if (tree == null) return t.IsValueType ? Activator.CreateInstance(t) : null;
            if (t == typeof(string)) return tree as string ?? tree.ToString();
            if (t == typeof(double)) return ToD(tree);
            if (t == typeof(float)) return (float)ToD(tree);
            if (t == typeof(int)) return (int)ToD(tree);
            if (t == typeof(long)) return (long)ToD(tree);
            if (t == typeof(bool)) return tree is bool b ? b : ToD(tree) != 0;
            if (t == typeof(object)) return tree;
            if (t.IsGenericType && t.GetGenericTypeDefinition() == typeof(List<>))
            {
                var et = t.GetGenericArguments()[0];
                var list = (IList)Activator.CreateInstance(t);
                if (tree is List<object> src) foreach (var x in src) list.Add(FromTree(x, et));
                return list;
            }
            if (t.IsGenericType && t.GetGenericTypeDefinition() == typeof(Dictionary<,>))
            {
                var vt = t.GetGenericArguments()[1];
                var dict = (IDictionary)Activator.CreateInstance(t);
                if (tree is Dictionary<string, object> src) foreach (var kv in src) dict[kv.Key] = FromTree(kv.Value, vt);
                return dict;
            }
            var obj = Activator.CreateInstance(t);
            if (tree is Dictionary<string, object> map)
            {
                foreach (var f in t.GetFields(BindingFlags.Public | BindingFlags.Instance))
                {
                    if (f.IsDefined(typeof(NonSerializedAttribute), false) || !map.TryGetValue(f.Name, out var v)) continue;
                    try { f.SetValue(obj, FromTree(v, f.FieldType)); }
                    catch (Exception) { /* champ corrompu : on garde la valeur par défaut */ }
                }
            }
            return obj;
        }

        public static T Deserialize<T>(string json) => (T)FromTree(Parse(json), typeof(T));
        public static string Serialize(object o) => Write(ToTree(o));

        // ------------------------------------------------------------ accès pratiques
        public static double ToD(object o)
        {
            switch (o)
            {
                case double d: return d;
                case int i: return i;
                case long l: return l;
                case float f: return f;
                case bool b: return b ? 1 : 0;
                case string s: return double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var r) ? r : 0;
                default: return 0;
            }
        }

        public static double D(this Dictionary<string, object> m, string k, double def = 0) =>
            m != null && m.TryGetValue(k, out var v) && v != null ? ToD(v) : def;
        public static int I(this Dictionary<string, object> m, string k, int def = 0) => (int)m.D(k, def);
        public static string S(this Dictionary<string, object> m, string k, string def = "") =>
            m != null && m.TryGetValue(k, out var v) && v != null ? v.ToString() : def;
        public static bool B(this Dictionary<string, object> m, string k, bool def = false) =>
            m != null && m.TryGetValue(k, out var v) && v != null ? (v is bool b ? b : ToD(v) != 0) : def;
        public static Dictionary<string, object> O(this Dictionary<string, object> m, string k) =>
            m != null && m.TryGetValue(k, out var v) ? v as Dictionary<string, object> : null;
        public static List<object> L(this Dictionary<string, object> m, string k) =>
            m != null && m.TryGetValue(k, out var v) && v is List<object> l ? l : new List<object>();
        public static IEnumerable<Dictionary<string, object>> Objs(this Dictionary<string, object> m, string k)
        {
            foreach (var x in m.L(k)) if (x is Dictionary<string, object> d) yield return d;
        }
    }
}
