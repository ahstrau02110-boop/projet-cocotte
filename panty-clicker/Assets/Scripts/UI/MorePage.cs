// Page Plus : Atelier couture, commandes, Grand Lavage + talents, Renaissance, mini-jeux, collections, stats, options
using System.Linq;
using PantyClicker.Core;
using UnityEngine;
using UnityEngine.UI;

namespace PantyClicker.UI
{
    public class MorePage : Page
    {
        protected override void Build()
        {
            var c = UIKit.Scroll(Root, out _, 14, 16);
            var grid = UIKit.Grid(c, new Vector2(500, 230), 16, 2);
            Tile(grid, "Mini-jeux", "Gagne Rubans, Gemmes et tissus", Sprites.Icon("eclair"), () => MiniGames.Hub(ui));
            Tile(grid, "Atelier couture", $"{G.D.mats.Sum(m => G.Mat(m.id))} tissus en stock", Sprites.Icon("soie"), Atelier);
            Tile(grid, "Commandes", $"{G.S.orders.list.Count} en attente · réputation {G.S.orders.rep}", Sprites.Icon("cadeau"), Orders);
            Tile(grid, "Grand Lavage", G.CanPrestige ? $"+{Fmt.Num(G.PendingPetals())} Pétales prêts !" : $"{Fmt.Num(G.S.prestige.petals)} Pétales", Sprites.Icon("petales"), Prestige);
            Tile(grid, "Garde-robe", $"{G.S.skins.Count} / {G.D.skins.Count} Pantsu", Sprites.Skin(G.S.skin), () => GachaPage.Collection(ui, "skin"));
            Tile(grid, "Décors", $"{G.S.bgs.Count} / {G.D.backgrounds.Count}", Sprites.Icon("paillettes"), () => GachaPage.Collection(ui, "bg"));
            Tile(grid, "Succès", $"{G.S.achievements.Count} / {G.D.achievements.Count}", Sprites.Icon("trophee"), () => QuestPage.Achievements(ui));
            Tile(grid, "Statistiques", "Ta progression", Sprites.Icon("horloge"), Stats);
            Tile(grid, "Options", "Son, musique, sauvegarde", Sprites.Icon("rubans"), Options);
            if (G.CanMega || G.S.mega > 0)
                Tile(grid, "Renaissance", G.CanMega ? "Disponible !" : $"Niveau {G.S.mega}", Sprites.Skin(G.NextMegaSkin()?.id ?? "aurore"), Mega);
        }

        void Tile(Transform grid, string title, string sub, Sprite s, System.Action open)
        {
            var box = UIKit.Panel(grid, Color.white, "Tile");
            box.gameObject.AddComponent<Shadow>().effectColor = new Color(.6f, .3f, .5f, .18f);
            UIKit.Img(box.transform, s).rectTransform.At(new Vector2(0, .5f), new Vector2(16, 0), new Vector2(150, 150));
            var t = UIKit.Label(box.transform, $"{title}\n<size=24><color=#8a7590>{sub}</color></size>", 34, Theme.Ink, TextAnchor.MiddleLeft);
            t.rectTransform.Fill(180, 10, 14, 10);
            UIKit.Hit(box.transform, open);
        }

        // ------------------------------------------------------------ Atelier couture
        void Atelier()
        {
            var m = ui.Modal("Atelier couture", out var close, true, 1500);
            var stock = UIKit.HBox(m, 16, 0, TextAnchor.MiddleCenter); stock.Size(-1, 90);
            foreach (var k in G.D.mats)
            {
                UIKit.Img(stock, Sprites.Icon(k.id)).Size(70, 70);
                UIKit.Label(stock, G.Mat(k.id).ToString(), 30, Theme.Ink, TextAnchor.MiddleLeft).Size(90, 70);
            }
            UIKit.Para(m, "Les tissus tombent en tapotant, avec les Pantsu dorées, les missions, les mini-jeux et le cadeau du jour.", 22);
            foreach (var r in G.D.recipes)
            {
                var card = UIKit.Card(m, Color.white, 14, 6);
                var row = UIKit.HBox(card, 12, 0, TextAnchor.MiddleLeft); row.Size(-1, 120);
                var icon = r.result.S("type") == "skin" ? Sprites.Skin(r.result.S("id")) : Sprites.Icon("soie");
                UIKit.Img(row, icon).Size(100, 100);
                var col = UIKit.VBox(row, 2, 0, TextAnchor.MiddleLeft, false); col.Size(-1, 110, 1);
                UIKit.Label(col, r.name + (G.CurrentEra().id < r.era ? $" (ère {r.era})" : ""), 28, Theme.Ink, TextAnchor.MiddleLeft).Size(-1, 40);
                UIKit.Label(col, r.desc + "\n" + string.Join(" · ", r.cost.Select(kv => $"{kv.Value} {G.MatName(kv.Key)} ({G.Mat(kv.Key)})")), 20, Theme.InkSoft, TextAnchor.UpperLeft).Size(-1, 64);
                var rr = r;
                bool can = G.CanCraft(r);
                UIKit.Btn(row, "Coudre", () =>
                {
                    var res = G.Craft(rr);
                    if (res == null) { Sfx.Play("deny"); return; }
                    Sfx.Play("win"); G.Say(res); close(); Atelier();
                }, can ? Theme.Mint : Theme.Disabled, 28).Size(180, 90);
            }
        }

