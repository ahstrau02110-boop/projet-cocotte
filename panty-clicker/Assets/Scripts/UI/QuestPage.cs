// Page Quêtes : connexion quotidienne (série), missions du jour / de la semaine, événements, succès
using System;
using System.Collections.Generic;
using System.Linq;
using PantyClicker.Core;
using UnityEngine;
using UnityEngine.UI;

namespace PantyClicker.UI
{
    public class QuestPage : Page
    {
        readonly List<(Text t, Func<string> f)> live = new List<(Text, Func<string>)>();
        readonly List<(Image bar, MissionSlot s)> bars = new List<(Image, MissionSlot)>();
        string boardKey = "";

        void Live(Transform p, Func<string> f, int size = 26, Color? c = null)
        {
            var t = UIKit.Label(p, f(), size, c ?? Theme.Pink, TextAnchor.MiddleLeft);
            t.Size(-1, size + 14);
            live.Add((t, f));
        }

        protected override void Build()
        {
            live.Clear(); bars.Clear();
            G.MissionsRefresh();
            boardKey = G.S.missions.key + G.S.weekly.key;
            var c = UIKit.Scroll(Root, out _, 16, 16);

            // ---- connexion quotidienne
            var dc = UIKit.Card(c, Color.white, 18, 10);
            UIKit.Label(dc, "Cadeau de connexion", 36, Theme.Ink, TextAnchor.MiddleLeft).Size(-1, 50);
            var (streak, shield, lost) = G.DailyPreview();
            int shown = G.DailyAvailable ? streak : G.S.daily.streak;
            var track = UIKit.HBox(dc, 8, 0, TextAnchor.MiddleCenter); track.Size(-1, 150);
            track.GetComponent<HorizontalLayoutGroup>().childForceExpandWidth = true;
            int weekStart = ((Math.Max(1, shown) - 1) / 7) * 7;
            for (int d = 1; d <= 7; d++)
            {
                int day = weekStart + d;
                bool got = day < shown || (day == shown && !G.DailyAvailable);
                bool today = day == shown && G.DailyAvailable;
                var cell = UIKit.Panel(track, got ? Theme.PinkSoft : today ? Theme.Hex("#fff3c4") : Theme.PinkPale, "Day");
                cell.Size(-1, 146, 1);
                if (today) cell.gameObject.AddComponent<Pulse>().amp = .05f;
                UIKit.Label(cell.transform, "J" + day, 22, Theme.InkSoft).rectTransform.At(new Vector2(.5f, 1), new Vector2(0, -4), new Vector2(120, 30));
                UIKit.Img(cell.transform, Sprites.Icon(d == 7 ? "cadeau" : "gemmes")).rectTransform.At(new Vector2(.5f, .5f), new Vector2(0, 4), new Vector2(64, 64));
                UIKit.Label(cell.transform, got ? "OK" : "+" + G.DailyReward(day), 24, Theme.Ink).rectTransform.At(new Vector2(.5f, 0), new Vector2(0, 4), new Vector2(120, 32));
            }
            UIKit.Para(dc, $"Série : {G.S.daily.streak} jour(s) · record {G.S.daily.best} · Boucliers : {G.S.daily.shields}" +
                (G.DailyAvailable && lost ? "\nTa série va repartir à 1… Un Bouclier (Boutique) la protège la prochaine fois !" : "") +
                (G.DailyAvailable && shield ? "\nTu as raté un jour : ton Bouclier va sauver ta série !" : ""), 24, Theme.Ink);
            if (G.DailyAvailable)
                UIKit.Btn(dc, "Récupérer", () => { var r = G.ClaimDaily(); Sfx.Play("win"); G.Say(r); Rebuild(); }, Theme.Pink, 34).Size(-1, 100);
            else Live(dc, () => "Prochain cadeau dans " + Fmt.Duration(G.SecondsToMidnight()) + " · reviens demain pour ne pas casser ta série !", 24);

            // ---- missions
            Board(c, "Missions du jour", G.S.missions, () => "Nouvelles missions dans " + Fmt.Duration(G.SecondsToMidnight()), G.D.missionAllBonus);
            Board(c, "Missions de la semaine", G.S.weekly, () =>
            {
                var now = G.Clock(); int diff = (7 - ((int)now.DayOfWeek + 6) % 7);
                return "Fin dans " + Fmt.Duration((now.Date.AddDays(diff) - now).TotalSeconds);
            }, G.D.weeklyAllBonus);

            // ---- événements
            var ec = UIKit.Card(c, Color.white, 18, 8);
            UIKit.Label(ec, "Événements", 36, Theme.Ink, TextAnchor.MiddleLeft).Size(-1, 50);
            var act = G.ActiveEvents();
            if (act.Count == 0) UIKit.Para(ec, "Aucun événement en cours.", 26);
            foreach (var e in act)
            {
                var ev = e;
                UIKit.Label(ec, e.name, 30, Theme.Pink, TextAnchor.MiddleLeft).Size(-1, 44);
                UIKit.Para(ec, e.desc + (e.bonusPct > 0 ? $" Production +{e.bonusPct} %." : ""), 24, Theme.Ink);
                Live(ec, () => "Se termine dans " + Fmt.Duration(G.EventSecondsLeft(ev)), 24);
            }
            var (nx, sec) = G.NextEvent();
            if (nx != null) UIKit.Para(ec, $"Bientôt : {nx.name} dans {Fmt.Duration(sec)}", 24, Theme.Lilac);
            Live(ec, () => G.InHappyHour() ? $"Happy Hour en cours : encore {Fmt.Duration(G.HappyHourSeconds())}" : $"Prochaine Happy Hour (production x2) dans {Fmt.Duration(G.HappyHourSeconds())}", 24, Theme.Gold);

            UIKit.Btn(c, $"Succès ({G.S.achievements.Count}/{G.D.achievements.Count}) · +{Fmt.Num(G.AchievementBonusPct())} % production", () => Achievements(ui), Theme.Lilac, 30).Size(-1, 100);
        }

