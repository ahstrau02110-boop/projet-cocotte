// Page Ville : city builder idle personnalisable (poser, décorer, peindre le sol, déplacer, améliorer)
using System.Collections.Generic;
using System.Linq;
using PantyClicker.Core;
using UnityEngine;
using UnityEngine.UI;

namespace PantyClicker.UI
{
    public class CityPage : Page
    {
        enum Mode { Voir, Batir, Deco, Sol, Deplacer }
        Mode mode = Mode.Voir;
        string selected = "";
        int moveFrom = -1;
        RectTransform gridRoot, palette;
        Text nameTxt, happyTxt, chestTxt, heartsTxt, hintTxt;
        Image chestBar;
        Button collectBtn, expandBtn;
        readonly Dictionary<Mode, Image> modeBtns = new Dictionary<Mode, Image>();
        readonly List<(Image ground, Image obj, Text badge, Image sel)> cells = new List<(Image, Image, Text, Image)>();

        protected override void Build()
        {
            cells.Clear(); modeBtns.Clear();
            var content = UIKit.Scroll(Root, out _, 12, 14);

            // ---- en-tête
            var head = UIKit.Card(content, new Color(1, 1, 1, .95f), 16, 8);
            var r1 = UIKit.HBox(head, 10, 0, TextAnchor.MiddleLeft); r1.Size(-1, 70);
            nameTxt = UIKit.Label(r1, "", 40, Theme.Ink, TextAnchor.MiddleLeft); nameTxt.Size(-1, 70, 1);
            UIKit.Btn(r1, "Renommer", Rename, Theme.PinkSoft, 26, Theme.Ink).Size(200, 64);
            happyTxt = UIKit.Label(head, "", 28, Theme.InkSoft, TextAnchor.MiddleLeft); happyTxt.Size(-1, 44);
            var r2 = UIKit.HBox(head, 12, 0, TextAnchor.MiddleLeft); r2.Size(-1, 84);
            UIKit.Img(r2, Sprites.Icon("coeurs")).Size(70, 70);
            var chestCol = UIKit.VBox(r2, 4, 0, TextAnchor.MiddleLeft, false); chestCol.Size(-1, 80, 1);
            chestTxt = UIKit.Label(chestCol, "", 24, Theme.Ink, TextAnchor.MiddleLeft); chestTxt.Size(-1, 36);
            chestBar = UIKit.Bar(chestCol, Theme.PinkPale, Theme.Pink, 26);
            collectBtn = UIKit.Btn(r2, "Vider", Collect, Theme.Pink, 30); collectBtn.Size(190, 76);
            heartsTxt = UIKit.Label(head, "", 24, Theme.InkSoft, TextAnchor.MiddleLeft); heartsTxt.Size(-1, 36);

            // ---- modes
            var modes = UIKit.HBox(content, 8, 0, TextAnchor.MiddleCenter); modes.Size(-1, 84);
            modes.GetComponent<HorizontalLayoutGroup>().childForceExpandWidth = true;
            foreach (var (m, label) in new[] { (Mode.Voir, "Voir"), (Mode.Batir, "Bâtir"), (Mode.Deco, "Décos"), (Mode.Sol, "Sol"), (Mode.Deplacer, "Déplacer") })
            {
                var mm = m;
                var b = UIKit.Btn(modes, label, () => SetMode(mm), Theme.PinkPale, 30, Theme.Ink);
                b.Size(-1, 80, 1);
                modeBtns[m] = b.GetComponent<Image>();
            }
            hintTxt = UIKit.Label(content, "", 26, Theme.Ink, TextAnchor.MiddleCenter); hintTxt.Size(-1, 40);

            // ---- grille
            var gridCard = UIKit.Panel(content, new Color(1, 1, 1, .6f), "GridCard");
            gridCard.Size(-1, 1040);
            gridRoot = gridCard.rectTransform;
            BuildGrid();

            // ---- palette
            var palCard = UIKit.Card(content, Color.white, 12, 8);
            palette = UIKit.HBox(palCard, 10, 0, TextAnchor.MiddleLeft);
            palette.Size(-1, 210);
            var row = UIKit.HBox(content, 12, 0, TextAnchor.MiddleCenter); row.Size(-1, 96);
            expandBtn = UIKit.Btn(row, "", Expand, Theme.Lilac, 28); expandBtn.Size(620, 90);
            SetMode(mode);
        }

