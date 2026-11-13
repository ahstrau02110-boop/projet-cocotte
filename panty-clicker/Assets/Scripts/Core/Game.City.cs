// Ville idle personnalisable : grille, bâtiments posés, décos à aura, sols, niveaux, Coffre à Cœurs
using System;
using System.Collections.Generic;
using System.Linq;

namespace PantyClicker.Core
{
    public partial class Game
    {
        CityState C => S.city;
        bool cityDirty = true;
        double happyCache;

        public int CitySize => C.size;
        public CityCell Cell(int x, int y) => (x < 0 || y < 0 || x >= C.size || y >= C.size) ? null : C.cells[y * C.size + x];

        void CityEnsureCells()
        {
            int n = C.size * C.size;
            if (C.cells.Count == n) return;
            // Taille changée (agrandissement) : on recopie l'ancienne grille en haut à gauche
            int old = (int)Math.Round(Math.Sqrt(C.cells.Count));
            var cells = new List<CityCell>(n);
            for (int y = 0; y < C.size; y++)
                for (int x = 0; x < C.size; x++)
                    cells.Add(x < old && y < old && y * old + x < C.cells.Count ? C.cells[y * old + x] : new CityCell());
            C.cells = cells;
            cityDirty = true;
        }

        public int PlacedCount(string id) => C.cells.Count(c => c.kind == "b" && c.id == id);
        public bool CanPlaceBuilding(string id) => Owned(id) > PlacedCount(id);
        public int DecoInv(string id) => C.decoInv.TryGetValue(id, out var n) ? n : 0;

        public bool PlaceBuilding(int x, int y, string id)
        {
            var c = Cell(x, y);
            if (c == null || c.kind != "" || !CanPlaceBuilding(id) || c.g == "eau") return false;
            c.kind = "b"; c.id = id; c.lvl = 1;
            S.Count("cityPlace");
            cityDirty = true;
            return true;
        }

        public bool PlaceDeco(int x, int y, string id)
        {
            var c = Cell(x, y);
            if (c == null || c.kind != "" || DecoInv(id) <= 0) return false;
            C.decoInv[id] = DecoInv(id) - 1;
            c.kind = "d"; c.id = id; c.lvl = 1;
            S.Count("cityPlace");
            cityDirty = true;
            return true;
        }

        /// <summary>Retire l'élément : la déco retourne en réserve, le bâtiment redevient disponible (niveau conservé si reposé ailleurs : non, remis à 1).</summary>
        public bool Remove(int x, int y)
        {
            var c = Cell(x, y);
            if (c == null || c.kind == "") return false;
            if (c.kind == "d") C.decoInv[c.id] = DecoInv(c.id) + 1;
            c.kind = ""; c.id = ""; c.lvl = 1;
            cityDirty = true;
            return true;
        }

        /// <summary>Déplace un élément (niveau conservé).</summary>
        public bool Move(int x0, int y0, int x1, int y1)
        {
            var a = Cell(x0, y0); var b = Cell(x1, y1);
            if (a == null || b == null || a.kind == "" || b.kind != "" || (a.kind == "b" && b.g == "eau")) return false;
            b.kind = a.kind; b.id = a.id; b.lvl = a.lvl;
            a.kind = ""; a.id = ""; a.lvl = 1;
            cityDirty = true;
            return true;
        }

        public bool BuyDeco(DecoDef d)
        {
            if (CurrentEra().id < d.era || C.hearts < d.cost) return false;
            C.hearts -= d.cost;
            C.decoInv[d.id] = DecoInv(d.id) + 1;
            return true;
        }

        public bool Paint(int x, int y, string groundId)
        {
            var c = Cell(x, y);
            var g = D.grounds.FirstOrDefault(z => z.id == groundId);
            if (c == null || g == null || c.g == groundId || CurrentEra().id < g.era || C.hearts < g.cost) return false;
            if (groundId == "eau" && c.kind == "b") return false;
            C.hearts -= g.cost;
            c.g = groundId;
            return true;
        }

        public int LevelMax => (int)D.city.D("levelMax", 10);
        public double LevelCost(CityCell c)
        {
            var costs = D.city.L("levelCost");
            int i = c.lvl - 1;
            return i < costs.Count ? Json.ToD(costs[i]) : double.MaxValue;
        }

        public bool LevelUp(int x, int y)
        {
            var c = Cell(x, y);
            if (c == null || c.kind != "b" || c.lvl >= LevelMax) return false;
            double cost = LevelCost(c);
            if (C.hearts < cost) return false;
            C.hearts -= cost;
            c.lvl++;
            cityDirty = true;
            return true;
        }

