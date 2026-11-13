// Mini-jeux : Paires de Pantsu (mémoire), Attrape-Pantsu (réflexes), Pop les bulles (rapidité)
using System;
using System.Collections.Generic;
using System.Linq;
using PantyClicker.Core;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace PantyClicker.UI
{
    public static class MiniGames
    {
        static readonly (string id, string name, string desc, string icon)[] List =
        {
            ("memory", "Paires de Pantsu", "Retrouve les 8 paires le plus vite possible.", "neko"),
            ("catcher", "Attrape-Pantsu", "Fais glisser le panier : attrape les Pantsu, évite les bugs 404 !", "usagi"),
            ("bubbles", "Pop les bulles", "Éclate les bulles avant qu'elles ne s'envolent.", "slime"),
        };

        public static void Hub(MainUI ui)
        {
            var G = ui.G;
            var m = ui.Modal("Mini-jeux", out var close);
            UIKit.Para(m, $"Chaque étoile rapporte {G.D.Cfg("minigames.coinSecondsPerStar", 10)} s de production et des tissus. Gemmes du jour : {G.S.mini.gemsToday} / {G.D.Cfg("minigames.dailyGemCap", 60)}.", 24, Theme.Ink);
            foreach (var (id, name, desc, icon) in List)
            {
                var card = UIKit.Card(m, Color.white, 14, 4);
                var row = UIKit.HBox(card, 12, 0, TextAnchor.MiddleLeft); row.Size(-1, 140);
                UIKit.Img(row, Sprites.Skin(icon)).Size(130, 130);
                G.S.mini.best.TryGetValue(id, out var best);
                UIKit.Label(row, $"<b>{name}</b>\n<size=22>{desc}\nRecord : {best}</size>", 28, Theme.Ink, TextAnchor.MiddleLeft).Size(-1, 140, 1);
                string gid = id;
                UIKit.Btn(row, "Jouer", () => { close(); Start(ui, gid); }, Theme.Pink, 30).Size(170, 96);
            }
        }

        static void Start(MainUI ui, string id)
        {
            var root = UIKit.Img(ui.Overlay, null, Theme.PinkPale, false, "MiniGame");
            root.preserveAspect = false;
            root.raycastTarget = true;
            root.rectTransform.Fill();
            MiniGame g;
            switch (id)
            {
                case "memory": g = root.gameObject.AddComponent<MemoryGame>(); break;
                case "catcher": g = root.gameObject.AddComponent<CatcherGame>(); break;
                default: g = root.gameObject.AddComponent<BubbleGame>(); break;
            }
            g.Setup(ui, id);
        }
    }

    /// <summary>Base commune : en-tête (score, temps), fin de partie et récompenses.</summary>
    public abstract class MiniGame : MonoBehaviour
    {
        protected MainUI ui;
        protected RectTransform area;
        protected Text hud;
        protected float time;
        protected int score;
        protected bool over;
        string id;

        public void Setup(MainUI owner, string gameId)
        {
            ui = owner; id = gameId;
            var rt = (RectTransform)transform;
            hud = UIKit.Label(rt, "", 40, Theme.Ink);
            hud.rectTransform.At(new Vector2(.5f, 1), new Vector2(0, -30), new Vector2(1000, 70));
            var quit = UIKit.Btn(rt, "Quitter", () => End(true), Theme.Disabled, 28, Theme.Ink);
            ((RectTransform)quit.transform).At(new Vector2(1, 1), new Vector2(-20, -110), new Vector2(200, 76));
            area = UIKit.Rect("Area", rt).Fill(20, 200, 20, 40);
            Begin();
        }

        protected abstract void Begin();
        /// <summary>Étoiles (0 à 3) selon le score.</summary>
        protected abstract int Stars();

        protected void End(bool quit = false)
        {
            if (over) return;
            over = true;
            if (quit) { Destroy(gameObject); return; }   // abandon : pas de récompense ni de partie comptée
            int stars = Stars();
            string res = ui.G.MiniGameResult(id, stars, score);
            Sfx.Play(stars > 0 ? "win" : "deny");
            var m = ui.Modal("Fin de partie !", out var close);
            UIKit.Label(m, new string('*', stars) + new string('-', 3 - stars), 80, Theme.Gold).Size(-1, 110);
            UIKit.Para(m, $"Score : {score}\n{res}", 30, Theme.Ink).alignment = TextAnchor.MiddleCenter;
            UIKit.Btn(m, "Continuer", () => { close(); Destroy(gameObject); }).Size(-1, 100);
        }

        protected Image Spawn(Sprite s, Vector2 pos, float size)
        {
            var img = UIKit.Img(area, s);
            img.rectTransform.At(new Vector2(.5f, .5f), pos, new Vector2(size, size));
            return img;
        }

        protected List<string> SkinPool() => ui.G.D.skins.Where(s => s.id != "doree" && s.id != "glitch").Select(s => s.id).ToList();
    }

    // ================================================================ Paires
    public class MemoryGame : MiniGame
    {
        readonly List<(Image back, Image face, string id)> cards = new List<(Image, Image, string)>();
        int first = -1, second = -1, found, moves;
        float flipBack;

        protected override void Begin()
        {
            var pool = SkinPool().OrderBy(_ => UnityEngine.Random.value).Take(8).ToList();
            var deck = pool.Concat(pool).OrderBy(_ => UnityEngine.Random.value).ToList();
            float cell = 230, gap = 16;
            for (int i = 0; i < 16; i++)
            {
                int x = i % 4, y = i / 4, idx = i;
                var pos = new Vector2((x - 1.5f) * (cell + gap), (1.5f - y) * (cell + gap));
                var back = UIKit.Panel(area, Theme.Pink, "Card");
                back.raycastTarget = true;
                back.rectTransform.At(new Vector2(.5f, .5f), pos, new Vector2(cell, cell));
                UIKit.Img(back.transform, Sprites.Icon("rubans"), new Color(1, 1, 1, .6f)).rectTransform.Fill(50, 50, 50, 50);
                var face = UIKit.Img(back.transform, Sprites.Skin(deck[i]));
                face.rectTransform.Fill(10, 10, 10, 10);
                face.enabled = false;
                var b = back.gameObject.AddComponent<Button>();
                b.onClick.AddListener(() => Flip(idx));
                cards.Add((back, face, deck[i]));
            }
        }

        void Flip(int i)
        {
            if (over || flipBack > 0 || cards[i].face.enabled) return;
            Sfx.Play("pop");
            cards[i].face.enabled = true;
            cards[i].back.color = Color.white;
            Anim.Punch(cards[i].back.transform, .1f);
            if (first < 0) { first = i; return; }
            second = i; moves++;
            if (cards[first].id == cards[second].id)
            {
                found++; score += 100; Sfx.Play("coin");
                first = second = -1;
                if (found == 8) { score += Mathf.Max(0, 600 - (int)time * 5); End(); }
            }
            else flipBack = .8f;
        }

        void Update()
        {
            if (over) return;
            time += Time.unscaledDeltaTime;
            hud.text = $"Paires {found}/8 · coups {moves} · {time:0} s";
            if (flipBack > 0)
            {
                flipBack -= Time.unscaledDeltaTime;
                if (flipBack <= 0)
                {
                    foreach (var k in new[] { first, second }) { cards[k].face.enabled = false; cards[k].back.color = Theme.Pink; }
                    first = second = -1;
                }
            }
            if (time > 120) End();
        }

        protected override int Stars() => found < 8 ? 0 : moves <= 14 ? 3 : moves <= 20 ? 2 : 1;
    }

    // ================================================================ Attrape-Pantsu
    public class CatcherGame : MiniGame, IDragHandler, IPointerDownHandler
    {
        RectTransform basket;
        readonly List<(RectTransform r, bool bad, float speed)> falling = new List<(RectTransform, bool, float)>();
        float spawn, duration = 40;
        List<string> pool;

        protected override void Begin()
        {
            pool = SkinPool();
            basket = Spawn(Sprites.Building("laverie"), new Vector2(0, -620), 220).rectTransform;
        }

        public void OnPointerDown(PointerEventData e) => MoveTo(e);
        public void OnDrag(PointerEventData e) => MoveTo(e);

        void MoveTo(PointerEventData e)
        {
            RectTransformUtility.ScreenPointToLocalPointInRectangle(area, e.position, e.pressEventCamera, out var p);
            basket.anchoredPosition = new Vector2(Mathf.Clamp(p.x, -440, 440), basket.anchoredPosition.y);
        }

        void Update()
        {
            if (over) return;
            float dt = Time.unscaledDeltaTime;
            time += dt;
            hud.text = $"Attrapées : {score} · {Mathf.Max(0, duration - time):0} s";
            spawn -= dt;
            if (spawn <= 0)
            {
                spawn = Mathf.Lerp(.75f, .35f, time / duration);
                bool bad = UnityEngine.Random.value < .2f;
                var img = Spawn(Sprites.Skin(bad ? "glitch" : pool[UnityEngine.Random.Range(0, pool.Count)]), new Vector2(UnityEngine.Random.Range(-440f, 440f), 760), 140);
                falling.Add((img.rectTransform, bad, UnityEngine.Random.Range(380f, 560f) + time * 8));
            }
            for (int i = falling.Count - 1; i >= 0; i--)
            {
                var (r, bad, sp) = falling[i];
                r.anchoredPosition += new Vector2(0, -sp * dt);
                r.localEulerAngles = new Vector3(0, 0, Mathf.Sin(time * 4 + i) * 15);
                var d = r.anchoredPosition - basket.anchoredPosition;
                if (Mathf.Abs(d.x) < 130 && Mathf.Abs(d.y) < 90)
                {
                    if (bad) { score = Mathf.Max(0, score - 3); Sfx.Play("deny"); } else { score++; Sfx.Play("pop", 1 + score * .01f); }
                    Anim.Punch(basket, .12f);
                    Destroy(r.gameObject); falling.RemoveAt(i);
                }
                else if (r.anchoredPosition.y < -800) { Destroy(r.gameObject); falling.RemoveAt(i); }
            }
            if (time >= duration) End();
        }

        protected override int Stars() => score >= 45 ? 3 : score >= 30 ? 2 : score >= 15 ? 1 : 0;
    }

    // ================================================================ Bulles
    public class BubbleGame : MiniGame
    {
        readonly List<(RectTransform r, float life)> bubbles = new List<(RectTransform, float)>();
        float spawn, duration = 30;
        List<string> pool;

        protected override void Begin() { pool = SkinPool(); }

        void Update()
        {
            if (over) return;
            float dt = Time.unscaledDeltaTime;
            time += dt;
            hud.text = $"Bulles : {score} · {Mathf.Max(0, duration - time):0} s";
            spawn -= dt;
            if (spawn <= 0)
            {
                spawn = Mathf.Lerp(.6f, .3f, time / duration);
                var bub = UIKit.Img(area, UIKit.Circle, new Color(.75f, .93f, 1f, .55f), false, "Bubble");
                bub.raycastTarget = true;
                var r = bub.rectTransform;
                r.At(new Vector2(.5f, .5f), new Vector2(UnityEngine.Random.Range(-420f, 420f), UnityEngine.Random.Range(-650f, 500f)), Vector2.one * UnityEngine.Random.Range(150f, 210f));
                UIKit.Img(r, Sprites.Skin(pool[UnityEngine.Random.Range(0, pool.Count)])).rectTransform.Fill(18, 18, 18, 18);
                var shine = UIKit.Img(r, UIKit.Circle, new Color(1, 1, 1, .8f));
                shine.rectTransform.At(new Vector2(.25f, .75f), Vector2.zero, new Vector2(30, 30));
                var b = bub.gameObject.AddComponent<Button>();
                b.transition = Selectable.Transition.None;
                b.onClick.AddListener(() => Pop(r));
                bubbles.Add((r, UnityEngine.Random.Range(1.4f, 2.2f) - time / duration * .6f));
                Anim.PopIn(r);
            }
            for (int i = bubbles.Count - 1; i >= 0; i--)
            {
                var (r, life) = bubbles[i];
                if (r == null) { bubbles.RemoveAt(i); continue; }
                life -= dt;
                r.anchoredPosition += new Vector2(Mathf.Sin(time * 3 + i) * 30 * dt, 60 * dt);
                bubbles[i] = (r, life);
                if (life <= 0) { Destroy(r.gameObject); bubbles.RemoveAt(i); }
            }
            if (time >= duration) End();
        }

        void Pop(RectTransform r)
        {
            if (over || r == null) return;
            score++;
            Sfx.Play("pop", 1.2f);
            ui.Burst(r.anchoredPosition, 3, area);
            Destroy(r.gameObject);
        }

        protected override int Stars() => score >= 50 ? 3 : score >= 35 ? 2 : score >= 20 ? 1 : 0;
    }
}
