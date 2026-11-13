// Pantsu dorée, matériaux, Atelier couture, commandes
using System;
using System.Collections.Generic;
using System.Linq;

namespace PantyClicker.Core
{
    public partial class Game
    {
        // ------------------------------------------------------------ Pantsu dorée
        /// <summary>Vrai tant qu'une Pantsu dorée est affichée (géré par l'interface).</summary>
        public bool GoldenOut;

        public void ScheduleGolden()
        {
            double min = D.Cfg("golden.minSec", 120), max = D.Cfg("golden.maxSec", 300);
            double freq = HasTalent("aimant") ? 1.25 : 1;
            S.goldenNext = Now + (min + Rng.NextDouble() * (max - min)) / freq;
        }

        public double GoldenLife => D.Cfg("golden.lifeSec", 13) + (HasTalent("patiente") ? 5 : 0);

        public void GoldenShown() { GoldenOut = true; ScheduleGolden(); }
        public void GoldenMissed() { GoldenOut = false; }
        public void ForceGolden() { S.goldenNext = Now; }

        /// <summary>Attrape la Pantsu dorée : tire un bonus et renvoie le texte affiché.</summary>
        public string CatchGolden()
        {
            GoldenOut = false;
            S.Count("golden");
            double r = Rng.NextDouble() * 100;
            if (r < 3) { AddGems(4); return "Pépite : +4 Gemmes"; }
            if (r < 5) { AddGems(12); return "Géode ! +12 Gemmes"; }
            if (r < 17)
            {
                var range = D.CfgList("materials.goldenRain");
                int a = range.Count > 0 ? (int)Json.ToD(range[0]) : 2, b = range.Count > 1 ? (int)Json.ToD(range[1]) : 4;
                var got = FindMats(a + Rng.Next(b - a + 1), "doree");
                return "Pluie de tissus ! " + MatsText(got);
            }
            if (r < 23) { AddBuff("maitre", "Doigts d'or", 1, 15, 60); return "Doigts d'or ! Clics x15 pendant 60 s"; }
            if (r < 31) { AddBuff("inspiration", "Inspiration", 1, 77, 13); return "Inspiration ! Clics x77 pendant 13 s"; }
            if (r < 39)
            {
                var pool = D.buildings.Where(x => x.era <= CurrentEra().id && Owned(x.id) > 0).ToList();
                if (pool.Count == 0) pool.Add(D.buildings[0]);
                var bd = pool[Rng.Next(pool.Count)];
                int n = 1 + Rng.Next(3);
                S.buildings[bd.id] = Owned(bd.id) + n;
                return $"Coup de main ! {n} x {bd.name} offert{(n > 1 ? "s" : "")}";
            }
            if (r < 52) { AddBuff("fete", "Fête kawaii", 3, 7, 30); return "Fête kawaii ! Production x3 et clics x7 pendant 30 s"; }
            if (r < 70)
            {
                double gain = Math.Min(S.coins * .15, TotalCps() * 900) + 13;
                Earn(gain);
                return "Jackpot ! +" + Fmt.Num(gain) + " Rubans";
            }
            AddBuff("frenesie", "Frénésie", 7, 1, 77);
            return "Frénésie ! Production x7 pendant 77 s";
        }

        // ------------------------------------------------------------ matériaux
        public Dictionary<string, int> RandomMats(int n)
        {
            var got = new Dictionary<string, int>();
            double total = D.mats.Sum(m => m.weight);
            for (int i = 0; i < n; i++)
            {
                double x = Rng.NextDouble() * total;
                var pick = D.mats.Last();
                foreach (var m in D.mats) { if ((x -= m.weight) < 0) { pick = m; break; } }
                got[pick.id] = (got.TryGetValue(pick.id, out var c) ? c : 0) + 1;
            }
            return got;
        }

        public Dictionary<string, int> FindMats(int n, string source)
        {
            if (HasTalent("fil")) n = (int)Math.Ceiling(n * 1.5);
            var got = RandomMats(n);
            AddMats(got);
            if (source == "clic") Emit("mats", got);
            return got;
        }

