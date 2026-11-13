// État sauvegardé du joueur (sérialisé en JSON par Json.Serialize)
using System;
using System.Collections.Generic;

namespace PantyClicker.Core
{
    public class Buff { public string id, name; public double cps = 1, click = 1, until; }

    public class GachaState { public int pulls, sinceLegend, bgPulls, bgSinceLegend; }

    public class PrestigeState { public int seasons; public double petals, spent, lifetime; public Dictionary<string, bool> talents = new Dictionary<string, bool>(); }

    public class DailyState { public string last = ""; public int streak, best, shields; }

    public class MissionSlot { public string id; public int diff; public double start, n; public int reward; public bool done; }
    public class MissionBoard { public string key = ""; public List<MissionSlot> list = new List<MissionSlot>(); public bool bonus; }

    public class OrderSlot { public string client, what, main, side; public int needMain, needSide, gems, hearts, rep; public double expires; }
    public class OrdersState { public List<OrderSlot> list = new List<OrderSlot>(); public double next; public int rep; }

    public class MiniState { public string day = ""; public int gemsToday, plays, stars; public Dictionary<string, int> best = new Dictionary<string, int>(); }

    public class CityCell { public string g = "herbe", kind = "", id = ""; public int lvl = 1; }
    public class CityState
    {
        public string name = "Pantsuville";
        public int size;                                   // côté de la grille
        public List<CityCell> cells = new List<CityCell>();
        public Dictionary<string, int> decoInv = new Dictionary<string, int>(); // décos en réserve
        public double hearts, stored, lastTick;            // Cœurs (monnaie de Ville), Coffre, dernier calcul
    }

    public class ShopState
    {
        public string dailyKey = "";                       // jour de la Boutique du jour
        public List<string> daily = new List<string>();    // ids du pool proposés
        public Dictionary<string, bool> dailyBought = new Dictionary<string, bool>();
        public string dailySkin = "", dailyBg = "", dailyDeco = "";
        public bool starterBought;
        public double freeGiftNext;                        // prochain cadeau gratuit (s epoch)
        public double subUntil; public int subGems; public string subLast = "";
        public Dictionary<string, int> bought = new Dictionary<string, int>();
        public string flashSeen = "";
    }

    public class GameState
    {
        public int v = 1;
        public double coins, totalEarned, totalClicks, handEarned;
        public double gems, tickets;
        public Dictionary<string, int> buildings = new Dictionary<string, int>();
        public Dictionary<string, bool> upgrades = new Dictionary<string, bool>();
        public Dictionary<string, double> achievements = new Dictionary<string, double>();
        public List<int> achMilestones = new List<int>();
        public Dictionary<string, int> skins = new Dictionary<string, int> { { "classique", 1 } };
        public string skin = "classique";
        public Dictionary<string, int> bgs = new Dictionary<string, int>();
        public string bg = "auto";
        public GachaState gacha = new GachaState();
        public List<Buff> buffs = new List<Buff>();
        public double goldenNext;                         // apparition prochaine Pantsu dorée (s epoch)
        public int maxEra = 1;
        public PrestigeState prestige = new PrestigeState();
        public int mega;
        public DailyState daily = new DailyState();
        public MissionBoard missions = new MissionBoard(), weekly = new MissionBoard();
        public Dictionary<string, double> counters = new Dictionary<string, double>();
        public Dictionary<string, int> mats = new Dictionary<string, int>();
        public OrdersState orders = new OrdersState();
        public MiniState mini = new MiniState();
        public CityState city = new CityState();
        public ShopState shop = new ShopState();
        public Dictionary<string, bool> eventsSeen = new Dictionary<string, bool>();
        public double startedAt, lastSave;
        public bool tuto, welcomed;
        public Settings settings = new Settings();

        public class Settings { public bool sound = true, music = true; public float sfxVol = .7f, musicVol = .4f; public int buyQty = 1; }

        public double Counter(string k) => counters.TryGetValue(k, out var v) ? v : 0;
        public void Count(string k, double n = 1) => counters[k] = Counter(k) + n;
        public int Owned(string id) => buildings.TryGetValue(id, out var n) ? n : 0;
    }
}
