// Boutique + mécaniques FOMO : événements datés, Happy Hours, pack de bienvenue limité,
// Boutique du jour, vente flash, cadeau gratuit, abonnement, bannière (voir Game.Gacha).
using System;
using System.Collections.Generic;
using System.Linq;

namespace PantyClicker.Core
{
    using Map = Dictionary<string, object>;

    /// <summary>Achats réels. À brancher sur Unity IAP (voir README) ; par défaut : achats simulés en éditeur.</summary>
    public interface IStore
    {
        void Purchase(ShopItemDef item, Action<bool> done);
    }

    public partial class Game
    {
        public IStore Store;

        // ================================================================ événements
        static bool InWindow(DateTime t, string start, string end)
        {
            if (string.IsNullOrEmpty(start) || string.IsNullOrEmpty(end)) return false;
            int md = t.Month * 100 + t.Day;
            int a = int.Parse(start.Substring(0, 2)) * 100 + int.Parse(start.Substring(3, 2));
            int b = int.Parse(end.Substring(0, 2)) * 100 + int.Parse(end.Substring(3, 2));
            return a <= b ? md >= a && md <= b : md >= a || md <= b;
        }

        public bool EventActive(EventDef e, DateTime? at = null)
        {
            var t = at ?? Clock();
            if (e.weekdays.Count > 0) return e.weekdays.Contains((int)t.DayOfWeek);
            if (e.monthDays.Count > 0) return e.monthDays.Contains(t.Day);
            return InWindow(t, e.start, e.end);
        }

        public List<EventDef> ActiveEvents() => D.events.Where(e => EventActive(e)).ToList();

        /// <summary>Secondes avant la fin de l'événement (jour par jour, max 400 jours).</summary>
        public double EventSecondsLeft(EventDef e)
        {
            var t = Clock().Date;
            for (int i = 1; i < 400; i++)
                if (!EventActive(e, t.AddDays(i))) return (t.AddDays(i) - Clock()).TotalSeconds;
            return -1;
        }

        /// <summary>Prochain événement daté à venir (pour « Bientôt : … dans 3 j »).</summary>
        public (EventDef ev, double sec) NextEvent()
        {
            var t = Clock().Date;
            for (int i = 1; i < 120; i++)
                foreach (var e in D.events)
                    if (e.weekdays.Count == 0 && e.monthDays.Count == 0 && EventActive(e, t.AddDays(i)) && !EventActive(e))
                        return (e, (t.AddDays(i) - Clock()).TotalSeconds);
            return (null, 0);
        }

        public double EventBonusPct() => ActiveEvents().Sum(e => e.bonusPct);
        public double EventGachaRateUp() => ActiveEvents().Aggregate(1.0, (m, e) => m * e.gachaRateUp);
        public double ShopDiscountPct() => ActiveEvents().Sum(e => e.shopDiscount) + (HasTalent("vip") ? 10 : 0);

        public bool OfferOwned(OfferDef o) => o.kind == "skin" ? S.skins.ContainsKey(o.id) : S.bgs.ContainsKey(o.id);

        public string BuyOffer(OfferDef o)
        {
            if (OfferOwned(o) || S.gems < o.price) return null;
            S.gems -= o.price;
            if (o.kind == "skin") S.skins[o.id] = 1; else S.bgs[o.id] = 1;
            S.Count("shopBought");
            return "Édition limitée obtenue : " + (o.kind == "skin" ? D.Skin(o.id)?.name : D.Bg(o.id)?.name);
        }

        // ================================================================ Happy Hours
        public double HappyHourMult() => InHappyHour() ? D.Cfg("fomo.happyMult", 2) : 1;

        public bool InHappyHour()
        {
            int h = Clock().Hour;
            foreach (var r in D.CfgList("fomo.happyHours"))
                if (r is List<object> l && l.Count == 2 && h >= Json.ToD(l[0]) && h < Json.ToD(l[1])) return true;
            return false;
        }