        public int ExpandIndex => C.size - (int)D.city.D("gridStart", 5);
        public double ExpandCost()
        {
            var l = D.city.L("expandCost");
            return ExpandIndex < l.Count && C.size < D.city.D("gridMax", 10) ? Json.ToD(l[ExpandIndex]) : -1;
        }

        public bool Expand()
        {
            double cost = ExpandCost();
            if (cost < 0 || C.hearts < cost) return false;
            C.hearts -= cost;
            C.size++;
            CityEnsureCells();
            return true;
        }

        public void RenameCity(string name)
        {
            name = (name ?? "").Trim();
            if (name.Length > 0) C.name = name.Length > 24 ? name.Substring(0, 24) : name;
        }

        // ---------- Bonheur
        /// <summary>Aura (en %) reçue par une case de la part des décos voisines (4 directions).</summary>
        public double AuraAt(int x, int y)
        {
            double a = 0;
            foreach (var (dx, dy) in new[] { (1, 0), (-1, 0), (0, 1), (0, -1) })
            {
                var n = Cell(x + dx, y + dy);
                if (n != null && n.kind == "d") a += D.Deco(n.id)?.aura ?? 0;
            }
            return a;
        }

        /// <summary>Un bâtiment posé n'est actif que si on en possède assez (après un Grand Lavage, ils « dorment »).</summary>
        public bool CellActive(int x, int y)
        {
            var c = Cell(x, y);
            if (c == null || c.kind != "b") return c != null && c.kind == "d";
            int rank = 0, idx = y * C.size + x;
            for (int i = 0; i < idx; i++) if (C.cells[i].kind == "b" && C.cells[i].id == c.id) rank++;
            return rank < Owned(c.id);
        }

        public double CellHappy(int x, int y)
        {
            var c = Cell(x, y);
            if (c == null || c.kind == "" || !CellActive(x, y)) return 0;
            if (c.kind == "d") return D.Deco(c.id)?.happy ?? 0;
            var b = D.Building(c.id);
            if (b == null) return 0;
            return b.cityHappy * (1 + (c.lvl - 1) * D.city.D("levelHappyPct", 25) / 100) * (1 + AuraAt(x, y) / 100);
        }

        double ownedHash = -1;
        public double CityHappy()
        {
            double hash = 0;
            foreach (var kv in S.buildings) hash += kv.Value * (kv.Key.GetHashCode() % 1000 + 1001);
            if (hash != ownedHash) { ownedHash = hash; cityDirty = true; }
            if (!cityDirty) return happyCache;
            double h = 0;
            for (int y = 0; y < C.size; y++)
                for (int x = 0; x < C.size; x++)
                    h += CellHappy(x, y);
            if (HasTalent("bonheur")) h *= 1.25;
            happyCache = Math.Round(h, 1);
            cityDirty = false;
            return happyCache;
        }

        public void CityChanged() => cityDirty = true;

        public double CityHappyPct() => CityHappy() * D.city.D("happyPct", .25);

        public double CityBuildingBoostPct(string id)
        {
            double pct = 0, per = D.city.D("boostPct", 2);
            int active = 0, owned = Owned(id);
            foreach (var c in C.cells)
                if (c.kind == "b" && c.id == id && active++ < owned) pct += per * c.lvl;
            return pct;
        }

        // ---------- Coffre à Cœurs
        public double HeartsPerMin() => CityHappy() * D.city.D("heartsPerHappyMin", .2);
        public double StorageCap() => HeartsPerMin() * 60 * (D.city.D("storageHours", 4) + (HasTalent("coffre") ? 4 : 0));
        public bool StorageFull => C.stored >= StorageCap() - 0.01 && StorageCap() > 0;
        public double SecondsToFull() => HeartsPerMin() <= 0 ? -1 : Math.Max(0, (StorageCap() - C.stored) / HeartsPerMin() * 60);

        void CityTick()
        {
            double now = Now, dt = Math.Max(0, now - C.lastTick);
            C.lastTick = now;
            C.stored = Math.Min(StorageCap(), C.stored + HeartsPerMin() * dt / 60);
        }

        public int Collect()
        {
            CityTick();
            int n = (int)Math.Floor(C.stored);
            if (n <= 0) return 0;
            C.stored -= n;
            C.hearts += n;
            S.Count("cityCollect");
            return n;
        }
    }
}