        // ------------------------------------------------------------ commandes
        void Orders()
        {
            var m = ui.Modal("Commandes", out var close);
            UIKit.Para(m, $"Réputation {G.S.orders.rep} : production +{Fmt.Num(G.RepPct())} %. Une nouvelle commande arrive toutes les {G.D.Cfg("orders.everyMin", 90)} min.", 24, Theme.Ink);
            if (G.S.orders.list.Count == 0) UIKit.Para(m, "Aucune commande pour l'instant. Reviens un peu plus tard !", 28);
            foreach (var o in G.S.orders.list.ToList())
            {
                var card = UIKit.Card(m, Color.white, 16, 6);
                UIKit.Label(card, $"{o.client} voudrait {o.what}", 26, Theme.Ink, TextAnchor.MiddleLeft).Size(-1, 70);
                UIKit.Label(card, $"{o.needMain} {G.MatName(o.main)} ({G.Mat(o.main)}) + {o.needSide} {G.MatName(o.side)} ({G.Mat(o.side)})", 24, Theme.InkSoft, TextAnchor.MiddleLeft).Size(-1, 36);
                UIKit.Label(card, $"Récompense : {o.gems} Gemmes, {o.hearts} Cœurs, +{o.rep} réputation · expire dans {Fmt.Duration(o.expires - G.Now)}", 22, Theme.Pink, TextAnchor.MiddleLeft).Size(-1, 60);
                var oo = o;
                UIKit.Btn(card, "Livrer", () =>
                {
                    var r = G.Deliver(oo);
                    if (r == null) { Sfx.Play("deny"); return; }
                    Sfx.Play("win"); G.Say(r); close(); Orders();
                }, G.CanDeliver(o) ? Theme.Mint : Theme.Disabled).Size(-1, 84);
            }
        }

        // ------------------------------------------------------------ Grand Lavage + talents
        void Prestige()
        {
            var m = ui.Modal("Grand Lavage", out var close, true, 1500);
            UIKit.Img(m, Sprites.Icon("petales")).Size(-1, 160);
            UIKit.Para(m, $"Tout repasse à la machine : Rubans, bâtiments et améliorations repartent de zéro. Tu gardes Pantsu, décors, Ville, succès, Gemmes et talents.\n\n" +
                $"Pétales : {Fmt.Num(G.S.prestige.petals)} (production +{Fmt.Num(G.PetalBonusPct())} % pour toujours) · à dépenser : {Fmt.Num(G.FreePetals)}\n" +
                (G.CanPrestige ? $"Un Grand Lavage maintenant rapporte <b>+{Fmt.Num(G.PendingPetals())} Pétales</b>."
                    : $"Disponible à l'ère {G.D.Cfg("prestige.minEra", 3)}. Prochain Pétale à {Fmt.Num(G.NextPetalAt())} Rubans produits (actuel : {Fmt.Num(G.S.prestige.lifetime)})."), 26, Theme.Ink);
            if (G.CanPrestige)
                UIKit.Btn(m, "Lancer le Grand Lavage", () => ui.Confirm("Grand Lavage", "Recommencer la partie contre des Pétales ?", "Laver !", () =>
                {
                    close();
                    if (G.Prestige()) { Sfx.Play("rare"); ui.ShowTab("clic"); }
                }), Theme.Pink, 32).Size(-1, 100);
            UIKit.Label(m, "Talents", 36, Theme.Ink, TextAnchor.MiddleLeft).Size(-1, 54);
            foreach (var t in G.D.talents)
            {
                bool has = G.HasTalent(t.id), avail = G.TalentAvailable(t);
                var card = UIKit.Card(m, has ? Theme.PinkSoft : Color.white, 12, 4);
                var row = UIKit.HBox(card, 12, 0, TextAnchor.MiddleLeft); row.Size(-1, 96);
                UIKit.Label(row, $"<b>{t.name}</b>\n<size=22>{t.desc}{(string.IsNullOrEmpty(t.need) || has ? "" : $" (requiert {G.D.talents.FirstOrDefault(x => x.id == t.need)?.name})")}</size>", 26, Theme.Ink, TextAnchor.MiddleLeft).Size(-1, 96, 1);
                var tt = t;
                UIKit.Btn(row, has ? "Acquis" : $"{t.cost} Pétale(s)", () =>
                {
                    if (G.BuyTalent(tt)) { Sfx.Play("buy"); close(); Prestige(); } else Sfx.Play("deny");
                }, has ? Theme.Disabled : avail && G.FreePetals >= t.cost ? Theme.Mint : Theme.Disabled, 24).Size(200, 84);
            }
        }

