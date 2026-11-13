// Page Clic : la grosse Pantsu, ère, bonus actifs, bâtiments et améliorations
using System.Collections.Generic;
using System.Linq;
using PantyClicker.Core;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace PantyClicker.UI
{
    public class ClickPage : Page
    {
        RectTransform stage, list, pantyRt;
        Image pantyImg;
        Text eraTxt, buffTxt, clickTxt;
        Image eraBar;
        bool showUpgrades;
        readonly List<(BuildingDef b, Text name, Text info, Button buy, Text price, GameObject lockMask)> rows = new List<(BuildingDef, Text, Text, Button, Text, GameObject)>();
        readonly List<(UpgradeDef u, Button btn)> upRows = new List<(UpgradeDef, Button)>();
        Text tabB, tabU;
        readonly Dictionary<int, Text> qtyLabels = new Dictionary<int, Text>();

        protected override void Build()
        {
            rows.Clear(); upRows.Clear(); qtyLabels.Clear();
            // ---- scène du haut
            stage = UIKit.Rect("Stage", Root);
            stage.anchorMin = new Vector2(0, .5f); stage.anchorMax = Vector2.one;
            stage.offsetMin = new Vector2(0, -20); stage.offsetMax = Vector2.zero;

            var eraCard = UIKit.Panel(stage, new Color(1, 1, 1, .85f), "Era").rectTransform;
            eraCard.At(new Vector2(.5f, 1), new Vector2(0, -6), new Vector2(1000, 92));
            eraTxt = UIKit.Label(eraCard, "", 28, Theme.Ink, TextAnchor.UpperCenter);
            eraTxt.rectTransform.Fill(12, 8, 12, 30);
            eraBar = UIKit.Bar(eraCard, Theme.PinkPale, Theme.Pink, 20);
            ((RectTransform)eraBar.transform.parent).At(new Vector2(.5f, 0), new Vector2(0, 10), new Vector2(940, 20));

            // Rayons derrière la Pantsu
            var rays = UIKit.Img(stage, Sprites.Icon("paillettes"), new Color(1, 1, 1, .35f));
            rays.rectTransform.At(new Vector2(.5f, .5f), new Vector2(0, -10), new Vector2(620, 620));
            rays.gameObject.AddComponent<Spin>().speed = 8;

            pantyImg = UIKit.Img(stage, Sprites.Skin(G.S.skin), null, false, "Panty");
            pantyImg.raycastTarget = true;
            pantyRt = pantyImg.rectTransform;
            pantyRt.At(new Vector2(.5f, .5f), new Vector2(0, 0), new Vector2(500, 500));
            pantyImg.gameObject.AddComponent<Bob>().amp = 12;
            var tap = pantyImg.gameObject.AddComponent<TapZone>();
            tap.onTap = OnTap;

            clickTxt = UIKit.Label(stage, "", 26, Theme.Ink, TextAnchor.MiddleCenter);
            clickTxt.rectTransform.At(new Vector2(.5f, 0), new Vector2(0, 66), new Vector2(900, 40));
            buffTxt = UIKit.Label(stage, "", 26, Theme.Pink, TextAnchor.MiddleCenter);
            buffTxt.rectTransform.At(new Vector2(.5f, 0), new Vector2(0, 20), new Vector2(1000, 44));

            // ---- liste du bas
            var bottom = UIKit.Panel(Root, new Color(1, 1, 1, .93f), "Bottom").rectTransform;
            bottom.anchorMin = Vector2.zero; bottom.anchorMax = new Vector2(1, .5f);
            bottom.offsetMin = new Vector2(10, 0); bottom.offsetMax = new Vector2(-10, -26);

            var head = UIKit.HBox(bottom, 8, 0, TextAnchor.MiddleLeft);
            head.At(new Vector2(.5f, 1), new Vector2(0, -10), new Vector2(1030, 84));
            var bb = UIKit.Btn(head, "Bâtiments", () => { showUpgrades = false; FillList(); }, Theme.Pink, 30); bb.Size(250, 76);
            tabB = bb.BtnLabel();
            var bu = UIKit.Btn(head, "Améliorations", () => { showUpgrades = true; FillList(); }, Theme.PinkSoft, 30, Theme.Ink); bu.Size(270, 76);
            tabU = bu.BtnLabel();
            UIKit.Rect("Space", head).Size(-1, 10, 1);
            foreach (int q in new[] { 1, 10, 100, -1 })
            {
                int qq = q;
                var b = UIKit.Btn(head, q == -1 ? "Max" : "x" + q, () => { G.S.settings.buyQty = qq; FillList(); }, Theme.PinkPale, 28, Theme.Ink);
                b.Size(112, 76);
                qtyLabels[q] = b.BtnLabel();
            }
            var area = UIKit.Rect("ListArea", bottom).Fill(0, 100, 0, 0);
            list = UIKit.Scroll(area, out _, 10, 12);
            FillList();
        }

        void OnTap(Vector2 local)
        {
            double v = G.Click();
            Anim.Punch(pantyRt, .1f);
            Sfx.Play("pop", Random.Range(.92f, 1.12f));
            var t = UIKit.Label(stage, "+" + Fmt.Num(v), 44, Theme.Pink);
            t.fontStyle = FontStyle.Bold;
            var o = t.gameObject.AddComponent<Outline>();
            o.effectColor = Color.white; o.effectDistance = new Vector2(3, -3);
            t.rectTransform.At(new Vector2(.5f, .5f), local + new Vector2(0, -10) + pantyRt.anchoredPosition, new Vector2(400, 70));
            Anim.FloatUp(t.rectTransform, 220, .9f);
            if (Random.value < .25f) ui.Burst(local + pantyRt.anchoredPosition, 2, stage);
        }

        int Qty(BuildingDef b)
        {
            int q = G.S.settings.buyQty;
            return q == -1 ? Mathf.Max(1, G.MaxAffordable(b)) : q;
        }

        void FillList()
        {
            UIKit.Clear(list);
            rows.Clear(); upRows.Clear();
            tabB.transform.parent.GetComponent<Image>().color = showUpgrades ? Theme.PinkSoft : Theme.Pink;
            tabB.color = showUpgrades ? Theme.Ink : Color.white;
            tabU.transform.parent.GetComponent<Image>().color = showUpgrades ? Theme.Pink : Theme.PinkSoft;
            tabU.color = showUpgrades ? Color.white : Theme.Ink;
            foreach (var kv in qtyLabels)
                kv.Value.transform.parent.GetComponent<Image>().color = kv.Key == G.S.settings.buyQty ? Theme.PinkSoft : Theme.PinkPale;

            if (showUpgrades) { FillUpgrades(); return; }
            int era = G.CurrentEra().id;
            foreach (var b in G.D.buildings)
            {
                if (b.era > era + 1) break;
                var row = UIKit.Card(list, Color.white, 10, 0);
                var hb = UIKit.HBox(row, 14, 0, TextAnchor.MiddleLeft);
                hb.Size(-1, 130);
                var ic = UIKit.Img(hb, Sprites.Building(b.id)); ic.Size(120, 120);
                var mid = UIKit.VBox(hb, 2, 0, TextAnchor.MiddleLeft, false); mid.Size(-1, 120, 1);
                var name = UIKit.Label(mid, b.name, 32, Theme.Ink, TextAnchor.MiddleLeft); name.Size(-1, 46);
                var info = UIKit.Label(mid, "", 24, Theme.InkSoft, TextAnchor.UpperLeft); info.Size(-1, 70);
                var buy = UIKit.Btn(hb, "", () => BuyB(b), Theme.Mint, 28);
                buy.Size(250, 110);
                var price = buy.BtnLabel();
                price.text = "";
                price.resizeTextForBestFit = true;
                GameObject lockMask = null;
                if (b.era > era)
                {
                    var m = UIKit.Panel(row, new Color(1, 1, 1, .85f), "Lock");
                    m.gameObject.AddComponent<LayoutElement>().ignoreLayout = true;
                    m.rectTransform.Fill();
                    var lt = UIKit.Label(m.transform, $"Ère {b.era} : {G.D.eras[b.era - 1].name}", 30, Theme.InkSoft);
                    lt.rectTransform.Fill();
                    lockMask = m.gameObject;
                }
                rows.Add((b, name, info, buy, price, lockMask));
            }
            Refresh();
        }

        void FillUpgrades()
        {
            var ups = G.AvailableUpgrades().OrderBy(u => u.cost).Take(30).ToList();
            if (ups.Count == 0) UIKit.Para(list, "Aucune amélioration pour l'instant. Achète des bâtiments et tapote encore !", 30);
            foreach (var u in ups)
            {
                var row = UIKit.Card(list, Color.white, 14, 4);
                var hb = UIKit.HBox(row, 14, 0, TextAnchor.MiddleLeft);
                hb.Size(-1, 110);
                var icon = u.type == "building" ? Sprites.Building(u.target) : Sprites.Icon(u.type == "global" ? "paillettes" : "eclair");
                UIKit.Img(hb, icon).Size(96, 96);
                var mid = UIKit.VBox(hb, 2, 0, TextAnchor.MiddleLeft, false); mid.Size(-1, 100, 1);
                UIKit.Label(mid, u.name, 28, Theme.Ink, TextAnchor.MiddleLeft).Size(-1, 44);
                UIKit.Label(mid, u.desc, 22, Theme.InkSoft, TextAnchor.UpperLeft).Size(-1, 54);
                var uu = u;
                var b = UIKit.Btn(hb, Fmt.Num(u.cost), () =>
                {
                    if (G.BuyUpgrade(uu)) { Sfx.Play("buy"); FillList(); }
                    else Sfx.Play("deny");
                }, Theme.Lilac, 28);
                b.Size(230, 96);
                upRows.Add((u, b));
            }
            Refresh();
        }

        void BuyB(BuildingDef b)
        {
            if (b.era > G.CurrentEra().id) return;
            if (G.Buy(b, Qty(b))) { Sfx.Play("buy"); Anim.Punch(rows.First(r => r.b == b).buy.transform, .08f); }
            else Sfx.Play("deny");
            Refresh();
        }

        public override void Refresh()
        {
            if (pantyImg == null) return;
            pantyImg.sprite = Sprites.Skin(G.S.skin);
            var era = G.CurrentEra(); var next = G.NextEra();
            eraTxt.text = next != null ? $"Ère {era.id} · {era.name} → {next.name} : {Fmt.Num(G.S.totalEarned)} / {Fmt.Num(next.unlockAt)}" : $"Ère {era.id} · {era.name} (ère finale !)";
            UIKit.SetBar(eraBar, next == null ? 1 : (float)((G.S.totalEarned - era.unlockAt) / (next.unlockAt - era.unlockAt)));
            clickTxt.text = $"{Fmt.Num(G.ClickValue())} par tapotis";
            var buffs = G.ActiveBuffs().Select(b => $"{b.name} {Fmt.Duration(b.until - G.Now)}").ToList();
            if (G.InHappyHour()) buffs.Insert(0, "HAPPY HOUR x2");
            if (G.EventBonusPct() > 0) buffs.Add($"Événement +{G.EventBonusPct()} %");
            buffTxt.text = string.Join("  ·  ", buffs);

            int eraId = era.id;
            foreach (var r in rows)
            {
                int q = Qty(r.b);
                double cost = G.CostOf(r.b, q);
                int owned = G.Owned(r.b.id);
                r.name.text = $"{r.b.name}  <color=#ff6fa0>x{owned}</color>";
                double each = G.BuildingCps(r.b) * G.BuffMult("cps");
                r.info.text = $"{Fmt.Num(each)}/s chacun · {r.b.desc}";
                r.price.text = (q > 1 ? $"x{q}\n" : "") + Fmt.Num(cost);
                bool ok = G.S.coins >= cost && r.b.era <= eraId;
                r.buy.GetComponent<Image>().color = ok ? Theme.Mint : Theme.Disabled;
                if (r.lockMask != null && r.b.era <= eraId) { Object.Destroy(r.lockMask); FillList(); return; }
            }
            foreach (var (u, btn) in upRows)
                btn.GetComponent<Image>().color = G.S.coins >= u.cost ? Theme.Lilac : Theme.Disabled;
        }

        public override void Rebuild()
        {
            UIKit.Clear(Root);
            Build();
        }
    }

    /// <summary>Zone de tapotis multi-touch (chaque doigt compte).</summary>
    public class TapZone : MonoBehaviour, IPointerDownHandler
    {
        public System.Action<Vector2> onTap;
        public void OnPointerDown(PointerEventData e)
        {
            var rt = (RectTransform)transform;
            RectTransformUtility.ScreenPointToLocalPointInRectangle(rt, e.position, e.pressEventCamera, out var local);
            onTap?.Invoke(local);
        }
    }
}