        void BuildGrid()
        {
            UIKit.Clear(gridRoot);
            cells.Clear();
            int n = G.CitySize;
            float pad = 20, cell = (1040 - pad * 2) / n;
            for (int y = 0; y < n; y++)
                for (int x = 0; x < n; x++)
                {
                    int cx = x, cy = y;
                    var g = UIKit.Img(gridRoot, null, Color.white, false, $"C{x}-{y}");
                    g.preserveAspect = false;
                    g.raycastTarget = true;
                    var rt = g.rectTransform;
                    rt.anchorMin = rt.anchorMax = rt.pivot = new Vector2(0, 1);
                    rt.anchoredPosition = new Vector2(pad + x * cell, -pad - y * cell);
                    rt.sizeDelta = new Vector2(cell - 2, cell - 2);
                    var btn = g.gameObject.AddComponent<Button>();
                    btn.transition = Selectable.Transition.None;
                    btn.onClick.AddListener(() => OnCell(cx, cy));
                    var sel = UIKit.Img(rt, UIKit.Round, new Color(1, .44f, .63f, .45f), true, "Sel");
                    sel.rectTransform.Fill();
                    sel.enabled = false;
                    var obj = UIKit.Img(rt, null);
                    obj.rectTransform.Fill(-6, -14, -6, 2);
                    var badge = UIKit.Label(rt, "", Mathf.Max(16, (int)(cell * .2f)), Theme.Ink, TextAnchor.LowerRight);
                    badge.rectTransform.Fill(2, 2, 4, 0);
                    var o = badge.gameObject.AddComponent<Outline>();
                    o.effectColor = Color.white; o.effectDistance = new Vector2(2, -2);
                    cells.Add((g, obj, badge, sel));
                }
            DrawCells();
        }

        void DrawCells()
        {
            int n = G.CitySize;
            for (int i = 0; i < cells.Count && i < n * n; i++)
            {
                int x = i % n, y = i / n;
                var c = G.Cell(x, y);
                var v = cells[i];
                v.ground.sprite = Sprites.Ground(c.g);
                v.obj.enabled = c.kind != "";
                v.obj.sprite = c.kind == "b" ? Sprites.Building(c.id) : c.kind == "d" ? Sprites.Deco(c.id) : null;
                bool active = G.CellActive(x, y);
                v.obj.color = active ? Color.white : new Color(.6f, .6f, .7f, .7f);
                v.badge.text = c.kind == "b" ? (active ? "Nv" + c.lvl : "zzz") : "";
                v.sel.enabled = moveFrom == i;
            }
        }

        void SetMode(Mode m)
        {
            mode = m; moveFrom = -1;
            foreach (var kv in modeBtns) kv.Value.color = kv.Key == m ? Theme.Pink : Theme.PinkPale;
            foreach (var kv in modeBtns) kv.Value.GetComponentInChildren<Text>().color = kv.Key == m ? Color.white : Theme.Ink;
            FillPalette();
            DrawCells();
        }

