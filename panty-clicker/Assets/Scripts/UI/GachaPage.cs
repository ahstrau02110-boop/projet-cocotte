// Page Capsules : machine à capsules (skins / décors), bannière vedette limitée, résultats animés, garde-robe
using System.Collections.Generic;
using System.Linq;
using PantyClicker.Core;
using UnityEngine;
using UnityEngine.UI;

namespace PantyClicker.UI
{
    public class GachaPage : Page
    {
        string kind = "skin";
        Text bannerTxt, pityTxt, eventTxt;
        Button b1, b10;

        protected override void Build()
        {
            var c = UIKit.Scroll(Root, out _, 14, 16);
            var tabs = UIKit.HBox(c, 10, 0, TextAnchor.MiddleCenter); tabs.Size(-1, 90);
            tabs.GetComponent<HorizontalLayoutGroup>().childForceExpandWidth = true;
            UIKit.Btn(tabs, "Pantsu", () => { kind = "skin"; Rebuild(); }, kind == "skin" ? Theme.Pink : Theme.PinkPale, 32, kind == "skin" ? Color.white : Theme.Ink).Size(-1, 84, 1);
            UIKit.Btn(tabs, "Décors", () => { kind = "bg"; Rebuild(); }, kind == "bg" ? Theme.Pink : Theme.PinkPale, 32, kind == "bg" ? Color.white : Theme.Ink).Size(-1, 84, 1);

            // Bannière vedette (FOMO)
            var banner = G.BannerSkin();
            if (kind == "skin" && banner != null)
            {
                var card = UIKit.Card(c, Theme.Hex("#2a1b5e"), 18, 6);
                var row = UIKit.HBox(card, 16, 0, TextAnchor.MiddleLeft); row.Size(-1, 260);
                var holder = UIKit.Rect("Holder", row); holder.Size(250, 250);
                var rays = UIKit.Img(holder, Sprites.Icon("paillettes"), new Color(1, .9f, .5f, .5f)); rays.rectTransform.Fill(-20, -20, -20, -20);
                rays.gameObject.AddComponent<Spin>().speed = 25;
                var img = UIKit.Img(holder, Sprites.Skin(banner.id)); img.rectTransform.Fill();
                img.gameObject.AddComponent<Bob>().amp = 6;
                var col = UIKit.VBox(row, 6, 0, TextAnchor.MiddleLeft, false); col.Size(-1, 250, 1);
                UIKit.Label(col, "VEDETTE LIMITÉE", 26, Theme.Gold, TextAnchor.MiddleLeft).Size(-1, 36);
                UIKit.Label(col, banner.name, 40, Color.white, TextAnchor.MiddleLeft).Size(-1, 56);
                UIKit.Label(col, $"{G.D.Rarity(banner.rarity).label} · {(int)(G.D.Cfg("gacha.bannerRateUp", .5) * 100)} % des tirages {G.D.Rarity(banner.rarity).label.ToLower()}s", 24, Theme.PinkSoft, TextAnchor.MiddleLeft).Size(-1, 60);
                bannerTxt = UIKit.Label(col, "", 28, Theme.Hex("#ffd86b"), TextAnchor.MiddleLeft);
                bannerTxt.Size(-1, 44);
                bannerTxt.gameObject.AddComponent<Pulse>().amp = .03f;
            }

            eventTxt = UIKit.Label(c, "", 28, Theme.Pink, TextAnchor.MiddleCenter);
            eventTxt.Size(-1, 40);

            // Machine
            var machine = UIKit.Card(c, Color.white, 20, 10);
            var mimg = UIKit.Img(machine, Sprites.Deco("capsules")); mimg.Size(-1, 380);
            mimg.gameObject.AddComponent<Bob>().amp = 5;
            pityTxt = UIKit.Label(machine, "", 26, Theme.InkSoft); pityTxt.Size(-1, 70);
            var br = UIKit.HBox(machine, 16, 0, TextAnchor.MiddleCenter); br.Size(-1, 120);
            br.GetComponent<HorizontalLayoutGroup>().childForceExpandWidth = true;
            b1 = UIKit.Btn(br, "", () => DoPull(1), Theme.Pink, 32); b1.Size(-1, 110, 1);
            b10 = UIKit.Btn(br, "", () => DoPull(10), Theme.Lilac, 32); b10.Size(-1, 110, 1);
            UIKit.Para(machine, "Taux : Commune 60 % · Rare 28 % · Épique 10 % · Légendaire 2 %. x10 : au moins une Rare garantie. Les doublons rendent des Gemmes et augmentent la production.", 22);

            UIKit.Btn(c, kind == "skin" ? "Garde-robe" : "Mes décors", () => Collection(ui, kind), Theme.Mint, 32).Size(-1, 100);
        }

        void DoPull(int n)
        {
            var res = G.Pull(kind, n);
            if (res == null) { Sfx.Play("deny"); G.Say($"Il te faut {G.PullCost(n)} Gemmes ou {n} ticket(s). Missions, mini-jeux et Boutique en donnent !"); return; }
            Sfx.Play("gacha");
            ShowResults(res);
            Refresh();
        }

