// Machine à capsules : skins et décors, garantie Légendaire, bannière vedette tournante (FOMO)
using System;
using System.Collections.Generic;
using System.Linq;

namespace PantyClicker.Core
{
    public class PullResult { public string kind, id, name, rarity; public bool isNew, featured; public int refund; }

    public partial class Game
    {
        static readonly Dictionary<string, int> Rank = new Dictionary<string, int> { { "commune", 0 }, { "rare", 1 }, { "epique", 2 }, { "legendaire", 3 } };

        public int PullCost(int n) => n == 10 ? (int)D.Cfg("gacha.cost10", 225) - (HasTalent("capsule") ? 25 : 0) : (int)D.Cfg("gacha.cost1", 25) * n;

        List<(string id, string rarity)> Pool(string kind) => kind == "skin"
            ? D.skins.Where(s => s.gacha && !s.isDefault && Rank.ContainsKey(s.rarity)).Select(s => (s.id, s.rarity)).ToList()
            : D.backgrounds.Where(b => b.gacha && Rank.ContainsKey(b.rarity)).Select(b => (b.id, b.rarity)).ToList();

        // ---------- bannière vedette
        int BannerIndex => (int)Math.Floor((Clock().Date - new DateTime(2024, 1, 1)).TotalDays / Math.Max(1, D.Cfg("gacha.bannerDays", 3)));

        /// <summary>Skin mis en avant en ce moment (épique ou légendaire), change tous les bannerDays jours.</summary>
        public SkinDef BannerSkin()
        {
            var c = D.skins.Where(s => s.gacha && (s.rarity == "epique" || s.rarity == "legendaire")).ToList();
            if (c.Count == 0) return null;
            return c[((BannerIndex % c.Count) + c.Count) % c.Count];
        }

        public double BannerSecondsLeft()
        {
            double days = D.Cfg("gacha.bannerDays", 3);
            var start = new DateTime(2024, 1, 1).AddDays((BannerIndex + 1) * days);
            return (start - Clock()).TotalSeconds;
        }

        string RollRarity(string kind, bool minRare)
        {
            var g = S.gacha;
            int since = kind == "skin" ? g.sinceLegend : g.bgSinceLegend;
            if (since + 1 >= D.Cfg("gacha.pityLegendary", 60)) return "legendaire";
            double legendMult = EventGachaRateUp();
            var rs = D.rarities.Where(r => Rank.ContainsKey(r.id)).Select(r => (r.id, w: r.weight * (r.id == "legendaire" ? legendMult : 1))).ToList();
            double total = rs.Sum(r => r.w), x = Rng.NextDouble() * total;
            string pick = rs[0].id;
            foreach (var r in rs) { if ((x -= r.w) < 0) { pick = r.id; break; } }
            if (minRare && Rank[pick] < 1) pick = "rare";
            return pick;
        }

        PullResult RollOne(string kind, bool minRare)
        {
            string rarity = RollRarity(kind, minRare);
            var pool = Pool(kind);
            var cands = pool.Where(p => p.rarity == rarity).ToList();
            if (cands.Count == 0) cands = pool;
            var pick = cands[Rng.Next(cands.Count)];
            bool featured = false;
            var banner = BannerSkin();
            if (kind == "skin" && banner != null && banner.rarity == rarity && Rng.NextDouble() < D.Cfg("gacha.bannerRateUp", .5))
            {
                pick = (banner.id, banner.rarity);
                featured = true;
            }
            var g = S.gacha;
            if (kind == "skin") { g.pulls++; g.sinceLegend = rarity == "legendaire" ? 0 : g.sinceLegend + 1; }
            else { g.bgPulls++; g.bgSinceLegend = rarity == "legendaire" ? 0 : g.bgSinceLegend + 1; }
            var owned = kind == "skin" ? S.skins : S.bgs;
            bool isNew = !owned.ContainsKey(pick.id);
            owned[pick.id] = (owned.TryGetValue(pick.id, out var n) ? n : 0) + 1;
            int refund = isNew ? 0 : (int)D.Cfg("gacha.refund." + rarity, 2);
            AddGems(refund);
            S.Count("pulls");
            return new PullResult
            {
                kind = kind, id = pick.id, rarity = pick.rarity, isNew = isNew, refund = refund, featured = featured,
                name = kind == "skin" ? D.Skin(pick.id)?.name : D.Bg(pick.id)?.name
            };
        }

        /// <summary>Tirage : utilise d'abord les tickets, sinon les Gemmes. null si pas assez.</summary>
        public List<PullResult> Pull(string kind, int n)
        {
            int cost = PullCost(n);
            if (S.tickets >= n) S.tickets -= n;
            else if (S.gems >= cost) S.gems -= cost;
            else return null;
            var res = new List<PullResult>();
            for (int i = 0; i < n; i++)
            {
                bool guarantee = n == 10 && i == 9 && !res.Any(r => Rank[r.rarity] >= 1);
                res.Add(RollOne(kind, guarantee));
            }
            Emit("pull", res);
            return res;
        }

        public PullResult FreePull(string kind) => RollOne(kind, false);

        public int PityLeft(string kind) => (int)D.Cfg("gacha.pityLegendary", 60) - (kind == "skin" ? S.gacha.sinceLegend : S.gacha.bgSinceLegend);

        public void EquipSkin(string id) { if (S.skins.ContainsKey(id)) { S.skin = id; S.Count("equips"); } }
        public void EquipBg(string id) { if (id == "auto" || S.bgs.ContainsKey(id)) S.bg = id; }
    }
}