        /// <summary>Secondes avant le début (si pas en cours) ou la fin (si en cours) de la Happy Hour.</summary>
        public double HappyHourSeconds()
        {
            var now = Clock();
            double best = double.MaxValue;
            foreach (var r in D.CfgList("fomo.happyHours"))
            {
                if (!(r is List<object> l) || l.Count != 2) continue;
                for (int d = 0; d < 2; d++)
                {
                    var a = now.Date.AddDays(d).AddHours(Json.ToD(l[0]));
                    var b = now.Date.AddDays(d).AddHours(Json.ToD(l[1]));
                    if (now >= a && now < b) return (b - now).TotalSeconds;
                    if (a > now) best = Math.Min(best, (a - now).TotalSeconds);
                }
            }
            return best;
        }

        // ================================================================ pack de bienvenue
        public double StarterSecondsLeft() => S.shop.starterBought ? -1 : S.startedAt + D.Cfg("fomo.starterHours", 72) * 3600 - Now;
        public bool StarterAvailable => !S.shop.starterBought && StarterSecondsLeft() > 0;

        // ================================================================ Boutique du jour
        public void ShopRefresh()
        {
            var key = DayKey();
            if (S.shop.dailyKey == key) return;
            S.shop.dailyKey = key;
            S.shop.dailyBought.Clear();
            // Tirage reproductible du jour
            var r = new Random(StableHash(key) ^ (int)(S.startedAt % 100000));
            var pool = D.pool.OrderBy(_ => r.Next()).ToList();
            S.shop.daily = pool.Take((int)D.Cfg("fomo.dailyShopSlots", 6)).Select(p => p.id).ToList();
            var rares = D.skins.Where(s => s.gacha && s.rarity == "rare").ToList();
            var epics = D.skins.Where(s => s.gacha && s.rarity == "epique").ToList();
            S.shop.dailySkin = (rares.Count > 0 ? rares[r.Next(rares.Count)].id : "") + "|" + (epics.Count > 0 ? epics[r.Next(epics.Count)].id : "");
            var bgs = D.backgrounds.Where(b => b.gacha && b.rarity == "rare").ToList();
            S.shop.dailyBg = bgs.Count > 0 ? bgs[r.Next(bgs.Count)].id : "";
            var decos = D.decos.Where(d => d.era <= CurrentEra().id).ToList();
            S.shop.dailyDeco = decos.Count > 0 ? decos[r.Next(decos.Count)].id : "";
        }

        public List<ShopItemDef> DailyItems() { ShopRefresh(); return S.shop.daily.Select(id => D.pool.FirstOrDefault(p => p.id == id)).Where(p => p != null).ToList(); }

        // ================================================================ vente flash
        /// <summary>Article en vente flash (toutes les flashEveryH heures, pendant flashMin minutes), sinon null.</summary>
        public ShopItemDef FlashItem(out double secondsLeft, out double secondsToNext)
        {
            double every = D.Cfg("fomo.flashEveryH", 4) * 3600, len = D.Cfg("fomo.flashMin", 30) * 60;
            double now = Now, slot = Math.Floor(now / every), into = now - slot * every;
            secondsToNext = every - into;
            secondsLeft = len - into;
            if (into >= len) return null;
            var cands = D.permanent.Where(p => !p.iap).ToList();
            return cands.Count == 0 ? null : cands[(int)(slot % cands.Count)];
        }

        // ================================================================ prix et achat
        /// <summary>Prix d'un article (après réductions). currency renseignée.</summary>
        public double PriceOf(ShopItemDef it, bool daily, bool flash = false)
        {
            double p = it.cost;
            if (it.currency == "rubans") p = Math.Max(100, BaseCps() * it.costSec);
            if (it.currency == "hearts" && it.costMult > 0) p = Math.Ceiling((D.Deco(S.shop.dailyDeco)?.cost ?? 50) * it.costMult);
            if (daily && it.currency == "gems") p = Math.Ceiling(p * (1 - Math.Min(90, ShopDiscountPct()) / 100));
            if (flash) p = Math.Ceiling(p * (1 - D.Cfg("fomo.flashDiscount", 50) / 100));
            return p;
        }

