// Fabrique d'interface uGUI construite en code (aucune scène ni prefab à configurer).
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace PantyClicker.UI
{
    public static class Theme
    {
        public static readonly Color Pink = Hex("#ff6fa0"), PinkSoft = Hex("#ffd6e7"), PinkPale = Hex("#fff0f6");
        public static readonly Color Ink = Hex("#4a3550"), InkSoft = Hex("#8a7590"), White = Color.white;
        public static readonly Color Mint = Hex("#5cc29a"), Sky = Hex("#4aa3ff"), Lilac = Hex("#b36bff"), Gold = Hex("#ffb020");
        public static readonly Color Disabled = Hex("#d9cfdc"), Shade = new Color(0.17f, 0.13f, 0.2f, 0.55f);

        public static Color Hex(string hex)
        {
            return ColorUtility.TryParseHtmlString(hex, out var c) ? c : Color.magenta;
        }
    }

    public static class UIKit
    {
        public static Font Font;
        public static Sprite Round, Circle;

        /// <summary>Prépare police et sprites arrondis (générés : rien à importer).</summary>
        public static void Init()
        {
            if (Font != null) return;
            Font = Resources.Load<Font>("Fonts/Fredoka");
            if (Font == null)
            {
                try { Font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"); }
                catch (Exception) { Font = Resources.GetBuiltinResource<Font>("Arial.ttf"); }
            }
            Round = MakeRounded(64, 22);
            Circle = MakeRounded(64, 32);
        }

        // Rectangle arrondi blanc, anticrénelé, découpé en 9 (Image.Type.Sliced)
        static Sprite MakeRounded(int size, int radius)
        {
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
            var px = new Color32[size * size];
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float cx = Mathf.Clamp(x + .5f, radius, size - radius), cy = Mathf.Clamp(y + .5f, radius, size - radius);
                    float d = Vector2.Distance(new Vector2(x + .5f, y + .5f), new Vector2(cx, cy));
                    byte a = (byte)(Mathf.Clamp01(radius - d + .5f) * 255);
                    px[y * size + x] = new Color32(255, 255, 255, a);
                }
            tex.SetPixels32(px);
            tex.Apply();
            float b = Mathf.Min(radius, size / 2 - 1);
            return Sprite.Create(tex, new Rect(0, 0, size, size), new Vector2(.5f, .5f), 100, 0, SpriteMeshType.FullRect, new Vector4(b, b, b, b));
        }

        // ------------------------------------------------------------ bases
        public static RectTransform Rect(string name, Transform parent)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.layer = 5; // UI
            var rt = (RectTransform)go.transform;
            rt.SetParent(parent, false);
            return rt;
        }

        public static RectTransform Fill(this RectTransform r, float l = 0, float t = 0, float ri = 0, float b = 0)
        {
            r.anchorMin = Vector2.zero; r.anchorMax = Vector2.one;
            r.offsetMin = new Vector2(l, b); r.offsetMax = new Vector2(-ri, -t);
            return r;
        }

        /// <summary>Ancre et taille (pivot au point d'ancrage).</summary>
        public static RectTransform At(this RectTransform r, Vector2 anchor, Vector2 pos, Vector2 size)
        {
            r.anchorMin = r.anchorMax = anchor;
            r.pivot = anchor;
            r.anchoredPosition = pos;
            r.sizeDelta = size;
            return r;
        }

        public static T Size<T>(this T c, float w = -1, float h = -1, float flexW = -1, float flexH = -1) where T : Component
        {
            var le = c.GetComponent<LayoutElement>() ?? c.gameObject.AddComponent<LayoutElement>();
            if (w >= 0) le.preferredWidth = le.minWidth = w;
            if (h >= 0) le.preferredHeight = le.minHeight = h;
            if (flexW >= 0) le.flexibleWidth = flexW;
            if (flexH >= 0) le.flexibleHeight = flexH;
            return c;
        }

        public static Image Img(Transform parent, Sprite s, Color? color = null, bool sliced = false, string name = "Img")
        {
            var img = Rect(name, parent).gameObject.AddComponent<Image>();
            img.sprite = s;
            img.color = color ?? Color.white;
            img.raycastTarget = false;
            if (sliced) img.type = Image.Type.Sliced;
            else img.preserveAspect = true;
            return img;
        }

        public static Image Panel(Transform parent, Color color, string name = "Panel")
        {
            var img = Img(parent, Round, color, true, name);
            return img;
        }

        public static Text Label(Transform parent, string text, int size = 34, Color? color = null, TextAnchor align = TextAnchor.MiddleCenter, string name = "Label")
        {
            var t = Rect(name, parent).gameObject.AddComponent<Text>();
            t.font = Font;
            t.text = text;
            t.fontSize = size;
            t.color = color ?? Theme.Ink;
            t.alignment = align;
            t.raycastTarget = false;
            t.supportRichText = true;
            t.horizontalOverflow = HorizontalWrapMode.Wrap;
            t.verticalOverflow = VerticalWrapMode.Overflow;
            return t;
        }

        public static Button Btn(Transform parent, string text, Action onClick, Color? bg = null, int size = 32, Color? fg = null)
        {
            var img = Panel(parent, bg ?? Theme.Pink, "Btn");
            img.raycastTarget = true;
            var b = img.gameObject.AddComponent<Button>();
            b.targetGraphic = img;
            var cb = b.colors;
            cb.pressedColor = new Color(.85f, .85f, .85f);
            cb.disabledColor = new Color(1, 1, 1, .45f);
            b.colors = cb;
            b.onClick.AddListener(() => { Sfx.Play("tap"); onClick?.Invoke(); });
            if (!string.IsNullOrEmpty(text))
            {
                var t = Label(img.transform, text, size, fg ?? Color.white);
                t.rectTransform.Fill(10, 4, 10, 4);
                t.resizeTextForBestFit = true;
                t.resizeTextMinSize = 14;
                t.resizeTextMaxSize = size;
            }
            return b;
        }

        public static Text BtnLabel(this Button b) => b.GetComponentInChildren<Text>();

        /// <summary>Bouton invisible sur une zone (rendre cliquable une carte).</summary>
        public static Button Hit(Transform parent, Action onClick)
        {
            var img = Img(parent, null, new Color(0, 0, 0, 0), false, "Hit");
            img.raycastTarget = true;
            img.rectTransform.Fill();
            var b = img.gameObject.AddComponent<Button>();
            b.transition = Selectable.Transition.None;
            b.onClick.AddListener(() => { Sfx.Play("tap"); onClick?.Invoke(); });
            return b;
        }

        // ------------------------------------------------------------ mises en page
        public static RectTransform VBox(Transform parent, float spacing = 12, int pad = 0, TextAnchor align = TextAnchor.UpperCenter, bool fit = true)
        {
            var r = Rect("VBox", parent);
            var v = r.gameObject.AddComponent<VerticalLayoutGroup>();
            v.spacing = spacing;
            v.padding = new RectOffset(pad, pad, pad, pad);
            v.childAlignment = align;
            v.childControlWidth = true; v.childControlHeight = true;
            v.childForceExpandWidth = true; v.childForceExpandHeight = false;
            if (fit) r.gameObject.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            return r;
        }

        public static RectTransform HBox(Transform parent, float spacing = 12, int pad = 0, TextAnchor align = TextAnchor.MiddleLeft)
        {
            var r = Rect("HBox", parent);
            var h = r.gameObject.AddComponent<HorizontalLayoutGroup>();
            h.spacing = spacing;
            h.padding = new RectOffset(pad, pad, pad, pad);
            h.childAlignment = align;
            h.childControlWidth = true; h.childControlHeight = true;
            h.childForceExpandWidth = false; h.childForceExpandHeight = false;
            return r;
        }

        public static RectTransform Grid(Transform parent, Vector2 cell, float spacing, int columns)
        {
            var r = Rect("Grid", parent);
            var g = r.gameObject.AddComponent<GridLayoutGroup>();
            g.cellSize = cell;
            g.spacing = new Vector2(spacing, spacing);
            g.constraint = GridLayoutGroup.Constraint.FixedColumnCount;
            g.constraintCount = columns;
            g.childAlignment = TextAnchor.UpperCenter;
            r.gameObject.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            return r;
        }

        /// <summary>Zone défilante verticale ; renvoie le contenu (VBox).</summary>
        public static RectTransform Scroll(Transform parent, out ScrollRect sr, float spacing = 14, int pad = 16)
        {
            var root = Rect("Scroll", parent);
            sr = root.gameObject.AddComponent<ScrollRect>();
            sr.horizontal = false;
            sr.movementType = ScrollRect.MovementType.Clamped;
            sr.scrollSensitivity = 40;
            var vp = Rect("Viewport", root).Fill();
            vp.gameObject.AddComponent<RectMask2D>();
            var hit = vp.gameObject.AddComponent<Image>();
            hit.color = new Color(0, 0, 0, 0);
            var content = VBox(vp, spacing, pad);
            content.anchorMin = new Vector2(0, 1); content.anchorMax = new Vector2(1, 1);
            content.pivot = new Vector2(.5f, 1);
            content.offsetMin = content.offsetMax = Vector2.zero;
            sr.viewport = vp;
            sr.content = content;
            return content;
        }

        public static void Clear(Transform t)
        {
            for (int i = t.childCount - 1; i >= 0; i--) UnityEngine.Object.Destroy(t.GetChild(i).gameObject);
        }

        /// <summary>Barre de progression ; renvoie l'image de remplissage (fillAmount).</summary>
        public static Image Bar(Transform parent, Color bg, Color fill, float height = 22)
        {
            var back = Panel(parent, bg, "Bar");
            back.Size(-1, height, 1);
            var f = Img(back.transform, UIKit.Round, fill, true, "Fill");
            f.rectTransform.Fill(3, 3, 3, 3);
            f.rectTransform.pivot = new Vector2(0, .5f);
            f.type = Image.Type.Sliced;
            var bar = back.gameObject.AddComponent<BarFill>();
            bar.fill = f.rectTransform;
            return f;
        }

        public static void SetBar(Image fill, float v)
        {
            var bf = fill.transform.parent.GetComponent<BarFill>();
            if (bf != null) bf.value = Mathf.Clamp01(v);
        }

        /// <summary>Carte blanche arrondie avec ombre douce.</summary>
        public static RectTransform Card(Transform parent, Color? color = null, int pad = 18, float spacing = 10)
        {
            var img = Panel(parent, color ?? Color.white, "Card");
            var sh = img.gameObject.AddComponent<Shadow>();
            sh.effectColor = new Color(.6f, .3f, .5f, .18f);
            sh.effectDistance = new Vector2(0, -5);
            var v = img.gameObject.AddComponent<VerticalLayoutGroup>();
            v.padding = new RectOffset(pad, pad, pad, pad);
            v.spacing = spacing;
            v.childControlWidth = true; v.childControlHeight = true;
            v.childForceExpandWidth = true; v.childForceExpandHeight = false;
            img.gameObject.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            return img.rectTransform;
        }

        public static Text Title(Transform parent, string text, int size = 40) => Label(parent, text, size, Theme.Ink, TextAnchor.MiddleLeft).Size(-1, size + 14);
        public static Text Para(Transform parent, string text, int size = 28, Color? c = null) => Label(parent, text, size, c ?? Theme.InkSoft, TextAnchor.UpperLeft);

        public static string Rich(string text, Color c) => $"<color=#{ColorUtility.ToHtmlStringRGB(c)}>{text}</color>";
    }

    /// <summary>Remplissage de barre par largeur (fonctionne avec un sprite découpé).</summary>
    public class BarFill : MonoBehaviour
    {
        public RectTransform fill;
        public float value;
        void LateUpdate()
        {
            if (fill == null) return;
            fill.anchorMin = new Vector2(0, 0);
            fill.anchorMax = new Vector2(Mathf.Max(.02f, value), 1);
            fill.offsetMin = new Vector2(3, 3);
            fill.offsetMax = new Vector2(-3, -3);
            fill.gameObject.SetActive(value > 0.001f);
        }
    }
}
