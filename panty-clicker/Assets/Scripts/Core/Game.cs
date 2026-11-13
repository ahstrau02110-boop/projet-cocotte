// Moteur de Panty Clicker : règles du jeu, sans dépendance à Unity (testable en .NET).
// Découpé en fichiers partiels : Game.*.cs (gacha, ville, boutique, FOMO, prestige…).
using System;
using System.Collections.Generic;
using System.Linq;

namespace PantyClicker.Core
{
    public partial class Game
    {
        public readonly GameData D;
        public GameState S;
        public Random Rng = new Random();
        /// <summary>Horloge locale (remplaçable pour les tests).</summary>
        public Func<DateTime> Clock = () => DateTime.Now;

        /// <summary>Message court à afficher (toast).</summary>
        public event Action<string> Toast;
        /// <summary>Signal pour l'interface : (type, donnée). Types : era, achievement, golden-ready, buy, pull, reset, order…</summary>
        public event Action<string, object> Signal;

        public Game(GameData data, GameState state = null, Func<DateTime> clock = null)
        {
            D = data;
            if (clock != null) Clock = clock;
            S = state ?? NewState();
            Normalize();
        }

        public void Say(string msg) => Toast?.Invoke(msg);
        public void Emit(string type, object data = null) => Signal?.Invoke(type, data);

