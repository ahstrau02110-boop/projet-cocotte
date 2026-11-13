// Services Unity : sprites, sons synthétisés, sauvegarde, boutique simulée, petites animations
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using PantyClicker.Core;
using UnityEngine;

namespace PantyClicker
{
    // ================================================================ sprites
    public static class Sprites
    {
        static readonly Dictionary<string, Sprite> Cache = new Dictionary<string, Sprite>();

        /// <summary>Charge Resources/Sprites/{path}.png (importé en Sprite ou en Texture).</summary>
        public static Sprite Get(string path)
        {
            if (Cache.TryGetValue(path, out var s)) return s;
            s = Resources.Load<Sprite>("Sprites/" + path);
            if (s == null)
            {
                var tex = Resources.Load<Texture2D>("Sprites/" + path);
                if (tex != null) s = Sprite.Create(tex, new Rect(0, 0, tex.width, tex.height), new Vector2(.5f, .5f), 100);
            }
            Cache[path] = s;
            return s;
        }

        public static Sprite Skin(string id) => Get("skins/" + id) ?? Get("skins/classique");
        public static Sprite Building(string id) => Get("buildings/" + id);
        public static Sprite Deco(string id) => Get("decos/" + id);
        public static Sprite Ground(string id) => Get("grounds/" + id);
        public static Sprite Icon(string id) => Get("icons/" + id);
        public static Sprite Era(int n) => Get("eras/era" + Mathf.Clamp(n, 1, 5));
        public static Sprite Decor(string id) => Get("decors/" + id);
    }

    // ================================================================ sons (synthèse, aucun fichier audio)
    public static class Sfx
    {
        static AudioSource src, music;
        static readonly Dictionary<string, AudioClip> Clips = new Dictionary<string, AudioClip>();
        public static GameState.Settings Settings;
        const int Rate = 22050;

        public static void Init(GameObject host, GameState.Settings settings)
        {
            Settings = settings;
            src = host.AddComponent<AudioSource>();
            src.playOnAwake = false;
            music = host.AddComponent<AudioSource>();
            music.loop = true;
            music.playOnAwake = false;
            Clips["tap"] = Tone(new[] { 880f }, .05f, .25f, 1);
            Clips["pop"] = Sweep(520, 980, .09f, .35f);
            Clips["buy"] = Tone(new[] { 660f, 990f }, .07f, .3f, 1);
            Clips["coin"] = Tone(new[] { 1320f, 1760f }, .06f, .25f, 1);
            Clips["deny"] = Tone(new[] { 220f, 180f }, .09f, .3f, 2);
            Clips["gacha"] = Tone(new[] { 523f, 659f, 784f, 1047f }, .08f, .3f, 1);
            Clips["rare"] = Tone(new[] { 784f, 988f, 1175f, 1568f, 1976f }, .07f, .3f, 1);
            Clips["golden"] = Tone(new[] { 1568f, 1976f, 2349f }, .12f, .25f, 0);
            Clips["win"] = Tone(new[] { 523f, 659f, 784f, 659f, 784f, 1047f }, .09f, .3f, 1);
            music.clip = Music();
            ApplySettings();
        }

        public static void ApplySettings()
        {
            if (music == null || Settings == null) return;
            music.volume = Settings.musicVol;
            if (Settings.music && !music.isPlaying) music.Play();
            if (!Settings.music && music.isPlaying) music.Stop();
        }

        public static void Play(string id, float pitch = 1)
        {
            if (src == null || Settings == null || !Settings.sound || !Clips.TryGetValue(id, out var c)) return;
            src.pitch = pitch;
            src.PlayOneShot(c, Settings.sfxVol);
        }

        // wave : 0 sinus, 1 triangle, 2 carré doux
        static float Wave(int wave, float ph)
        {
            float s = Mathf.Sin(ph);
            if (wave == 1) return 2 / Mathf.PI * Mathf.Asin(s);
            if (wave == 2) return Mathf.Sign(s) * .5f;
            return s;
        }

        static AudioClip Tone(float[] notes, float noteLen, float vol, int wave)
        {
            int per = (int)(noteLen * Rate), n = per * notes.Length + Rate / 10;
            var data = new float[n];
            for (int k = 0; k < notes.Length; k++)
                for (int i = 0; i < per + Rate / 10 && k * per + i < n; i++)
                {
                    float t = i / (float)Rate, env = Mathf.Exp(-t * 18) * Mathf.Clamp01(t * 400);
                    data[k * per + i] += Wave(wave, 2 * Mathf.PI * notes[k] * t) * env * vol;
                }
            var c = AudioClip.Create("tone", n, 1, Rate, false);
            c.SetData(data, 0);
            return c;
        }

