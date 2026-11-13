// Page Boutique : offres limitées (bienvenue, vente flash, événements), cadeau gratuit, Boutique du jour, permanents, Gemmes
using System;
using System.Collections.Generic;
using System.Linq;
using PantyClicker.Core;
using UnityEngine;
using UnityEngine.UI;

namespace PantyClicker.UI
{
    public class ShopPage : Page
    {
        readonly List<(Text t, Func<string> f)> live = new List<(Text, Func<string>)>();

        Text Live(Transform parent, Func<string> f, int size = 28, Color? c = null, TextAnchor a = TextAnchor.MiddleLeft)
        {
            var t = UIKit.Label(parent, f(), size, c ?? Theme.Pink, a);
            t.Size(-1, size + 16);
            live.Add((t, f));
            return t;
        }

        protected override void Build()
        {
            live.Clear();
            var c = UIKit.Scroll(Root, out _, 16, 16);

            // ---- pack de bienvenue (une seule fois, 72 h)
            if (G.StarterAvailable)
            {
                var it = G.D.starter;
                var card = UIKit.Card(c, Theme.Hex("#fff3c4"), 20, 8);
                card.gameObject.AddComponent<Pulse>().amp = .01f;
                var row = UIKit.HBox(card, 16, 0, TextAnchor.MiddleLeft); row.Size(-1, 240);
                UIKit.Img(row, Sprites.Skin(it.give.S("skin", "magical"))).Size(220, 220);
                var col = UIKit.VBox(row, 4, 0, TextAnchor.MiddleLeft, false); col.Size(-1, 230, 1);
                UIKit.Label(col, it.name.ToUpper(), 36, Theme.Ink, TextAnchor.MiddleLeft).Size(-1, 50);
                UIKit.Label(col, it.tag ?? "", 26, Theme.Pink, TextAnchor.MiddleLeft).Size(-1, 36);
                UIKit.Para(col, "300 Gemmes + skin Magical Girl Étoilée + 5 tickets + production x2 pendant 1 h", 22, Theme.Ink).Size(-1, 70);
                Live(col, () => "Disparaît dans " + Fmt.Duration(G.StarterSecondsLeft()), 26, Theme.Pink);
                UIKit.Btn(card, it.price, () => Iap(it), Theme.Pink, 34).Size(-1, 100);
            }

            // ---- vente flash
            var flash = G.FlashItem(out _, out _);
            var fcard = UIKit.Card(c, Color.white, 18, 8);
            if (flash != null && !G.FlashBought)
            {
                UIKit.Label(fcard, "VENTE FLASH -" + G.D.Cfg("fomo.flashDiscount", 50) + " %", 34, Theme.Pink, TextAnchor.MiddleLeft).Size(-1, 50);
                var row = UIKit.HBox(fcard, 14, 0, TextAnchor.MiddleLeft); row.Size(-1, 110);
                UIKit.Img(row, Sprites.Icon("eclair")).Size(96, 96);
                var col = UIKit.VBox(row, 2, 0, TextAnchor.MiddleLeft, false); col.Size(-1, 100, 1);
                UIKit.Label(col, flash.name, 28, Theme.Ink, TextAnchor.MiddleLeft).Size(-1, 44);
                Live(col, () => { G.FlashItem(out var l, out _); return "Fin dans " + Fmt.Duration(l); }, 24);
                var p = G.PriceOf(flash, false, true);
                UIKit.Btn(row, $"{Fmt.Num(p)} {Cur(flash.currency)}\n<size=18>au lieu de {Fmt.Num(G.PriceOf(flash, false))}</size>", () => Buy(flash, false, true), Theme.Pink, 28).Size(240, 104);
            }
            else Live(fcard, () => { G.FlashItem(out _, out var nx); return "Prochaine vente flash dans " + Fmt.Duration(nx); }, 28, Theme.InkSoft, TextAnchor.MiddleCenter);

            // ---- cadeau gratuit
            var gift = UIKit.Card(c, Theme.Hex("#e9fff4"), 18, 8);
            var grow = UIKit.HBox(gift, 14, 0, TextAnchor.MiddleLeft); grow.Size(-1, 110);
            UIKit.Img(grow, Sprites.Icon("cadeau")).Size(96, 96);
            Live(grow, () => G.FreeGiftSeconds() <= 0 ? "Cadeau gratuit disponible !" : "Prochain cadeau gratuit dans " + Fmt.Duration(G.FreeGiftSeconds()), 28, Theme.Ink).Size(-1, 100, 1);
            UIKit.Btn(grow, "Ouvrir", () =>
            {
                var r = G.ClaimFreeGift();
                if (r == null) { Sfx.Play("deny"); return; }
                Sfx.Play("win"); G.Say(r); Rebuild();
            }, Theme.Mint, 30).Size(200, 90);

            // ---- éditions limitées des événements
            foreach (var e in G.ActiveEvents().Where(e => e.offers.Count > 0))
            {
                var ec = UIKit.Card(c, Theme.Hex("#fff0f6"), 18, 8);
                UIKit.Label(ec, e.name, 34, Theme.Ink, TextAnchor.MiddleLeft).Size(-1, 50);
                var ev = e;
                Live(ec, () => "ÉDITION LIMITÉE · fin dans " + Fmt.Duration(G.EventSecondsLeft(ev)), 26);
                var grid = UIKit.HBox(ec, 12, 0, TextAnchor.MiddleLeft); grid.Size(-1, 300);
                foreach (var o in e.offers)
                {
                    var box = UIKit.Panel(grid, Color.white, "Offer"); box.Size(300, 300);
                    UIKit.Img(box.transform, o.kind == "skin" ? Sprites.Skin(o.id) : Sprites.Decor(o.id)).rectTransform.At(new Vector2(.5f, 1), new Vector2(0, -8), new Vector2(180, 180));
                    var oo = o;
                    bool owned = G.OfferOwned(o);
                    var b = UIKit.Btn(box.transform, owned ? "Obtenu" : $"{o.price} Gemmes", () =>
                    {
                        var r = G.BuyOffer(oo);
                        if (r == null) { Sfx.Play("deny"); return; }
                        Sfx.Play("rare"); G.Say(r); Rebuild();
                    }, owned ? Theme.Disabled : Theme.Pink, 28);
                    ((RectTransform)b.transform).At(new Vector2(.5f, 0), new Vector2(0, 10), new Vector2(270, 90));
                }
            }

            // ---- Boutique du jour
            var dc = UIKit.Card(c, Color.white, 18, 10);
            UIKit.Label(dc, "Boutique du jour", 36, Theme.Ink, TextAnchor.MiddleLeft).Size(-1, 50);
            Live(dc, () => "Nouveaux articles dans " + Fmt.Duration(G.SecondsToMidnight()) + (G.ShopDiscountPct() > 0 ? $" · -{G.ShopDiscountPct()} % sur les Gemmes !" : ""), 24);
            var dg = UIKit.Grid(dc, new Vector2(320, 330), 12, 3);
            foreach (var it in G.DailyItems()) Item(dg, it, true);

            // ---- permanents
            var pc = UIKit.Card(c, Color.white, 18, 10);
            UIKit.Label(pc, "Toujours en rayon", 36, Theme.Ink, TextAnchor.MiddleLeft).Size(-1, 50);
            var pg = UIKit.Grid(pc, new Vector2(320, 330), 12, 3);
            foreach (var it in G.D.permanent) Item(pg, it, false);

            // ---- Gemmes (achats réels)
            var gc = UIKit.Card(c, Theme.Hex("#f4efff"), 18, 10);
            UIKit.Label(gc, "Gemmes", 36, Theme.Ink, TextAnchor.MiddleLeft).Size(-1, 50);
            if (G.SubActive) Live(gc, () => $"Abonnement Lune actif : +{G.S.shop.subGems} Gemmes/jour encore {Fmt.Duration(G.S.shop.subUntil - G.Now)}", 24, Theme.Lilac);
            var gg = UIKit.Grid(gc, new Vector2(320, 300), 12, 3);
            foreach (var it in G.D.packs)
            {
                var box = UIKit.Panel(gg, Color.white, "Pack");
                UIKit.Img(box.transform, Sprites.Icon(it.give.O("sub") != null ? "horloge" : "gemmes")).rectTransform.At(new Vector2(.5f, 1), new Vector2(0, -10), new Vector2(110, 110));
                var t = UIKit.Label(box.transform, it.name + (it.tag != null ? $"\n<color=#ff6fa0>{it.tag}</color>" : ""), 22, Theme.Ink);
                t.rectTransform.At(new Vector2(.5f, 0), new Vector2(0, 96), new Vector2(300, 80));
                var b = UIKit.Btn(box.transform, it.price, () => Iap(it), Theme.Lilac, 30);
                ((RectTransform)b.transform).At(new Vector2(.5f, 0), new Vector2(0, 10), new Vector2(280, 80));
            }
            UIKit.Para(c, "Achats réels simulés dans l'éditeur. À brancher sur Unity IAP avant publication (voir README).", 20);
        }

