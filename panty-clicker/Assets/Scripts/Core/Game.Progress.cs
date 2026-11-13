// Connexion quotidienne (série + bouclier), missions du jour / de la semaine,
// Grand Lavage (prestige) + talents, Renaissance Arc-en-ciel (méga-prestige), mini-jeux
using System;
using System.Collections.Generic;
using System.Linq;

namespace PantyClicker.Core
{
    public partial class Game
    {
        // ================================================================ bienvenue
        public void Welcome()
        {
            if (S.welcomed) return;
            S.welcomed = true;
            AddGems(D.Cfg("welcomeGems", 50));
        }

        // ================================================================ connexion quotidienne
        public bool DailyAvailable => S.daily.last != DayKey();

        /// <summary>État de la série si on réclame aujourd'hui : (série après réclamation, bouclier utilisé, série perdue).</summary>
        public (int streak, bool shieldUsed, bool lost) DailyPreview()
        {
            var today = Clock().Date;
            if (string.IsNullOrEmpty(S.daily.last)) return (1, false, false);
            var last = DateTime.ParseExact(S.daily.last, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
            int gap = (int)(today - last.Date).TotalDays;
            if (gap <= 0) return (S.daily.streak, false, false);
            if (gap == 1) return (S.daily.streak + 1, false, false);
            if (gap == 2 && S.daily.shields > 0) return (S.daily.streak + 1, true, false);
            return (1, false, S.daily.streak > 1);
        }

        public int DailyReward(int streak)
        {
            var l = D.CfgList("daily.rewards");
            return l.Count == 0 ? 5 : (int)Json.ToD(l[(streak - 1) % l.Count]);
        }

        public string ClaimDaily()
        {
            if (!DailyAvailable) return null;
            var (streak, shield, lost) = DailyPreview();
            if (shield) S.daily.shields--;
            S.daily.streak = streak;
            S.daily.best = Math.Max(S.daily.best, streak);
            S.daily.last = DayKey();
            int gems = DailyReward(streak);
            AddGems(gems);
            var mats = FindMats((int)D.Cfg("materials.daily", 1), "daily");
            string msg = $"Jour {streak} : +{gems} Gemmes, {MatsText(mats)}";
            if (streak % 7 == 0)
            {
                AddBuff("jour7", "Semaine parfaite", D.Cfg("daily.day7BoostMult", 2), 1, D.Cfg("daily.day7BoostMin", 5) * 60);
                S.tickets += 1;
                msg += ", +1 ticket et production x2 !";
            }
            if (shield) msg += " (Bouclier utilisé : série sauvée !)";
            if (lost) msg += " (série perdue… reviens chaque jour !)";
            return msg;
        }

        // ================================================================ missions
        MissionSlot MakeSlot(MissionDef m, int diff) => new MissionSlot
        {
            id = m.id, diff = diff, start = StatValue(m.stat), n = m.n[Math.Min(diff, m.n.Length - 1)], reward = m.reward[Math.Min(diff, m.reward.Length - 1)]
        };

        void FillBoard(MissionBoard b, List<MissionDef> pool, string key)
        {
            b.key = key; b.bonus = false; b.list.Clear();
            var r = new Random(StableHash(key + S.startedAt));
            var picks = pool.OrderBy(_ => r.Next()).Take(3).ToList();
            for (int i = 0; i < picks.Count; i++) b.list.Add(MakeSlot(picks[i], i));
        }

        public void MissionsRefresh()
        {
            if (S.missions.key != DayKey()) FillBoard(S.missions, D.missions, DayKey());
            if (S.weekly.key != WeekKey()) FillBoard(S.weekly, D.weekly, "w" + WeekKey());
            CheckBoard(S.missions, D.missions, D.missionAllBonus, true);
            CheckBoard(S.weekly, D.weekly, D.weeklyAllBonus, false);
        }

        public MissionDef MissionDefOf(MissionSlot s) => D.missions.FirstOrDefault(m => m.id == s.id) ?? D.weekly.FirstOrDefault(m => m.id == s.id);
        public double MissionProgress(MissionSlot s) => Math.Max(0, StatValue(MissionDefOf(s)?.stat ?? "") - s.start);
        public string MissionText(MissionSlot s) => (MissionDefOf(s)?.text ?? s.id).Replace("{n}", Fmt.Num(s.n));

        void CheckBoard(MissionBoard b, List<MissionDef> defs, int allBonus, bool daily)
        {
            foreach (var s in b.list)
            {
                if (s.done || MissionProgress(s) < s.n) continue;
                s.done = true;
                AddGems(s.reward);
                if (daily) { S.Count("missions"); FindMats((int)D.Cfg("materials.mission", 1), "mission"); }
                Say($"Mission réussie : {MissionText(s)} (+{s.reward} Gemmes)");
            }
            if (!b.bonus && b.list.Count > 0 && b.list.All(s => s.done))
            {
                b.bonus = true;
                AddGems(allBonus);
                Say($"Toutes les missions {(daily ? "du jour" : "de la semaine")} ! +{allBonus} Gemmes");
            }
        }

        // ================================================================ Grand Lavage (prestige)
        double PetalsFor(double lifetime) => Math.Floor(Math.Pow(lifetime / D.Cfg("prestige.divisor", 1e9), 1.0 / 3));
        public double PendingPetals() => Math.Max(0, PetalsFor(S.prestige.lifetime) - S.prestige.petals);
        public bool CanPrestige => CurrentEra().id >= D.Cfg("prestige.minEra", 3) && PendingPetals() >= 1;
        public double NextPetalAt() => Math.Pow(PetalsFor(S.prestige.lifetime) + 1, 3) * D.Cfg("prestige.divisor", 1e9);
        public double FreePetals => S.prestige.petals - S.prestige.spent;

        /// <summary>Recommence la partie (Rubans, bâtiments, améliorations) en gardant skins, décors, Ville, succès, Gemmes, talents.</summary>
        public bool Prestige()
        {
            if (!CanPrestige) return false;
            double gain = PendingPetals();
            S.prestige.petals += gain;
            S.prestige.seasons++;
            S.coins = 0; S.totalEarned = 0; S.handEarned = 0;
            S.buildings.Clear(); S.upgrades.Clear(); S.buffs.Clear();
            S.maxEra = 1;
            AddGems(D.Cfg("prestige.seasonGems", 10));
            if (HasTalent("depart")) S.coins = 1000;
            if (HasTalent("couturieres")) S.buildings[D.buildings[0].id] = 10;
            cityDirty = true;
            Emit("reset");
            Say($"Grand Lavage ! +{gain} Pétales (production +{Fmt.Num(PetalBonusPct())} % pour toujours)");
            return true;
        }

        public bool TalentAvailable(TalentDef t) => !HasTalent(t.id) && (string.IsNullOrEmpty(t.need) || HasTalent(t.need));

        public bool BuyTalent(TalentDef t)
        {
            if (!TalentAvailable(t) || FreePetals < t.cost) return false;
            S.prestige.spent += t.cost;
            S.prestige.talents[t.id] = true;
            cityDirty = true;
            return true;
        }

        // ================================================================ Renaissance Arc-en-ciel (méga-prestige)
        public bool CanMega => CurrentEra().id >= D.Cfg("mega.minEra", 5) && S.prestige.seasons >= D.Cfg("mega.minSeasons", 3);
        public SkinDef NextMegaSkin() => D.skins.FirstOrDefault(s => s.mega == S.mega + 1);

        /// <summary>Repart VRAIMENT de zéro. Gardés : skins, décors, Ville (mise en page et décos), achats réels.</summary>
        public bool Mega()
        {
            if (!CanMega) return false;
            var keep = S;
            var sk = NextMegaSkin();
            var fresh = NewState();
            fresh.mega = keep.mega + 1;
            fresh.skins = keep.skins; fresh.bgs = keep.bgs; fresh.skin = keep.skin; fresh.bg = keep.bg;
            fresh.city = keep.city; fresh.city.hearts = 0; fresh.city.stored = 0;
            fresh.shop = keep.shop; fresh.daily = keep.daily; fresh.settings = keep.settings;
            fresh.welcomed = true; fresh.tuto = true; fresh.startedAt = keep.startedAt;
            fresh.gems = D.Cfg("mega.startGems", 50);
            if (sk != null) fresh.skins[sk.id] = 1;
            S = fresh;
            Normalize();
            cityDirty = true;
            Emit("reset");
            Say($"Renaissance Arc-en-ciel niveau {S.mega} ! Production +{MegaBonusPct()} % pour toujours" + (sk != null ? $", skin {sk.name} offert" : ""));
            return true;
        }

        // ================================================================ mini-jeux
        /// <summary>Fin d'une partie : stars 0 à 3. Renvoie le texte des gains.</summary>
        public string MiniGameResult(string game, int stars, int score)
        {
            stars = Math.Max(0, Math.Min(3, stars));
            if (S.mini.day != DayKey()) { S.mini.day = DayKey(); S.mini.gemsToday = 0; }
            S.mini.plays++; S.mini.stars += stars;
            S.Count("plays"); S.Count("stars", stars); S.Count("play_" + game);
            bool record = !S.mini.best.TryGetValue(game, out var best) || score > best;
            if (record) { S.mini.best[game] = score; S.Count("records"); }
            double coins = BaseCps() * D.Cfg("minigames.coinSecondsPerStar", 10) * stars + 10 * stars;
            Earn(coins);
            int cap = (int)D.Cfg("minigames.dailyGemCap", 60);
            int gems = Math.Min(cap - S.mini.gemsToday, (int)Math.Round(D.Cfg("minigames.gemsPerGame", 10) * stars / 3.0));
            gems = Math.Max(0, gems);
            S.mini.gemsToday += gems;
            AddGems(gems);
            var mats = stars > 0 ? FindMats(stars * (int)D.Cfg("materials.perStar", 1), "mini") : new Dictionary<string, int>();
            return $"{new string('*', stars)} +{Fmt.Num(coins)} Rubans" + (gems > 0 ? $", +{gems} Gemmes" : "") + (mats.Count > 0 ? ", " + MatsText(mats) : "") + (record ? " · Nouveau record !" : "");
        }
    }
}