        public void AddMats(Dictionary<string, int> got)
        {
            foreach (var kv in got)
            {
                S.mats[kv.Key] = (S.mats.TryGetValue(kv.Key, out var c) ? c : 0) + kv.Value;
                S.Count("matsGot", kv.Value);
            }
        }

        public string MatName(string id) => D.mats.FirstOrDefault(m => m.id == id)?.name ?? id;
        public string MatsText(Dictionary<string, int> got) => string.Join(", ", got.Select(kv => $"{kv.Value} {MatName(kv.Key)}"));
        public int Mat(string id) => S.mats.TryGetValue(id, out var c) ? c : 0;

        // ------------------------------------------------------------ Atelier couture
        public bool CanCraft(RecipeDef r) =>
            CurrentEra().id >= r.era && r.cost.All(kv => Mat(kv.Key) >= kv.Value)
            && !(r.result.S("type") == "skin" && S.skins.ContainsKey(r.result.S("id")));

        public string Craft(RecipeDef r)
        {
            if (!CanCraft(r)) return null;
            foreach (var kv in r.cost) S.mats[kv.Key] = Mat(kv.Key) - kv.Value;
            S.Count("crafted");
            var res = r.result;
            switch (res.S("type"))
            {
                case "buff":
                    AddBuff("atelier", r.name, res.D("cps", 1), res.D("click", 1), res.D("min", 10) * 60);
                    return $"{r.name} : bonus actif {res.D("min", 10)} min";
                case "gems": AddGems(res.D("n")); return $"+{res.D("n")} Gemmes";
                case "golden": ForceGolden(); return "Une Pantsu dorée arrive !";
                case "pull": S.tickets += 1; return "+1 ticket capsule";
                case "coinsSec":
                    double g = BaseCps() * res.D("n") + 100;
                    Earn(g); return "+" + Fmt.Num(g) + " Rubans";
                case "hearts": S.city.hearts += res.D("n"); return $"+{res.D("n")} Cœurs";
                case "skin":
                    var id = res.S("id");
                    S.skins[id] = 1;
                    return $"Nouveau skin : {D.Skin(id)?.name}";
            }
            return r.name;
        }

        // ------------------------------------------------------------ commandes
        void OrdersTick()
        {
            double now = Now;
            S.orders.list.RemoveAll(o => o.expires <= now);
            if (S.orders.next <= 0) S.orders.next = now + 30;
            if (now >= S.orders.next && S.orders.list.Count < D.Cfg("orders.max", 2) && D.requests.Count > 0)
            {
                NewOrder();
                S.orders.next = now + D.Cfg("orders.everyMin", 90) * 60;
            }
        }

        public void NewOrder()
        {
            var req = D.requests[Rng.Next(D.requests.Count)];
            int era = CurrentEra().id;
            var dur = D.CfgList("orders.durationH");
            double h0 = dur.Count > 0 ? Json.ToD(dur[0]) : 4, h1 = dur.Count > 1 ? Json.ToD(dur[1]) : 10;
            var o = new OrderSlot
            {
                client = D.clients[Rng.Next(D.clients.Count)], what = req.what, main = req.main, side = req.side,
                needMain = 4 + era * 2 + Rng.Next(4), needSide = 2 + era + Rng.Next(3),
                gems = 10 + era * 4, hearts = 15 + era * 10, rep = 3 + era,
                expires = Now + (h0 + Rng.NextDouble() * (h1 - h0)) * 3600
            };
            S.orders.list.Add(o);
            Emit("order", o);
        }

        public bool CanDeliver(OrderSlot o) => Mat(o.main) >= o.needMain && Mat(o.side) >= o.needSide;

        public string Deliver(OrderSlot o)
        {
            if (!CanDeliver(o) || !S.orders.list.Contains(o)) return null;
            S.mats[o.main] = Mat(o.main) - o.needMain;
            S.mats[o.side] = Mat(o.side) - o.needSide;
            S.orders.list.Remove(o);
            AddGems(o.gems);
            S.city.hearts += o.hearts;
            S.orders.rep += o.rep;
            S.Count("orders");
            return $"Livré à {o.client} ! +{o.gems} Gemmes, +{o.hearts} Cœurs, +{o.rep} réputation";
        }
    }
}