        // ------------------------------------------------------------ temps
        public double Now => (Clock().ToUniversalTime() - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalSeconds;
        public string DayKey(DateTime? t = null) => (t ?? Clock()).ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
        public string WeekKey()
        {
            var t = Clock().Date;
            int diff = ((int)t.DayOfWeek + 6) % 7;             // lundi = début de semaine
            return t.AddDays(-diff).ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
        }
        public double SecondsToMidnight() => (Clock().Date.AddDays(1) - Clock()).TotalSeconds;

        // ------------------------------------------------------------ état
        public GameState NewState()
        {
            var s = new GameState { startedAt = Now, lastSave = Now };
            s.city.size = (int)D.city.D("gridStart", 5);
            return s;
        }

        /// <summary>Complète un état chargé d'une ancienne version (champs manquants).</summary>
        void Normalize()
        {
            if (S.startedAt <= 0) S.startedAt = Now;
            if (S.skins.Count == 0) S.skins["classique"] = 1;
            if (S.city.size <= 0) S.city.size = (int)D.city.D("gridStart", 5);
            CityEnsureCells();
            foreach (var m in D.mats) if (!S.mats.ContainsKey(m.id)) S.mats[m.id] = 0;
            if (S.goldenNext <= 0) ScheduleGolden();
            if (S.city.lastTick <= 0) S.city.lastTick = Now;
            if (S.shop.freeGiftNext <= 0) S.shop.freeGiftNext = Now;
        }

        public int Owned(string id) => S.Owned(id);
        public bool HasTalent(string id) => S.prestige.talents.TryGetValue(id, out var b) && b;

        // ------------------------------------------------------------ économie
        public double CostOf(BuildingDef b, int qty = 1)
        {
            double r = D.Cfg("costGrowth", 1.15);
            int n = Owned(b.id);
            return Math.Ceiling(b.baseCost * Math.Pow(r, n) * (Math.Pow(r, qty) - 1) / (r - 1) * (HasTalent("soldes") ? .95 : 1));
        }

        /// <summary>Nombre achetable avec les Rubans actuels (pour « Max »).</summary>
        public int MaxAffordable(BuildingDef b)
        {
            int q = 0;
            while (q < 1000 && CostOf(b, q + 1) <= S.coins) q++;
            return q;
        }

        IEnumerable<UpgradeDef> Bought(string type) => D.upgrades.Where(u => u.type == type && S.upgrades.ContainsKey(u.id));

        public double BuildingMult(string id) =>
            Bought("building").Where(u => u.target == id).Aggregate(1.0, (m, u) => m * u.mult) * (1 + CityBuildingBoostPct(id) / 100);

        public double AchievementBonusPct() => S.achievements.Count * D.Cfg("achievements.prodBonusPct", .4);
        public double PetalBonusPct() => S.prestige.petals * D.Cfg("prestige.petalPct", 1.5);
        public double MegaBonusPct() => S.mega * D.Cfg("mega.bonusPct", 25);

        public double CollectionBonusPct()
        {
            double dup = S.skins.Values.Sum(n => Math.Max(0, n - 1)) + S.bgs.Values.Sum(n => Math.Max(0, n - 1));
            return (S.skins.Count - 1) * D.Cfg("gacha.collectionBonusPct", .5) + S.bgs.Count * D.Cfg("gacha.collectionBgPct", .2) + dup * D.Cfg("gacha.dupPct", .2);
        }

        public double RepPct() => Math.Floor(S.orders.rep / D.Cfg("orders.repPerLevel", 20)) * D.Cfg("orders.repPct", 1);

        public double GlobalMult() =>
            (1 + CollectionBonusPct() / 100) * (1 + AchievementBonusPct() / 100) * (1 + PetalBonusPct() / 100) * (1 + MegaBonusPct() / 100)
            * (1 + EventBonusPct() / 100) * (1 + CityHappyPct() / 100) * (1 + RepPct() / 100)
            * Bought("global").Aggregate(1.0, (m, u) => m * u.mult);

        public double BuildingCps(BuildingDef b) => b.baseCps * BuildingMult(b.id) * GlobalMult();

        /// <summary>Multiplicateur des bonus temporaires (buffs, Happy Hour).</summary>
        public double BuffMult(string kind)
        {
            double now = Now, m = 1;
            foreach (var b in S.buffs) if (b.until > now) m *= kind == "cps" ? b.cps : b.click;
            if (kind == "cps") m *= HappyHourMult();
            return m;
        }

        public double BaseCps()
        {
            double gm = GlobalMult(), sum = 0;               // calculé une fois (appelé à chaque image)
            foreach (var b in D.buildings)
            {
                int n = Owned(b.id);
                if (n > 0) sum += n * b.baseCps * BuildingMult(b.id);
            }
            return sum * gm;
        }
        public double TotalCps() => BaseCps() * BuffMult("cps");

        public double ClickValue()
        {
            double mult = Bought("click").Aggregate(1.0, (m, u) => m * u.mult) * (HasTalent("mains") ? 2 : 1);
            double pct = Bought("clickCps").Sum(u => u.pct);
            return (mult + TotalCps() * pct / 100) * BuffMult("click");
        }

        public void Earn(double n)
        {
            if (n <= 0 || double.IsNaN(n)) return;
            S.coins += n;
            S.totalEarned += n;
            S.prestige.lifetime += n;
        }

        public void AddGems(double n) => S.gems = Math.Max(0, Math.Floor(S.gems + n));

        // ------------------------------------------------------------ actions
        /// <summary>Clic sur la Pantsu. Renvoie le gain.</summary>
        public double Click()
        {
            double v = ClickValue();
            Earn(v);
            S.handEarned += v;
            S.totalClicks++;
            S.Count("clicks");
            if (Rng.NextDouble() < D.Cfg("materials.clickChance", .008)) FindMats(1, "clic");
            return v;
        }

        public bool Buy(BuildingDef b, int qty)
        {
            if (qty <= 0) return false;
            double c = CostOf(b, qty);
            if (S.coins < c) return false;
            S.coins -= c;
            S.buildings[b.id] = Owned(b.id) + qty;
            S.Count("bought", qty);
            Emit("buy", b.id);
            return true;
        }

        public bool UpgradeVisible(UpgradeDef u)
        {
            if (S.upgrades.ContainsKey(u.id)) return false;
            switch (u.unlockKind)
            {
                case "owned": return Owned(u.target) >= u.unlockAt;
                case "clicks": return S.totalClicks >= u.unlockAt;
                case "earned": return S.totalEarned >= u.unlockAt;
                case "cps": return BaseCps() >= u.unlockAt;
                case "era": return CurrentEra().id >= u.unlockAt;
                default: return true;
            }
        }

        public List<UpgradeDef> AvailableUpgrades() => D.upgrades.Where(UpgradeVisible).ToList();

        public bool BuyUpgrade(UpgradeDef u)
        {
            if (!UpgradeVisible(u) || S.coins < u.cost) return false;
            S.coins -= u.cost;
            S.upgrades[u.id] = true;
            S.Count("upgBought");
            return true;
        }

        public void AddBuff(string id, string name, double cps, double click, double seconds)
        {
            S.buffs.RemoveAll(b => b.id == id);
            S.buffs.Add(new Buff { id = id, name = name, cps = cps, click = click, until = Now + seconds });
        }

        public List<Buff> ActiveBuffs() => S.buffs.Where(b => b.until > Now).ToList();

        // ------------------------------------------------------------ ères
        public EraDef CurrentEra()
        {
            var era = D.eras[0];
            foreach (var e in D.eras) if (S.totalEarned >= e.unlockAt) era = e;
            return era;
        }
        public EraDef NextEra() => D.eras.FirstOrDefault(e => e.unlockAt > S.totalEarned);

        void CheckEra()
        {
            var era = CurrentEra();
            if (era.id > S.maxEra)
            {
                S.maxEra = era.id;
                AddGems(D.Cfg("eraGems", 10));
                Emit("era", era);
                Say($"Nouvelle ère : {era.name} ! +{D.Cfg("eraGems", 10)} Gemmes");
            }
        }

        // ------------------------------------------------------------ succès
        public double StatValue(string stat)
        {
            switch (stat)
            {
                case "clicks": return S.totalClicks;
                case "earned": return S.prestige.lifetime;
                case "cps": return BaseCps();
                case "skins": return S.skins.Count;
                case "bgs": return S.bgs.Count;
                case "seasons": return S.prestige.seasons;
                case "happy": return CityHappy();
                case "streak": return S.daily.best;
                case "pulls": return S.gacha.pulls + S.gacha.bgPulls;
                default: return S.Counter(stat);
            }
        }

        void CheckAchievements()
        {
            foreach (var a in D.achievements)
            {
                if (S.achievements.ContainsKey(a.id)) continue;
                double v = a.stat == "building" ? Owned(a.building) : StatValue(a.stat);
                if (v < a.n) continue;
                S.achievements[a.id] = Now;
                Emit("achievement", a);
            }
            foreach (var m in D.config.O("achievements").Objs("milestones"))
            {
                int n = m.I("n");
                if (S.achievements.Count >= n && !S.achMilestones.Contains(n))
                {
                    S.achMilestones.Add(n);
                    AddGems(m.I("gems"));
                    Say($"{n} succès ! +{m.I("gems")} Gemmes");
                }
            }
        }

        // ------------------------------------------------------------ boucle
        double achTimer, slowTimer, lastActive;

        /// <summary>À appeler à chaque image avec le temps écoulé (s).</summary>
        public void Tick(double dt)
        {
            if (dt <= 0) return;
            dt = Math.Min(dt, 5);                     // grosse pause : géré par Offline()
            lastActive = Now;
            Earn(TotalCps() * dt);
            achTimer += dt; slowTimer += dt;
            if (achTimer >= .5) { achTimer = 0; CheckEra(); CheckAchievements(); }
            if (slowTimer >= 1)
            {
                slowTimer = 0;
                S.buffs.RemoveAll(b => b.until <= Now);
                CityTick();
                OrdersTick();
                MissionsRefresh();
                SubscriptionTick();
                if (Now >= S.goldenNext && !GoldenOut) Emit("golden-ready");
            }
        }

        /// <summary>Gains pendant l'absence. Renvoie (secondes prises en compte, Rubans gagnés).</summary>
        public (double sec, double gain) Offline(double lastSeen)
        {
            // lastActive évite de compter deux fois la même absence (reprise + chargement)
            double away = Now - Math.Max(lastSeen, lastActive);
            lastActive = Now;
            if (away < 60) return (0, 0);
            double cap = (HasTalent("grasse") ? 16 : D.Cfg("offlineMaxHours", 8)) * 3600;
            double sec = Math.Min(away, cap);
            double rate = HasTalent("nuit") ? .75 : D.Cfg("offlineRate", .5);
            double gain = BaseCps() * sec * rate;
            Earn(gain);
            CityTick();
            return (sec, gain);
        }
    }
}