        void FillPalette()
        {
            UIKit.Clear(palette);
            int era = G.CurrentEra().id;
            switch (mode)
            {
                case Mode.Voir:
                    hintTxt.text = "Touche une case pour voir ses infos, l'améliorer ou la retirer.";
                    PalText("Les décos donnent une aura aux bâtiments voisins (haut, bas, gauche, droite) : place-les malin !");
                    break;
                case Mode.Batir:
                    hintTxt.text = "Choisis un bâtiment, puis une case libre.";
                    var avail = G.D.buildings.Where(b => G.Owned(b.id) - G.PlacedCount(b.id) > 0).ToList();
                    if (avail.Count == 0) { PalText("Achète des bâtiments dans l'onglet Clic pour les poser ici (+2 % de production par bâtiment posé et par niveau)."); break; }
                    if (!avail.Any(b => b.id == selected)) selected = avail[0].id;
                    foreach (var b in avail) PalItem(b.id, Sprites.Building(b.id), "x" + (G.Owned(b.id) - G.PlacedCount(b.id)), null);
                    break;
                case Mode.Deco:
                    hintTxt.text = "Choisis une déco (achat en Cœurs), puis une case libre.";
                    var decos = G.D.decos.Where(d => d.era <= era || G.DecoInv(d.id) > 0).ToList();
                    if (!decos.Any(d => d.id == selected)) selected = decos.FirstOrDefault()?.id ?? "";
                    foreach (var d in decos)
                    {
                        var dd = d;
                        PalItem(d.id, Sprites.Deco(d.id), $"x{G.DecoInv(d.id)}", () =>
                        {
                            if (G.BuyDeco(dd)) { Sfx.Play("buy"); FillPalette(); } else Sfx.Play("deny");
                        }, $"{d.cost}");
                    }
                    break;
                case Mode.Sol:
                    hintTxt.text = "Choisis un sol, puis peins les cases (coût en Cœurs).";
                    var gs = G.D.grounds.Where(g => g.era <= era).ToList();
                    if (!gs.Any(g => g.id == selected)) selected = gs[0].id;
                    foreach (var g in gs) PalItem(g.id, Sprites.Ground(g.id), g.cost == 0 ? "gratuit" : g.cost + " Cœurs", null);
                    break;
                case Mode.Deplacer:
                    hintTxt.text = "Touche l'élément à déplacer, puis sa nouvelle case.";
                    PalText("Le niveau des bâtiments est conservé quand on les déplace.");
                    break;
            }
        }

        void PalText(string t) => UIKit.Para(palette, t, 28, Theme.InkSoft).Size(-1, 200, 1);

        void PalItem(string id, Sprite s, string sub, System.Action buy, string buyLabel = null)
        {
            var box = UIKit.Panel(palette, id == selected ? Theme.PinkSoft : Theme.PinkPale, "Item");
            box.Size(170, 200);
            UIKit.Img(box.transform, s).rectTransform.At(new Vector2(.5f, 1), new Vector2(0, -6), new Vector2(120, 120));
            var t = UIKit.Label(box.transform, sub, 22, Theme.Ink);
            t.rectTransform.At(new Vector2(.5f, 0), new Vector2(0, buy != null ? 60 : 12), new Vector2(160, 34));
            UIKit.Hit(box.transform, () => { selected = id; FillPalette(); });
            if (buy != null)
            {
                var b = UIKit.Btn(box.transform, "+ " + buyLabel, buy, Theme.Mint, 22);
                ((RectTransform)b.transform).At(new Vector2(.5f, 0), new Vector2(0, 6), new Vector2(150, 50));
            }
        }

        void OnCell(int x, int y)
        {
            var c = G.Cell(x, y);
            bool ok = false;
            switch (mode)
            {
                case Mode.Voir: if (c.kind != "") Info(x, y); return;
                case Mode.Batir: ok = G.PlaceBuilding(x, y, selected); if (!ok && c.g == "eau") ui.Runner.G.Say("On ne construit pas sur le lac !"); break;
                case Mode.Deco:
                    ok = G.PlaceDeco(x, y, selected);
                    if (!ok && c.kind == "" && G.DecoInv(selected) <= 0) G.Say("Achète d'abord cette déco (bouton +).");
                    break;
                case Mode.Sol: ok = G.Paint(x, y, selected); break;
                case Mode.Deplacer:
                    int idx = y * G.CitySize + x;
                    if (moveFrom < 0) { if (c.kind != "") { moveFrom = idx; ok = true; } }
                    else { ok = G.Move(moveFrom % G.CitySize, moveFrom / G.CitySize, x, y); moveFrom = -1; }
                    break;
            }
            Sfx.Play(ok ? "pop" : "deny");
            if (ok) Anim.Punch(cells[y * G.CitySize + x].ground.transform, .15f);
            FillPalette();
            DrawCells();
        }