        static string Cur(string c) => c == "rubans" ? "Rubans" : c == "hearts" ? "Cœurs" : "Gemmes";

        void Item(Transform grid, ShopItemDef it, bool daily)
        {
            bool sold = daily && G.S.shop.dailyBought.ContainsKey(it.id);
            var box = UIKit.Panel(grid, sold ? Theme.PinkPale : Color.white, "Item");
            UIKit.Img(box.transform, ItemSprite(it)).rectTransform.At(new Vector2(.5f, 1), new Vector2(0, -8), new Vector2(130, 130));
            var t = UIKit.Label(box.transform, G.ItemLabel(it), 22, Theme.Ink);
            t.rectTransform.At(new Vector2(.5f, 0), new Vector2(0, 100), new Vector2(300, 84));
            double p = G.PriceOf(it, daily);
            var b = UIKit.Btn(box.transform, sold ? "Vendu" : $"{Fmt.Num(p)} {Cur(it.currency)}", () => Buy(it, daily, false), sold ? Theme.Disabled : Theme.Mint, 26);
            ((RectTransform)b.transform).At(new Vector2(.5f, 0), new Vector2(0, 10), new Vector2(290, 80));
        }

        Sprite ItemSprite(ShopItemDef it)
        {
            var g = it.give;
            if (g.S("skinRarity") != "") return Sprites.Skin((G.S.shop.dailySkin ?? "").Split('|')[g.S("skinRarity") == "epique" ? 1 : 0]);
            if (g.S("bgRarity") != "") return Sprites.Decor(G.S.shop.dailyBg);
            if (g.ContainsKey("decoRandom")) return Sprites.Deco(G.S.shop.dailyDeco);
            if (g.O("deco") != null) return Sprites.Deco(g.O("deco").S("id"));
            if (g.D("tickets") > 0) return Sprites.Icon("capsule");
            if (g.D("mats") > 0) return Sprites.Icon("coton");
            if (g.D("hearts") > 0) return Sprites.Icon("coeurs");
            if (g.D("shield") > 0) return Sprites.Icon("trophee");
            if (g.D("coinsSec") > 0) return Sprites.Icon("horloge");
            return Sprites.Icon("eclair");
        }

        void Buy(ShopItemDef it, bool daily, bool flash)
        {
            var r = G.BuyItem(it, daily, flash);
            if (r == null) { Sfx.Play("deny"); G.Say("Pas assez de " + Cur(it.currency) + " (ou déjà acheté)."); return; }
            Sfx.Play("buy");
            G.Say(it.name + " : " + r);
            Rebuild();
        }

        void Iap(ShopItemDef it)
        {
            ui.Confirm(it.name, $"Acheter pour {it.price} ?", "Acheter", () =>
                G.BuyIap(it, r =>
                {
                    if (r == null) { Sfx.Play("deny"); return; }
                    Sfx.Play("rare"); G.Say("Merci ! " + r); Rebuild();
                }));
        }

        public override void Refresh()
        {
            foreach (var (t, f) in live) if (t != null) t.text = f();
        }
    }
}