        static AudioClip Sweep(float f0, float f1, float len, float vol)
        {
            int n = (int)(len * Rate);
            var data = new float[n];
            float ph = 0;
            for (int i = 0; i < n; i++)
            {
                float t = i / (float)n;
                ph += 2 * Mathf.PI * Mathf.Lerp(f0, f1, t) / Rate;
                data[i] = Mathf.Sin(ph) * (1 - t) * vol;
            }
            var c = AudioClip.Create("sweep", n, 1, Rate, false);
            c.SetData(data, 0);
            return c;
        }

        // Petite boucle « lofi kawaii » générée : accords + mélodie pentatonique + tic-tac doux
        static AudioClip Music()
        {
            float bpm = 92, beat = 60f / bpm;
            int bars = 8, n = (int)(bars * 4 * beat * Rate);
            var data = new float[n];
            float[][] chords = { new[] { 261.6f, 329.6f, 392f, 493.9f }, new[] { 220f, 261.6f, 329.6f, 392f }, new[] { 174.6f, 220f, 261.6f, 329.6f }, new[] { 196f, 246.9f, 293.7f, 349.2f } };
            float[] penta = { 523.3f, 587.3f, 659.3f, 784f, 880f, 1046.5f };
            var rnd = new System.Random(7);
            for (int bar = 0; bar < bars; bar++)
            {
                var ch = chords[bar % 4];
                int b0 = (int)(bar * 4 * beat * Rate), len = (int)(4 * beat * Rate);
                for (int i = 0; i < len && b0 + i < n; i++)
                {
                    float t = i / (float)Rate, env = Mathf.Min(1, t * 6) * Mathf.Exp(-t * .5f);
                    float v = 0;
                    foreach (var f in ch) v += Wave(1, 2 * Mathf.PI * f * t) * .035f;
                    data[b0 + i] += v * env;
                }
                for (int step = 0; step < 8; step++)
                {
                    if (rnd.NextDouble() < .35) continue;
                    float f = penta[rnd.Next(penta.Length)];
                    int s0 = b0 + (int)(step * beat / 2 * Rate);
                    for (int i = 0; i < beat * Rate * .9f && s0 + i < n; i++)
                    {
                        float t = i / (float)Rate;
                        data[s0 + i] += Mathf.Sin(2 * Mathf.PI * f * t) * Mathf.Exp(-t * 6) * Mathf.Clamp01(t * 300) * .05f;
                    }
                }
                for (int k = 0; k < 4; k++)
                {
                    int s0 = b0 + (int)(k * beat * Rate);
                    for (int i = 0; i < Rate / 8 && s0 + i < n; i++)
                    {
                        float t = i / (float)Rate;
                        data[s0 + i] += Mathf.Sin(2 * Mathf.PI * (90 - t * 200) * t) * Mathf.Exp(-t * 30) * .12f;
                    }
                }
            }
            var c = AudioClip.Create("music", n, 1, Rate, false);
            c.SetData(data, 0);
            return c;
        }
    }

    // ================================================================ sauvegarde
    public static class SaveSystem
    {
        static string Path => System.IO.Path.Combine(Application.persistentDataPath, "panty-save.json");

        public static GameState Load()
        {
            foreach (var p in new[] { Path, Path + ".bak" })
            {
                try
                {
                    if (File.Exists(p)) return Json.Deserialize<GameState>(File.ReadAllText(p));
                }
                catch (Exception e) { Debug.LogWarning("Sauvegarde illisible (" + p + ") : " + e.Message); }
            }
            return null;
        }

        public static void Save(Game g)
        {
            try
            {
                g.S.lastSave = g.Now;
                string json = Json.Serialize(g.S), tmp = Path + ".tmp";
                File.WriteAllText(tmp, json);
                if (File.Exists(Path)) File.Copy(Path, Path + ".bak", true);
                File.Copy(tmp, Path, true);
                File.Delete(tmp);
            }
            catch (Exception e) { Debug.LogError("Sauvegarde impossible : " + e.Message); }
        }

        public static string Export(Game g) => Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(Json.Serialize(g.S)));