        void Info(int x, int y)
        {
            var c = G.Cell(x, y);
            string title = c.kind == "b" ? G.D.Building(c.id)?.name : G.D.Deco(c.id)?.name;
            var m = ui.Modal(title ?? "", out var close);
            UIKit.Img(m, c.kind == "b" ? Sprites.Building(c.id) : Sprites.Deco(c.id)).Size(-1, 260);
            if (c.kind == "b")
            {
                bool active = G.CellActive(x, y);
                UIKit.Para(m, active
                    ? $"Niveau {c.lvl} · Bonheur {Fmt.Num(G.CellHappy(x, y))} (aura des décos voisines +{G.AuraAt(x, y)} %)\nProduction de {G.D.Building(c.id)?.name} +{G.D.city.D("boostPct", 2) * c.lvl} %"
                    : "Ce bâtiment dort : tu n'en possèdes plus assez depuis le Grand Lavage. Rachète-le dans l'onglet Clic pour le réveiller.", 28, Theme.Ink);
                if (c.lvl < G.LevelMax)
                {
                    double cost = G.LevelCost(c);
                    UIKit.Btn(m, $"Niveau {c.lvl + 1} : {Fmt.Num(cost)} Cœurs", () =>
                    {
                        if (G.LevelUp(x, y)) { Sfx.Play("buy"); close(); Info(x, y); DrawCells(); } else Sfx.Play("deny");
                    }, Theme.Mint).Size(-1, 96);
                }
            }
            else
            {
                var d = G.D.Deco(c.id);
                UIKit.Para(m, $"Bonheur +{d?.happy} · aura +{d?.aura} % aux bâtiments voisins", 28, Theme.Ink);
            }
            UIKit.Btn(m, "Ranger", () => { G.Remove(x, y); close(); FillPalette(); DrawCells(); }, Theme.Disabled, 30, Theme.Ink).Size(-1, 90);
        }

        void Collect()
        {
            int n = G.Collect();
            if (n > 0) { Sfx.Play("coin"); ui.Burst(Vector2.zero, 10); G.Say($"+{n} Cœurs"); }
            else Sfx.Play("deny");
        }

        void Expand()
        {
            if (G.Expand()) { Sfx.Play("rare"); BuildGrid(); }
            else Sfx.Play("deny");
        }

        void Rename()
        {
            var m = ui.Modal("Nom de ta ville", out var close);
            var box = UIKit.Panel(m, Color.white, "Input");
            box.Size(-1, 100);
            var input = box.gameObject.AddComponent<InputField>();
            var t = UIKit.Label(box.transform, "", 36, Theme.Ink, TextAnchor.MiddleLeft);
            t.rectTransform.Fill(20, 0, 20, 0);
            t.supportRichText = false;
            input.textComponent = t;
            input.characterLimit = 24;
            input.text = G.S.city.name;
            UIKit.Btn(m, "Valider", () => { G.RenameCity(input.text); close(); }).Size(-1, 96);
        }

        public override void Refresh()
        {
            if (nameTxt == null) return;
            if (cells.Count != G.CitySize * G.CitySize) BuildGrid();
            nameTxt.text = G.S.city.name;
            happyTxt.text = $"Bonheur {Fmt.Num(G.CityHappy())} → production +{Fmt.Num(G.CityHappyPct())} %";
            double cap = G.StorageCap(), sec = G.SecondsToFull();
            chestTxt.text = cap <= 0 ? "Coffre à Cœurs : pose des bâtiments pour le remplir"
                : G.StorageFull ? $"Coffre PLEIN : {Fmt.Num(G.S.city.stored)} / {Fmt.Num(cap)} (vide-le !)"
                : $"Coffre : {Fmt.Num(G.S.city.stored)} / {Fmt.Num(cap)} · plein dans {Fmt.Duration(sec)}";
            UIKit.SetBar(chestBar, cap <= 0 ? 0 : (float)(G.S.city.stored / cap));
            collectBtn.GetComponent<Image>().color = G.S.city.stored >= 1 ? Theme.Pink : Theme.Disabled;
            heartsTxt.text = $"{Fmt.Num(G.S.city.hearts)} Cœurs · {Fmt.Num(G.HeartsPerMin())}/min";
            double ec = G.ExpandCost();
            expandBtn.BtnLabel().text = ec < 0 ? "Ville à taille maximale" : $"Agrandir ({G.CitySize + 1}x{G.CitySize + 1}) : {Fmt.Num(ec)} Cœurs";
            expandBtn.GetComponent<Image>().color = ec >= 0 && G.S.city.hearts >= ec ? Theme.Lilac : Theme.Disabled;
        }
    }
}