        public string ItemLabel(ShopItemDef it)
        {
            var g = it.give;
            if (g.S("skinRarity") != "") { var s = D.Skin(DailySkinFor(g.S("skinRarity"))); return s != null ? "Skin : " + s.name : it.name; }
            if (g.S("bgRarity") != "") { var b = D.Bg(S.shop.dailyBg); return b != null ? "Décor : " + b.name : it.name; }
            if (g.ContainsKey("decoRandom")) { var d = D.Deco(S.shop.dailyDeco); return d != null ? "Déco : " + d.name : it.name; }
            return it.name;
        }

        string DailySkinFor(string rarity)
        {
            var parts = (S.shop.dailySkin ?? "").Split('|');
            return rarity == "epique" ? (parts.Length > 1 ? parts[1] : "") : parts[0];
        }

        bool AlreadyOwned(ShopItemDef it)
        {
            var g = it.give;
            if (g.S("skinRarity") != "") return S.skins.ContainsKey(DailySkinFor(g.S("skinRarity")));
            if (g.S("bgRarity") != "") return S.bgs.ContainsKey(S.shop.dailyBg);
            if (g.S("skin") != "" && g.Count == 1) return S.skins.ContainsKey(g.S("skin"));
            return false;
        }

        public bool CanBuy(ShopItemDef it, bool daily, bool flash = false)
        {
            if (daily && S.shop.dailyBought.ContainsKey(it.id)) return false;
            if (AlreadyOwned(it)) return false;
            double p = PriceOf(it, daily, flash);
            switch (it.currency)
            {
                case "rubans": return S.coins >= p;
                case "hearts": return S.city.hearts >= p;
                default: return S.gems >= p;
            }
        }

        /// <summary>Achat en monnaie du jeu. Renvoie le texte du gain ou null.</summary>
        public string BuyItem(ShopItemDef it, bool daily, bool flash = false)
        {
            if (it.iap || !CanBuy(it, daily, flash)) return null;
            double p = PriceOf(it, daily, flash);
            if (it.currency == "rubans") S.coins -= p;
            else if (it.currency == "hearts") S.city.hearts -= p;
            else S.gems -= p;
            if (daily) S.shop.dailyBought[it.id] = true;
            if (flash) S.shop.flashSeen = FlashKey();
            S.shop.bought[it.id] = (S.shop.bought.TryGetValue(it.id, out var n) ? n : 0) + 1;
            S.Count("shopBought");
            return Give(it.give, it.name);
        }

        public string FlashKey() => Math.Floor(Now / (D.Cfg("fomo.flashEveryH", 4) * 3600)).ToString();
        public bool FlashBought => S.shop.flashSeen == FlashKey();

        /// <summary>Achat réel (pack de Gemmes, bienvenue, abonnement) via IStore.</summary>
        public void BuyIap(ShopItemDef it, Action<string> done)
        {
            if (it.id == "starter" && !StarterAvailable) { done?.Invoke(null); return; }
            if (Store == null) { done?.Invoke(null); Say("Boutique indisponible pour le moment."); return; }
            Store.Purchase(it, ok =>
            {
                if (!ok) { done?.Invoke(null); return; }
                if (it.id == "starter") S.shop.starterBought = true;
                S.Count("shopBought");
                done?.Invoke(Give(it.give, it.name));
            });
        }