        public static GameState Import(string code)
        {
            try { return Json.Deserialize<GameState>(System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(code.Trim()))); }
            catch (Exception) { return null; }
        }

        public static void Delete()
        {
            foreach (var p in new[] { Path, Path + ".bak" }) if (File.Exists(p)) File.Delete(p);
        }
    }

    // ================================================================ boutique simulée
    /// <summary>
    /// Achats réels simulés : acceptés dans l'éditeur et les builds de développement, refusés sinon.
    /// Pour publier : remplacer par une implémentation Unity IAP (com.unity.purchasing) de IStore.
    /// </summary>
    public class SimulatedStore : IStore
    {
        public void Purchase(ShopItemDef item, Action<bool> done)
        {
            bool ok = Application.isEditor || Debug.isDebugBuild;
            if (!ok) Debug.LogWarning("Achat réel non branché : " + item.id);
            done(ok);
        }
    }

    // ================================================================ animations
    public class Anim : MonoBehaviour
    {
        static Anim inst;
        static Anim I
        {
            get
            {
                if (inst == null) inst = new GameObject("Anim").AddComponent<Anim>();
                return inst;
            }
        }

        public static void Run(IEnumerator co) => I.StartCoroutine(co);

        /// <summary>Petit rebond d'échelle.</summary>
        public static void Punch(Transform t, float amount = .12f, float dur = .18f) => Run(PunchCo(t, amount, dur));

        static IEnumerator PunchCo(Transform t, float amount, float dur)
        {
            float e = 0;
            while (e < dur && t != null)
            {
                e += Time.unscaledDeltaTime;
                float k = e / dur, s = 1 + Mathf.Sin(k * Mathf.PI) * amount;
                t.localScale = new Vector3(s + amount * .3f * Mathf.Sin(k * Mathf.PI), s - amount * .3f * Mathf.Sin(k * Mathf.PI), 1);
                yield return null;
            }
            if (t != null) t.localScale = Vector3.one;
        }

        /// <summary>Monte et s'efface, puis détruit l'objet.</summary>
        public static void FloatUp(RectTransform r, float dist = 160, float dur = 1f) => Run(FloatCo(r, dist, dur));

        static IEnumerator FloatCo(RectTransform r, float dist, float dur)
        {
            var g = r.GetComponentsInChildren<UnityEngine.UI.Graphic>();
            var start = r.anchoredPosition;
            float e = 0, drift = UnityEngine.Random.Range(-30f, 30f);
            while (e < dur && r != null)
            {
                e += Time.unscaledDeltaTime;
                float k = e / dur;
                r.anchoredPosition = start + new Vector2(drift * k, dist * (1 - (1 - k) * (1 - k)));
                foreach (var x in g) { var c = x.color; c.a = 1 - k * k; x.color = c; }
                yield return null;
            }
            if (r != null) Destroy(r.gameObject);
        }

        /// <summary>Apparition « pop » (échelle 0 -> 1).</summary>
        public static void PopIn(Transform t, float delay = 0, float dur = .25f) => Run(PopCo(t, delay, dur));

        static IEnumerator PopCo(Transform t, float delay, float dur)
        {
            if (t == null) yield break;
            t.localScale = Vector3.zero;
            float w = 0;
            while (w < delay) { w += Time.unscaledDeltaTime; yield return null; }
            float e = 0;
            while (e < dur && t != null)
            {
                e += Time.unscaledDeltaTime;
                float k = e / dur, s = 1 + Mathf.Sin(k * Mathf.PI) * .25f * (1 - k);
                t.localScale = Vector3.one * Mathf.Min(1, k * 1.4f) * s;
                yield return null;
            }
            if (t != null) t.localScale = Vector3.one;
        }
    }

    /// <summary>Flottement doux permanent (respiration chibi).</summary>
    public class Bob : MonoBehaviour
    {
        public float amp = 10, speed = 2;
        RectTransform rt; Vector2 basePos; float seed;
        void Start() { rt = (RectTransform)transform; basePos = rt.anchoredPosition; seed = UnityEngine.Random.value * 10; }
        void Update() { if (rt != null) rt.anchoredPosition = basePos + new Vector2(0, Mathf.Sin((Time.unscaledTime + seed) * speed) * amp); }
    }

    /// <summary>Pulsation d'échelle permanente (éléments à ne pas rater).</summary>
    public class Pulse : MonoBehaviour
    {
        public float amp = .06f, speed = 5;
        void Update() { transform.localScale = Vector3.one * (1 + Mathf.Sin(Time.unscaledTime * speed) * amp); }
    }

    /// <summary>Rotation lente (rayons derrière les objets rares).</summary>
    public class Spin : MonoBehaviour
    {
        public float speed = 30;
        void Update() { transform.Rotate(0, 0, speed * Time.unscaledDeltaTime); }
    }
}