        void Board(Transform c, string title, MissionBoard b, Func<string> timer, int bonus)
        {
            var card = UIKit.Card(c, Color.white, 18, 8);
            UIKit.Label(card, title, 36, Theme.Ink, TextAnchor.MiddleLeft).Size(-1, 50);
            Live(card, timer, 24);
            foreach (var s in b.list)
            {
                var row = UIKit.HBox(card, 12, 0, TextAnchor.MiddleLeft); row.Size(-1, 96);
                UIKit.Img(row, Sprites.Icon(s.done ? "trophee" : "paillettes")).Size(70, 70);
                var col = UIKit.VBox(row, 4, 0, TextAnchor.MiddleLeft, false); col.Size(-1, 90, 1);
                UIKit.Label(col, G.MissionText(s) + $"  <color=#b36bff>+{s.reward} G</color>", 26, s.done ? Theme.InkSoft : Theme.Ink, TextAnchor.MiddleLeft).Size(-1, 40);
                var bar = UIKit.Bar(col, Theme.PinkPale, s.done ? Theme.Mint : Theme.Pink, 22);
                var ss = s;
                bars.Add((bar, ss));
            }
            UIKit.Para(card, b.bonus ? "Bonus des 3 missions récupéré !" : $"Les 3 missions réussies : +{bonus} Gemmes bonus", 24, b.bonus ? Theme.Mint : Theme.InkSoft);
        }

        public override void Refresh()
        {
            if (G.S.missions.key + G.S.weekly.key != boardKey) { Rebuild(); return; }
            foreach (var (t, f) in live) if (t != null) t.text = f();
            foreach (var (bar, s) in bars) UIKit.SetBar(bar, s.done ? 1 : (float)(G.MissionProgress(s) / s.n));
        }

        public static void Achievements(MainUI ui)
        {
            var G = ui.G;
            var m = ui.Modal("Succès", out _, true, 1500);
            UIKit.Para(m, $"{G.S.achievements.Count} / {G.D.achievements.Count} · chaque succès : +{G.D.Cfg("achievements.prodBonusPct", .4)} % de production", 26, Theme.Ink);
            foreach (var a in G.D.achievements.OrderByDescending(a => G.S.achievements.ContainsKey(a.id)).Take(250))
            {
                bool got = G.S.achievements.ContainsKey(a.id);
                var row = UIKit.HBox(m, 12, 0, TextAnchor.MiddleLeft); row.Size(-1, 70);
                UIKit.Img(row, Sprites.Icon("trophee"), got ? Color.white : new Color(1, 1, 1, .25f)).Size(60, 60);
                UIKit.Label(row, $"<b>{a.name}</b>\n<size=20>{a.desc}</size>", 24, got ? Theme.Ink : Theme.InkSoft, TextAnchor.MiddleLeft).Size(-1, 70, 1);
            }
        }
    }
}
