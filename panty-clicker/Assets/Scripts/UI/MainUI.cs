// Interface principale : barre du haut (monnaies + bandeau FOMO), pages, onglets, toasts, fenêtres, Pantsu dorée
using System;
using System.Collections.Generic;
using System.Linq;
using PantyClicker.Core;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace PantyClicker.UI
{
    public abstract class Page
    {
        public RectTransform Root;
        protected MainUI ui;
        protected Game G => ui.G;
        public void Init(MainUI owner, RectTransform root) { ui = owner; Root = root; Build(); }
        protected abstract void Build();
        /// <summary>Mise à jour des textes (appelée 5 fois par seconde quand la page est visible).</summary>
        public virtual void Refresh() { }
        /// <summary>Reconstruction complète (changement d'onglet, Grand Lavage…).</summary>
        public virtual void Rebuild() { UIKit.Clear(Root); Build(); }
    }

    public class MainUI : MonoBehaviour
    {
        public GameRunner Runner;
        public Game G => Runner.G;
        public RectTransform Canvas, PageArea, Overlay;
        Image background;
        Text coinsTxt, cpsTxt, gemsTxt, ticketsTxt, heartsTxt, tickerTxt;
        Action tickerAction;
        readonly List<(string text, Action go)> ticker = new List<(string, Action)>();
        int tickerIndex; float tickerTimer, refreshTimer;
        public readonly Dictionary<string, Page> Pages = new Dictionary<string, Page>();
        readonly Dictionary<string, (Image bg, GameObject dot)> tabs = new Dictionary<string, (Image, GameObject)>();
        public string Current = "";
        readonly Queue<string> toasts = new Queue<string>();
        float toastTimer;
        RectTransform toastBox;
        int modalCount;

        static readonly (string id, string label, string icon)[] TabDefs =
        {
            ("clic", "Clic", "skins/classique"), ("ville", "Ville", "buildings/couturiere"), ("capsules", "Capsules", "icons/capsule"),
            ("boutique", "Boutique", "icons/cadeau"), ("quetes", "Quêtes", "icons/trophee"), ("plus", "Plus", "icons/paillettes")
        };

        public static MainUI Build(GameRunner runner)
        {
            UIKit.Init();
            EnsureEventSystem();
            var go = new GameObject("UI", typeof(RectTransform));
            var canvas = go.AddComponent<UnityEngine.Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 10;
            var scaler = go.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1080, 1920);
            scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            scaler.matchWidthOrHeight = .5f;
            go.AddComponent<GraphicRaycaster>();
            var ui = go.AddComponent<MainUI>();
            ui.Runner = runner;
            ui.Canvas = (RectTransform)go.transform;
            ui.Layout();
            return ui;
        }

        static void EnsureEventSystem()
        {
            if (EventSystem.current != null) return;
            var es = new GameObject("EventSystem", typeof(EventSystem));
            // Nouveau système d'entrée si le paquet est présent, sinon module classique
            var t = Type.GetType("UnityEngine.InputSystem.UI.InputSystemUIInputModule, Unity.InputSystem");
            if (t != null) es.AddComponent(t);
            else es.AddComponent<StandaloneInputModule>();
        }

        // ------------------------------------------------------------ construction
        void Layout()
        {
            var safe = UIKit.Rect("Safe", Canvas).Fill();
            safe.gameObject.AddComponent<SafeArea>();

            background = UIKit.Img(safe, null, Color.white, false, "Background");
            background.preserveAspect = false;
            background.rectTransform.Fill();
            var bgFit = background.gameObject.AddComponent<AspectRatioFitter>();
            bgFit.aspectMode = AspectRatioFitter.AspectMode.EnvelopeParent;
            bgFit.aspectRatio = 9f / 16f;

            // Barre du haut
            var top = UIKit.Panel(safe, new Color(1, 1, 1, .92f), "Top").rectTransform;
            top.At(new Vector2(.5f, 1), new Vector2(0, -8), new Vector2(1060, 200));
            var row = UIKit.HBox(top, 10, 0, TextAnchor.MiddleLeft);
            row.At(new Vector2(.5f, 1), new Vector2(0, -12), new Vector2(1020, 110));
            var coinBox = Currency(row, "rubans", out coinsTxt, 420, 50);
            cpsTxt = UIKit.Label(coinBox, "", 24, Theme.InkSoft, TextAnchor.LowerLeft);
            cpsTxt.rectTransform.Fill(96, 70, 0, -6);
            Currency(row, "gemmes", out gemsTxt, 200, 38, () => ShowTab("boutique"));
            Currency(row, "capsule", out ticketsTxt, 150, 38, () => ShowTab("capsules"));
            Currency(row, "coeurs", out heartsTxt, 200, 38, () => ShowTab("ville"));

            var tick = UIKit.Panel(top, Theme.PinkSoft, "Ticker").rectTransform;
            tick.At(new Vector2(.5f, 0), new Vector2(0, 10), new Vector2(1020, 64));
            tickerTxt = UIKit.Label(tick, "", 28, Theme.Ink);
            tickerTxt.rectTransform.Fill(16, 0, 16, 0);
            UIKit.Hit(tick, () => tickerAction?.Invoke());
            tick.gameObject.AddComponent<Pulse>().amp = .01f;

            // Pages
            PageArea = UIKit.Rect("Pages", safe).Fill(0, 216, 0, 176);
            Add("clic", new ClickPage());
            Add("ville", new CityPage());
            Add("capsules", new GachaPage());
            Add("boutique", new ShopPage());
            Add("quetes", new QuestPage());
            Add("plus", new MorePage());

            // Onglets
            var bar = UIKit.Panel(safe, Color.white, "Tabs").rectTransform;
            bar.At(new Vector2(.5f, 0), new Vector2(0, 0), new Vector2(1080, 176));
            var tabsRow = UIKit.HBox(bar, 4, 8, TextAnchor.MiddleCenter);
            tabsRow.Fill(6, 6, 6, 6);
            tabsRow.GetComponent<HorizontalLayoutGroup>().childForceExpandWidth = true;
            foreach (var (id, label, icon) in TabDefs)
            {
                var tb = UIKit.Btn(tabsRow, "", () => ShowTab(id), Theme.PinkPale);
                var img = tb.GetComponent<Image>();
                tb.Size(-1, 160, 1);
                var ic = UIKit.Img(tb.transform, Sprites.Get(icon));
                ic.rectTransform.At(new Vector2(.5f, 1), new Vector2(0, -10), new Vector2(96, 96));
                var lb = UIKit.Label(tb.transform, label, 26, Theme.Ink);
                lb.rectTransform.At(new Vector2(.5f, 0), new Vector2(0, 6), new Vector2(170, 40));
                var dot = UIKit.Img(tb.transform, UIKit.Circle, Theme.Pink, false, "Dot");
                dot.rectTransform.At(new Vector2(1, 1), new Vector2(-12, -10), new Vector2(30, 30));
                dot.gameObject.AddComponent<Pulse>().amp = .2f;
                tabs[id] = (img, dot.gameObject);
            }

            Overlay = UIKit.Rect("Overlay", safe).Fill();
            toastBox = UIKit.VBox(Overlay, 8, 0, TextAnchor.UpperCenter, false);
            toastBox.At(new Vector2(.5f, 1), new Vector2(0, -230), new Vector2(980, 400));

            G.Toast += m => toasts.Enqueue(m);
            G.Signal += OnSignal;
            ShowTab("clic");
            RefreshBackground();
            if (!G.S.tuto) Tutorial();
        }

        RectTransform Currency(Transform parent, string icon, out Text txt, float width, int size, Action onClick = null)
        {
            var box = UIKit.Rect("Cur-" + icon, parent);
            box.Size(width, 100);
            var ic = UIKit.Img(box, Sprites.Icon(icon));
            ic.rectTransform.At(new Vector2(0, .5f), new Vector2(0, 0), new Vector2(84, 84));
            txt = UIKit.Label(box, "0", size, Theme.Ink, TextAnchor.MiddleLeft);
            txt.rectTransform.Fill(92, 0, 0, icon == "rubans" ? 20 : 0);
            txt.horizontalOverflow = HorizontalWrapMode.Overflow;
            if (onClick != null) UIKit.Hit(box, onClick);
            return box;
        }

        void Add(string id, Page p)
        {
            var root = UIKit.Rect("Page-" + id, PageArea).Fill();
            p.Init(this, root);
            root.gameObject.SetActive(false);
            Pages[id] = p;
        }

        public void ShowTab(string id)
        {
            if (!Pages.ContainsKey(id)) return;
            foreach (var kv in Pages) kv.Value.Root.gameObject.SetActive(kv.Key == id);
            foreach (var kv in tabs) kv.Value.bg.color = kv.Key == id ? Theme.PinkSoft : Theme.PinkPale;
            if (Current != id) Pages[id].Rebuild();
            Current = id;
            Pages[id].Refresh();
        }

        public void RebuildAll()
        {
            foreach (var p in Pages.Values) p.Rebuild();
            RefreshBackground();
        }

        public void RefreshBackground()
        {
            var s = G.S.bg != "auto" ? Sprites.Decor(G.S.bg) : null;
            background.sprite = s ?? Sprites.Era(G.CurrentEra().id);
        }

        // ------------------------------------------------------------ boucle
        void Update()
        {
            refreshTimer += Time.unscaledDeltaTime;
            if (refreshTimer >= .2f)
            {
                refreshTimer = 0;
                coinsTxt.text = Fmt.Num(G.S.coins);
                cpsTxt.text = Fmt.Num(G.TotalCps()) + " /s";
                gemsTxt.text = Fmt.Num(G.S.gems);
                ticketsTxt.text = Fmt.Num(G.S.tickets);
                heartsTxt.text = Fmt.Num(G.S.city.hearts);
                if (Pages.TryGetValue(Current, out var p)) p.Refresh();
                Badges();
            }
            tickerTimer -= Time.unscaledDeltaTime;
            if (tickerTimer <= 0) { tickerTimer = 4; NextTicker(); }
            toastTimer -= Time.unscaledDeltaTime;
            if (toastTimer <= 0 && toasts.Count > 0) { toastTimer = .6f; ShowToast(toasts.Dequeue()); }
        }

        void Badges()
        {
            bool shop = G.FreeGiftSeconds() <= 0 || G.StarterAvailable && G.S.shop.bought.Count == 0;
            bool quests = G.DailyAvailable;
            bool city = G.StorageFull;
            bool capsules = G.S.tickets > 0 || G.S.gems >= G.PullCost(1);
            bool plus = G.CanPrestige || G.S.orders.list.Any(G.CanDeliver) || G.D.recipes.Any(r => G.CanCraft(r) && r.result.S("type") == "skin");
            tabs["boutique"].dot.SetActive(shop);
            tabs["quetes"].dot.SetActive(quests);
            tabs["ville"].dot.SetActive(city);
            tabs["capsules"].dot.SetActive(capsules);
            tabs["plus"].dot.SetActive(plus);
            tabs["clic"].dot.SetActive(G.AvailableUpgrades().Any(u => u.cost <= G.S.coins));
        }

        // Bandeau FOMO : messages limités dans le temps, en rotation
        void NextTicker()
        {
            ticker.Clear();
            double hh = G.HappyHourSeconds();
            if (G.InHappyHour()) ticker.Add(($"HAPPY HOUR ! Production x{G.D.Cfg("fomo.happyMult", 2)} encore {Fmt.Duration(hh)}", null));
            else if (hh < 3600) ticker.Add(($"Happy Hour dans {Fmt.Duration(hh)} : production x2 !", null));
            if (G.DailyAvailable) ticker.Add(("Ton cadeau du jour t'attend ! Ne casse pas ta série", () => ShowTab("quetes")));
            if (G.StarterAvailable) ticker.Add(($"Pack de bienvenue -80 % : plus que {Fmt.Duration(G.StarterSecondsLeft())}", () => ShowTab("boutique")));
            var flash = G.FlashItem(out var fl, out _);
            if (flash != null && !G.FlashBought) ticker.Add(($"VENTE FLASH -50 % : {flash.name} · {Fmt.Duration(fl)}", () => ShowTab("boutique")));
            foreach (var e in G.ActiveEvents()) ticker.Add(($"{e.name} : fin dans {Fmt.Duration(G.EventSecondsLeft(e))}", () => ShowTab("quetes")));
            var b = G.BannerSkin();
            if (b != null) ticker.Add(($"Vedette capsules : {b.name} · fin dans {Fmt.Duration(G.BannerSecondsLeft())}", () => ShowTab("capsules")));
            if (G.StorageFull) ticker.Add(("Le Coffre de la Ville est plein ! Les Cœurs sont perdus", () => ShowTab("ville")));
            if (G.FreeGiftSeconds() <= 0) ticker.Add(("Cadeau gratuit disponible en Boutique", () => ShowTab("boutique")));
            if (ticker.Count == 0) { tickerTxt.text = G.CurrentEra().tagline; tickerAction = null; return; }
            tickerIndex = (tickerIndex + 1) % ticker.Count;
            tickerTxt.text = ticker[tickerIndex].text;
            tickerAction = ticker[tickerIndex].go;
        }

        // ------------------------------------------------------------ signaux du jeu
        void OnSignal(string type, object data)
        {
            switch (type)
            {
                case "achievement":
                    var a = (AchievementDef)data;
                    toasts.Enqueue($"Succès : {a.name} ({a.desc})");
                    Sfx.Play("win");
                    break;
                case "era":
                    var era = (EraDef)data;
                    RefreshBackground();
                    Sfx.Play("rare");
                    var c = Modal("Nouvelle ère !", out var close);
                    UIKit.Label(c, era.name, 56, Theme.Hex(era.color)).Size(-1, 90);
                    UIKit.Para(c, era.tagline + "\nDe nouveaux bâtiments et décos de Ville sont disponibles.", 30, Theme.Ink).alignment = TextAnchor.MiddleCenter;
                    UIKit.Btn(c, "Trop bien !", close).Size(-1, 100);
                    break;
                case "golden-ready":
                    SpawnGolden();
                    break;
                case "reset":
                    RebuildAll();
                    break;
                case "order":
                    toasts.Enqueue("Nouvelle commande de " + ((OrderSlot)data).client + " (Plus > Commandes)");
                    break;
            }
        }

        // ------------------------------------------------------------ Pantsu dorée
        void SpawnGolden()
        {
            G.GoldenShown();
            var b = UIKit.Btn(Overlay, "", null, new Color(0, 0, 0, 0));
            b.transition = Selectable.Transition.None;
            var rt = (RectTransform)b.transform;
            rt.At(new Vector2(.5f, .5f), new Vector2(UnityEngine.Random.Range(-380f, 380f), UnityEngine.Random.Range(-600f, 500f)), new Vector2(220, 220));
            var glow = UIKit.Img(rt, UIKit.Circle, new Color(1, .9f, .4f, .45f));
            glow.rectTransform.Fill(-30, -30, -30, -30);
            glow.gameObject.AddComponent<Pulse>().amp = .15f;
            UIKit.Img(rt, Sprites.Skin("doree")).rectTransform.Fill();
            rt.gameObject.AddComponent<Pulse>().amp = .08f;
            Anim.PopIn(rt);
            Sfx.Play("golden");
            toasts.Enqueue("Une Pantsu dorée est apparue ! Attrape-la vite !");
            bool caught = false;
            b.onClick.AddListener(() =>
            {
                if (caught) return;
                caught = true;
                Sfx.Play("rare");
                var msg = G.CatchGolden();
                Burst(rt.anchoredPosition, 14);
                Destroy(rt.gameObject);
                toasts.Enqueue(msg);
            });
            Anim.Run(GoldenLife(rt, () => caught));
        }

        System.Collections.IEnumerator GoldenLife(RectTransform rt, Func<bool> caught)
        {
            float life = (float)G.GoldenLife, e = 0;
            var start = rt.anchoredPosition;
            while (e < life && rt != null && !caught())
            {
                e += Time.unscaledDeltaTime;
                rt.anchoredPosition = start + new Vector2(Mathf.Sin(e * 1.3f) * 60, Mathf.Sin(e * 2.1f) * 30);
                yield return null;
            }
            if (!caught()) G.GoldenMissed();
            if (rt != null) Destroy(rt.gameObject);
        }

        /// <summary>Explosion de petits cœurs/étoiles.</summary>
        public void Burst(Vector2 at, int n, Transform parent = null)
        {
            var icons = new[] { "coeurs", "paillettes", "rubans" };
            for (int i = 0; i < n; i++)
            {
                var p = UIKit.Img(parent ?? Overlay, Sprites.Icon(icons[i % icons.Length]));
                p.rectTransform.At(new Vector2(.5f, .5f), at, new Vector2(56, 56));
                Anim.Run(Fly(p.rectTransform, UnityEngine.Random.insideUnitCircle.normalized * UnityEngine.Random.Range(180f, 380f)));
            }
        }

        static System.Collections.IEnumerator Fly(RectTransform r, Vector2 v)
        {
            float e = 0;
            var img = r.GetComponent<Image>();
            while (e < .8f && r != null)
            {
                e += Time.unscaledDeltaTime;
                r.anchoredPosition += (v + new Vector2(0, -600 * e)) * Time.unscaledDeltaTime;
                r.localEulerAngles = new Vector3(0, 0, e * 360);
                var c = img.color; c.a = 1 - e / .8f; img.color = c;
                yield return null;
            }
            if (r != null) Destroy(r.gameObject);
        }

        // ------------------------------------------------------------ toasts et fenêtres
        void ShowToast(string msg)
        {
            var card = UIKit.Panel(toastBox, new Color(.29f, .21f, .31f, .93f), "Toast");
            card.Size(-1, -1);
            var fit = card.gameObject.AddComponent<ContentSizeFitter>();
            fit.verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            var v = card.gameObject.AddComponent<VerticalLayoutGroup>();
            v.padding = new RectOffset(24, 24, 16, 16);
            v.childControlHeight = true; v.childControlWidth = true;
            UIKit.Label(card.transform, msg, 30, Color.white);
            Anim.PopIn(card.transform);
            Destroy(card.gameObject, 3.2f);
            while (toastBox.childCount > 4) DestroyImmediate(toastBox.GetChild(0).gameObject);
        }

        /// <summary>Fenêtre modale ; renvoie le contenu (VBox) et une action de fermeture.</summary>
        public RectTransform Modal(string title, out Action close, bool scroll = false, float height = 1300)
        {
            var dim = UIKit.Img(Overlay, null, Theme.Shade, false, "Modal");
            dim.preserveAspect = false;
            dim.rectTransform.Fill();
            dim.raycastTarget = true;
            var root = dim.gameObject;
            modalCount++;
            Action doClose = () => { if (root != null) { Destroy(root); modalCount--; } };
            close = doClose;
            var card = UIKit.Panel(dim.transform, Theme.PinkPale, "Card").rectTransform;
            card.gameObject.AddComponent<Shadow>().effectDistance = new Vector2(0, -8);
            RectTransform content;
            if (scroll)
            {
                card.At(new Vector2(.5f, .5f), Vector2.zero, new Vector2(980, height));
                var head = UIKit.Label(card, title, 46, Theme.Ink);
                head.rectTransform.At(new Vector2(.5f, 1), new Vector2(0, -20), new Vector2(820, 80));
                var area = UIKit.Rect("Area", card).Fill(10, 110, 10, 10);
                content = UIKit.Scroll(area, out _, 14, 18);
            }
            else
            {
                var v = card.gameObject.AddComponent<VerticalLayoutGroup>();
                v.padding = new RectOffset(36, 36, 30, 36);
                v.spacing = 16;
                v.childControlWidth = true; v.childControlHeight = true; v.childForceExpandHeight = false;
                card.gameObject.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;
                card.anchorMin = card.anchorMax = card.pivot = new Vector2(.5f, .5f);
                card.sizeDelta = new Vector2(940, 0);
                UIKit.Label(card, title, 46, Theme.Ink).Size(-1, 80);
                content = UIKit.VBox(card, 16);
            }
            var x = UIKit.Btn(card, "X", doClose, Theme.Pink, 36);
            var xr = (RectTransform)x.transform;
            x.gameObject.AddComponent<LayoutElement>().ignoreLayout = true;
            xr.At(new Vector2(1, 1), new Vector2(-16, -16), new Vector2(84, 84));
            Anim.PopIn(card, 0, .2f);
            return content;
        }

        public bool ModalOpen => modalCount > 0;

        public void Confirm(string title, string text, string yes, Action onYes)
        {
            var c = Modal(title, out var close);
            UIKit.Para(c, text, 30, Theme.Ink);
            var row = UIKit.HBox(c, 16, 0, TextAnchor.MiddleCenter);
            row.Size(-1, 100);
            UIKit.Btn(row, "Annuler", close, Theme.Disabled, 32, Theme.Ink).Size(300, 96);
            UIKit.Btn(row, yes, () => { close(); onYes(); }).Size(420, 96);
        }

        public void ShowOffline(double sec, double gain)
        {
            var c = Modal("Bon retour !", out var close);
            UIKit.Img(c, Sprites.Skin(G.S.skin)).Size(-1, 260);
            UIKit.Para(c, $"Pendant ton absence ({Fmt.Duration(sec)}), tes couturières ont produit :", 30, Theme.Ink).alignment = TextAnchor.MiddleCenter;
            UIKit.Label(c, "+" + Fmt.Num(gain) + " Rubans", 52, Theme.Pink).Size(-1, 80);
            if (G.StorageFull) UIKit.Para(c, "Le Coffre de la Ville est plein : va vite le vider !", 28, Theme.Pink).alignment = TextAnchor.MiddleCenter;
            UIKit.Btn(c, "Super !", () => { close(); Sfx.Play("coin"); }).Size(-1, 100);
        }

        void Tutorial()
        {
            var c = Modal("Bienvenue à Pantsuville !", out var close);
            UIKit.Img(c, Sprites.Skin("classique")).Size(-1, 260);
            UIKit.Para(c,
                "Tapote la Pantsu pour gagner des Rubans.\n" +
                "Achète des bâtiments : ils produisent tout seuls, même quand tu dors.\n" +
                "Pose-les dans ta Ville, décore-la et vide le Coffre à Cœurs.\n" +
                "Ouvre des capsules pour collectionner des dizaines de Pantsu.\n" +
                "Attrape les Pantsu dorées, et surveille le bandeau : les offres et événements ne durent pas !", 30, Theme.Ink);
            UIKit.Label(c, "+50 Gemmes de bienvenue offertes", 32, Theme.Pink).Size(-1, 50);
            UIKit.Btn(c, "C'est parti !", () => { G.S.tuto = true; close(); }).Size(-1, 100);
        }
    }

    /// <summary>Adapte la zone d'interface à l'encoche des téléphones.</summary>
    public class SafeArea : MonoBehaviour
    {
        Rect last;
        void Update()
        {
            var s = Screen.safeArea;
            if (s == last || Screen.width == 0) return;
            last = s;
            var rt = (RectTransform)transform;
            rt.anchorMin = new Vector2(s.xMin / Screen.width, s.yMin / Screen.height);
            rt.anchorMax = new Vector2(s.xMax / Screen.width, s.yMax / Screen.height);
            rt.offsetMin = rt.offsetMax = Vector2.zero;
        }
    }
}