        /// <summary>Applique un contenu « give » (boutique, calendrier…).</summary>
        public string Give(Map g, string label)
        {
            var parts = new List<string>();
            if (g.D("gems") > 0) { AddGems(g.D("gems")); parts.Add($"+{g.D("gems")} Gemmes"); }
            if (g.D("hearts") > 0) { S.city.hearts += g.D("hearts"); parts.Add($"+{g.D("hearts")} Cœurs"); }
            if (g.D("tickets") > 0) { S.tickets += g.D("tickets"); parts.Add($"+{g.D("tickets")} ticket(s) capsule"); }
            if (g.D("shield") > 0) { S.daily.shields += g.I("shield"); parts.Add("+1 Bouclier de série"); }
            if (g.D("coinsSec") > 0) { double v = BaseCps() * g.D("coinsSec") + 100; Earn(v); parts.Add("+" + Fmt.Num(v) + " Rubans"); }
            if (g.D("mats") > 0) { var got = RandomMats(g.I("mats")); AddMats(got); parts.Add(MatsText(got)); }
            var buff = g.O("buff");
            if (buff != null) { AddBuff("boutique-" + StableHash(label), label, buff.D("cps", 1), buff.D("click", 1), buff.D("min", 10) * 60); parts.Add("bonus activé"); }
            if (g.S("skin") != "") { S.skins[g.S("skin")] = S.skins.TryGetValue(g.S("skin"), out var n) ? n + 1 : 1; parts.Add("skin " + D.Skin(g.S("skin"))?.name); }
            if (g.S("skinRarity") != "") { var id = DailySkinFor(g.S("skinRarity")); if (id != "") { S.skins[id] = 1; parts.Add("skin " + D.Skin(id)?.name); } }
            if (g.S("bgRarity") != "" && S.shop.dailyBg != "") { S.bgs[S.shop.dailyBg] = 1; parts.Add("décor " + D.Bg(S.shop.dailyBg)?.name); }
            if (g.ContainsKey("decoRandom") && S.shop.dailyDeco != "") { S.city.decoInv[S.shop.dailyDeco] = DecoInv(S.shop.dailyDeco) + 1; parts.Add("déco " + D.Deco(S.shop.dailyDeco)?.name); }
            var deco = g.O("deco");
            if (deco != null) { S.city.decoInv[deco.S("id")] = DecoInv(deco.S("id")) + deco.I("n", 1); parts.Add("déco " + D.Deco(deco.S("id"))?.name); }
            var sub = g.O("sub");
            if (sub != null)
            {
                S.shop.subUntil = Math.Max(S.shop.subUntil, Now) + sub.D("days", 30) * 86400;
                S.shop.subGems = sub.I("gems", 30);
                parts.Add($"abonnement actif ({sub.D("days", 30)} j)");
            }
            return string.Join(", ", parts);
        }

        // ================================================================ cadeau gratuit + abonnement
        public double FreeGiftSeconds() => S.shop.freeGiftNext - Now;

        public string ClaimFreeGift()
        {
            if (FreeGiftSeconds() > 0) return null;
            S.shop.freeGiftNext = Now + D.Cfg("fomo.freeGiftH", 8) * 3600;
            int gems = (int)D.Cfg("fomo.freeGiftGems", 5);
            AddGems(gems);
            var got = RandomMats(2);
            AddMats(got);
            return $"Cadeau : +{gems} Gemmes, {MatsText(got)}";
        }

        /// <summary>Hachage stable entre exécutions (string.GetHashCode ne l'est pas en .NET).</summary>
        public static int StableHash(string s)
        {
            unchecked
            {
                int h = 23;
                foreach (char c in s ?? "") h = h * 31 + c;
                return h & 0x7fffffff;
            }
        }

        public bool SubActive => S.shop.subUntil > Now;

        void SubscriptionTick()
        {
            if (!SubActive || S.shop.subLast == DayKey()) return;
            S.shop.subLast = DayKey();
            AddGems(S.shop.subGems);
            Say($"Abonnement Lune : +{S.shop.subGems} Gemmes du jour");
        }
    }
}