        void Mega()
        {
            var m = ui.Modal("Renaissance Arc-en-ciel", out var close);
            var sk = G.NextMegaSkin();
            if (sk != null) UIKit.Img(m, Sprites.Skin(sk.id)).Size(-1, 260);
            UIKit.Para(m, $"Repartir VRAIMENT de zéro (Pétales, talents, succès, Gemmes…). Gardés : Pantsu, décors, Ville.\n" +
                $"En échange : production +{G.D.Cfg("mega.bonusPct", 25)} % pour toujours" + (sk != null ? $" et la Pantsu exclusive {sk.name}." : ".") +
                $"\nNiveau actuel : {G.S.mega} (+{Fmt.Num(G.MegaBonusPct())} %)." +
                (G.CanMega ? "" : $"\nCondition : ère {G.D.Cfg("mega.minEra", 5)} et {G.D.Cfg("mega.minSeasons", 3)} Grands Lavages."), 26, Theme.Ink);
            if (G.CanMega)
                UIKit.Btn(m, "Renaître", () => ui.Confirm("Renaissance", "Tout recommencer pour toujours plus de mignon ?", "Renaître !", () =>
                {
                    close();
                    if (G.Mega()) { Sfx.Play("rare"); GameRunner.I.Save(); }
                }), Theme.Lilac).Size(-1, 100);
        }

        // ------------------------------------------------------------ stats et options
        void Stats()
        {
            var m = ui.Modal("Statistiques", out _);
            var s = G.S;
            UIKit.Para(m,
                $"Rubans produits (cette partie) : {Fmt.Num(s.totalEarned)}\nRubans produits (total) : {Fmt.Num(s.prestige.lifetime)}\n" +
                $"Production : {Fmt.Num(G.TotalCps())}/s · clic : {Fmt.Num(G.ClickValue())}\nTapotis : {Fmt.Int(s.totalClicks)} (dont {Fmt.Num(s.handEarned)} Rubans)\n" +
                $"Pantsu dorées : {s.Counter("golden")} · capsules : {s.gacha.pulls + s.gacha.bgPulls}\nGrands Lavages : {s.prestige.seasons} · Renaissance : {s.mega}\n" +
                $"Bonus : succès +{Fmt.Num(G.AchievementBonusPct())} % · collection +{Fmt.Num(G.CollectionBonusPct())} % · Ville +{Fmt.Num(G.CityHappyPct())} % · Pétales +{Fmt.Num(G.PetalBonusPct())} %",
                26, Theme.Ink);
        }

        void Options()
        {
            var m = ui.Modal("Options", out var close);
            var st = G.S.settings;
            UIKit.Btn(m, "Sons : " + (st.sound ? "oui" : "non"), () => { st.sound = !st.sound; close(); Options(); }, Theme.PinkSoft, 30, Theme.Ink).Size(-1, 90);
            UIKit.Btn(m, "Musique : " + (st.music ? "oui" : "non"), () => { st.music = !st.music; Sfx.ApplySettings(); close(); Options(); }, Theme.PinkSoft, 30, Theme.Ink).Size(-1, 90);
            UIKit.Btn(m, "Copier ma sauvegarde", () =>
            {
                GUIUtility.systemCopyBuffer = SaveSystem.Export(G);
                G.Say("Code de sauvegarde copié dans le presse-papiers.");
            }, Theme.Mint, 30).Size(-1, 90);
            UIKit.Btn(m, "Coller une sauvegarde", () =>
            {
                var s = SaveSystem.Import(GUIUtility.systemCopyBuffer ?? "");
                if (s == null) { G.Say("Aucun code valide dans le presse-papiers."); return; }
                ui.Confirm("Importer", "Remplacer la partie actuelle par celle du presse-papiers ?", "Importer", () => { close(); GameRunner.I.Replace(s); });
            }, Theme.Mint, 30).Size(-1, 90);
            UIKit.Btn(m, "Effacer la partie", () => ui.Confirm("Effacer", "Tout effacer définitivement ?", "Effacer", () =>
            {
                close(); SaveSystem.Delete(); GameRunner.I.Replace(null);
            }), Theme.Disabled, 30, Theme.Ink).Size(-1, 90);
            UIKit.Para(m, "Panty Clicker · police Fredoka (SIL OFL)", 20);
        }
    }
}
