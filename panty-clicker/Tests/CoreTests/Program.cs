// Tests rapides du moteur : dotnet run (depuis Tests/CoreTests)
using System;
using System.IO;
using System.Linq;
using PantyClicker.Core;

static class Program
{
    static int fails;
    static void Check(bool ok, string what) { Console.WriteLine((ok ? "OK   " : "FAIL ") + what); if (!ok) fails++; }

    static int Main()
    {
        string dir = Path.Combine(AppContext.BaseDirectory, "../../../../../Assets/Resources/Data");
        var data = GameData.Load(n => File.ReadAllText(Path.Combine(dir, n + ".json")));
        var now = new DateTime(2026, 11, 13, 12, 30, 0);
        var g = new Game(data, null, () => now) { Rng = new Random(1) };
        g.Welcome();
        Check(g.S.gems == 50, "gemmes de bienvenue");
        Check(data.upgrades.Count > 100 && data.achievements.Count > 150, $"contenu généré ({data.upgrades.Count} améliorations, {data.achievements.Count} succès)");

        // Clic et achat
        for (int i = 0; i < 20; i++) g.Click();
        Check(g.S.coins >= 20, "clics");
        var b0 = data.buildings[0];
        Check(g.Buy(b0, 1) && g.Owned(b0.id) == 1, "achat bâtiment");
        Check(g.CostOf(b0) == Math.Ceiling(15 * 1.15), "coût exponentiel");

        // Happy Hour à 12 h 30
        Check(g.InHappyHour() && g.HappyHourMult() == 2, "happy hour active à 12h30");
        // Événement du 13/11 : Festival des Érables
        Check(g.ActiveEvents().Any(e => e.id == "erable"), "événement Érables actif le 13/11");
        Check(g.EventSecondsLeft(g.ActiveEvents().First(e => e.id == "erable")) > 0, "compte à rebours événement");
        var (nx, sec) = g.NextEvent();
        Check(nx != null && nx.id == "blackfriday", "prochain événement = Black Friday");

        // Production
        g.Tick(1);
        Check(g.TotalCps() > 0, "production > 0");

        // Gacha
        g.S.gems = 1000;
        var res = g.Pull("skin", 10);
        Check(res != null && res.Count == 10 && res.Any(r => r.rarity != "commune"), "tirage x10 avec garantie rare");
        Check(g.BannerSkin() != null && g.BannerSecondsLeft() > 0, "bannière vedette + minuteur");

        // Ville
        g.S.city.hearts = 1000;
        Check(g.PlaceBuilding(0, 0, b0.id), "pose bâtiment en Ville");
        Check(!g.PlaceBuilding(1, 0, b0.id), "pas plus que possédés");
        var deco = data.decos.First(d => d.id == "sakura");
        Check(g.BuyDeco(deco) && g.PlaceDeco(1, 0, "sakura"), "achat + pose déco");
        Check(Math.Abs(g.AuraAt(0, 0) - deco.aura) < 1e-9, "aura de la déco voisine");
        double h1 = g.CityHappy();
        Check(g.LevelUp(0, 0) && g.CityHappy() > h1, "niveau du bâtiment augmente le Bonheur");
        Check(g.Expand() && g.CitySize == 6 && g.Cell(0, 0).kind == "b", "agrandissement conserve la grille");
        Check(g.Move(1, 0, 3, 3) && g.Cell(3, 3).id == "sakura", "déplacement");
        now = now.AddHours(1); g.Tick(1);
        Check(g.S.city.stored > 0 && g.Collect() >= 0, "coffre à cœurs");

        // Boutique
        var daily = g.DailyItems();
        Check(daily.Count == 6, "boutique du jour : 6 articles");
        g.S.gems = 500;
        var perm = data.permanent.First(p => p.id == "ticket");
        Check(g.BuyItem(perm, false) != null && g.S.tickets >= 1, "achat permanent");
        Check(g.StarterAvailable && g.StarterSecondsLeft() > 0, "pack de bienvenue limité");
        g.FlashItem(out var fl, out var fnext);
        Check(fnext > 0, "vente flash planifiée");
        Check(g.ClaimFreeGift() != null && g.ClaimFreeGift() == null, "cadeau gratuit puis attente");

        // Connexion
        Check(g.ClaimDaily() != null && !g.DailyAvailable, "bonus du jour");
        now = now.AddDays(2); g.S.daily.shields = 1;
        var pv = g.DailyPreview();
        Check(pv.shieldUsed && pv.streak == 2, "bouclier de série");
        now = now.AddDays(-2);

        // Missions
        g.MissionsRefresh();
        Check(g.S.missions.list.Count == 3 && g.S.weekly.list.Count == 3, "missions du jour et de la semaine");

        // Couture
        foreach (var m in data.mats) g.S.mats[m.id] = 100;
        var rec = data.recipes.First(r => r.id == "the");
        Check(g.Craft(rec) != null, "couture");

        // Prestige
        g.S.totalEarned = g.S.prestige.lifetime = 1e13;
        g.Tick(0.6);
        Check(g.CanPrestige && g.Prestige() && g.S.prestige.petals >= 1, "Grand Lavage");
        Check(g.Cell(0, 0).kind == "b" && !g.CellActive(0, 0), "bâtiment de Ville en sommeil après Grand Lavage");

        // Mini-jeu
        Check(g.MiniGameResult("memory", 3, 100).Contains("Rubans"), "récompense mini-jeu");

        // Sauvegarde aller-retour
        string json = Json.Serialize(g.S);
        var back = Json.Deserialize<GameState>(json);
        Check(back.city.cells.Count == 36 && back.skins.Count == g.S.skins.Count && back.prestige.petals == g.S.prestige.petals, "sauvegarde JSON aller-retour");
        var g2 = new Game(data, back, () => now);
        Check(Math.Abs(g2.CityHappy() - g.CityHappy()) < 1e-9, "état rechargé identique");

        // Hors-ligne
        var g3 = new Game(data, null, () => now);
        g3.S.buildings[b0.id] = 10;
        var off = g3.Offline(g3.Now - 3600 * 20);
        Check(off.sec == 8 * 3600 && off.gain > 0, "gains hors-ligne plafonnés à 8 h");

        // Simulation d'1 h de jeu « idle » avec achats auto : vérifie que la progression avance
        var sim = new Game(data, null, () => now) { Rng = new Random(3) };
        for (int t = 0; t < 3600; t++)
        {
            for (int c = 0; c < 3; c++) sim.Click();
            sim.Tick(1);
            var best = data.buildings.Where(b => sim.CostOf(b) <= sim.S.coins).OrderBy(b => sim.CostOf(b) / b.baseCps).FirstOrDefault();
            if (best != null) sim.Buy(best, 1);
            foreach (var u in sim.AvailableUpgrades()) sim.BuyUpgrade(u);
        }
        Console.WriteLine($"     sim 1 h : {Fmt.Num(sim.S.totalEarned)} Rubans, {Fmt.Num(sim.TotalCps())}/s, ère {sim.CurrentEra().name}, {sim.S.achievements.Count} succès");
        Check(sim.CurrentEra().id >= 2, "ère 2 atteinte en 1 h");

        Console.WriteLine(fails == 0 ? "\nTous les tests passent." : $"\n{fails} échec(s).");
        return fails == 0 ? 0 : 1;
    }
}