        void ShowResults(List<PullResult> res)
        {
            var m = ui.Modal(res.Count > 1 ? "10 capsules !" : "Capsule !", out var close);
            var grid = UIKit.Grid(m, new Vector2(165, 230), 8, 5);
            int i = 0;
            bool rare = false;
            foreach (var r in res)
            {
                var rc = Theme.Hex(G.D.Rarity(r.rarity).color);
                var cell = UIKit.Panel(grid, Color.Lerp(rc, Color.white, .75f), "Res");
                if (r.rarity == "legendaire" || r.rarity == "epique")
                {
                    rare = true;
                    var rays = UIKit.Img(cell.transform, Sprites.Icon("paillettes"), new Color(rc.r, rc.g, rc.b, .5f));
                    rays.rectTransform.Fill(-10, -10, -10, 30);
                    rays.gameObject.AddComponent<Spin>().speed = 40;
                }
                var img = UIKit.Img(cell.transform, r.kind == "skin" ? Sprites.Skin(r.id) : Sprites.Decor(r.id));
                img.rectTransform.At(new Vector2(.5f, 1), new Vector2(0, -8), new Vector2(150, 150));
                var t = UIKit.Label(cell.transform, (r.isNew ? "NOUVEAU\n" : $"+{r.refund} G\n") + r.name, 18, Theme.Ink);
                t.rectTransform.At(new Vector2(.5f, 0), new Vector2(0, 4), new Vector2(160, 66));
                if (r.featured) t.text = "VEDETTE !\n" + r.name;
                Anim.PopIn(cell.transform, i++ * .12f);
            }
            if (rare) Sfx.Play("rare");
            var row = UIKit.HBox(m, 16, 0, TextAnchor.MiddleCenter); row.Size(-1, 100);
            UIKit.Btn(row, "OK", close, Theme.Disabled, 32, Theme.Ink).Size(300, 96);
            int n = res.Count;
            UIKit.Btn(row, "Encore x" + n, () => { close(); DoPull(n); }, Theme.Pink).Size(360, 96);
        }

        public override void Refresh()
        {
            if (pityTxt == null) return;
            if (bannerTxt != null) bannerTxt.text = "Disparaît dans " + Fmt.Duration(G.BannerSecondsLeft());
            double rate = G.EventGachaRateUp();
            eventTxt.text = rate > 1 ? $"ÉVÉNEMENT : chances de Légendaire x{rate} !" : "";
            pityTxt.text = $"Légendaire garantie dans {G.PityLeft(kind)} tirages · {G.S.tickets} ticket(s)";
            b1.BtnLabel().text = G.S.tickets >= 1 ? "x1 · 1 ticket" : $"x1 · {G.PullCost(1)} Gemmes";
            b10.BtnLabel().text = G.S.tickets >= 10 ? "x10 · 10 tickets" : $"x10 · {G.PullCost(10)} Gemmes";
        }

        /// <summary>Garde-robe : tous les skins ou décors, équiper, bonus de collection.</summary>
        public static void Collection(MainUI ui, string kind)
        {
            var G = ui.G;
            var m = ui.Modal(kind == "skin" ? "Garde-robe" : "Décors", out var close, true, 1500);
            UIKit.Para(m, $"Bonus de collection : production +{Fmt.Num(G.CollectionBonusPct())} %", 28, Theme.Ink);
            var grid = UIKit.Grid(m, new Vector2(210, 290), 12, 4);
            if (kind == "bg")
            {
                var auto = UIKit.Panel(grid, G.S.bg == "auto" ? Theme.PinkSoft : Color.white, "Auto");
                UIKit.Img(auto.transform, Sprites.Era(G.CurrentEra().id)).rectTransform.At(new Vector2(.5f, 1), new Vector2(0, -8), new Vector2(120, 200));
                UIKit.Label(auto.transform, "Selon l'ère", 22).rectTransform.At(new Vector2(.5f, 0), new Vector2(0, 6), new Vector2(200, 60));
                UIKit.Hit(auto.transform, () => { G.EquipBg("auto"); ui.RefreshBackground(); close(); Collection(ui, kind); });
            }
            IEnumerable<(string id, string name, string rarity)> items = kind == "skin"
                ? G.D.skins.Select(s => (s.id, s.name, s.rarity))
                : G.D.backgrounds.Select(b => (b.id, b.name, b.rarity));
            foreach (var (id, name, rarity) in items)
            {
                var owned = kind == "skin" ? G.S.skins : G.S.bgs;
                bool has = owned.TryGetValue(id, out var n);
                bool eq = kind == "skin" ? G.S.skin == id : G.S.bg == id;
                var rc = Theme.Hex(G.D.Rarity(rarity).color);
                var cell = UIKit.Panel(grid, eq ? Theme.PinkSoft : Color.white, "Item");
                var img = UIKit.Img(cell.transform, kind == "skin" ? Sprites.Skin(id) : Sprites.Decor(id), has ? Color.white : new Color(0.2f, 0.15f, 0.25f, .9f));
                img.rectTransform.At(new Vector2(.5f, 1), new Vector2(0, -8), kind == "skin" ? new Vector2(190, 190) : new Vector2(120, 200));
                var lab = UIKit.Label(cell.transform, has ? name + (n > 1 ? $" x{n}" : "") : "???", 20, has ? Theme.Ink : Theme.InkSoft);
                lab.rectTransform.At(new Vector2(.5f, 0), new Vector2(0, 30), new Vector2(200, 54));
                var rl = UIKit.Label(cell.transform, G.D.Rarity(rarity).label, 18, rc);
                rl.rectTransform.At(new Vector2(.5f, 0), new Vector2(0, 4), new Vector2(200, 28));
                if (has)
                {
                    string cid = id;
                    UIKit.Hit(cell.transform, () =>
                    {
                        if (kind == "skin") G.EquipSkin(cid); else { G.EquipBg(cid); ui.RefreshBackground(); }
                        Sfx.Play("pop");
                        close(); Collection(ui, kind);
                    });
                }
            }
        }
    }
}
