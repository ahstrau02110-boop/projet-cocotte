// Définitions du contenu (lues depuis Resources/Data/*.json)
using System;
using System.Collections.Generic;
using System.Linq;

namespace PantyClicker.Core
{
    using Map = Dictionary<string, object>;

    public class BuildingDef { public string id, name, desc; public int era; public double baseCost, baseCps, cityHappy; }
    public class EraDef { public int id; public string name, color, tagline; public double unlockAt; }
    public class RarityDef { public string id, label, color; public double weight; }
    public class SkinDef { public string id, name, rarity, desc; public bool isDefault, gacha = true; public int mega; }
    public class BgDef { public string id, name, rarity; public bool gacha = true; }
    public class UpgradeDef
    {
        public string id, name, type, target, desc;
        public double mult = 1, pct, cost;
        public string unlockKind; public double unlockAt;
    }
    public class AchievementDef { public string id, name, desc, stat, building; public double n; }
    public class TalentDef { public string id, name, desc, need; public int cost; }
    public class RecipeDef { public string id, name, desc; public int era; public Dictionary<string, int> cost = new Dictionary<string, int>(); public Map result; }
    public class MissionDef { public string id, text, stat; public double[] n; public int[] reward; }
    public class OfferDef { public string kind, id; public int price; }
    public class EventDef
    {
        public string id, name, desc, start, end;
        public List<int> weekdays = new List<int>(), monthDays = new List<int>();
        public double bonusPct, shopDiscount, gachaRateUp = 1;
        public List<OfferDef> offers = new List<OfferDef>();
    }
    public class ShopItemDef
    {
        public string id, name, desc, currency, price, tag;
        public bool iap; public double cost, costSec, costMult;
        public Map give;
    }
    public class DecoDef { public string id, name; public int cost, era; public double happy, aura; }
    public class GroundDef { public string id, name; public int cost, era; }
    public class MatKind { public string id, name; public double weight; }
    public class OrderRequest { public string what, main, side; }

    public class GameData
    {
        public Map config;
        public List<BuildingDef> buildings = new List<BuildingDef>();
        public List<EraDef> eras = new List<EraDef>();
        public List<RarityDef> rarities = new List<RarityDef>();
        public List<SkinDef> skins = new List<SkinDef>();
        public List<BgDef> backgrounds = new List<BgDef>();
        public List<UpgradeDef> upgrades = new List<UpgradeDef>();
        public List<AchievementDef> achievements = new List<AchievementDef>();
        public List<TalentDef> talents = new List<TalentDef>();
        public List<RecipeDef> recipes = new List<RecipeDef>();
        public List<MissionDef> missions = new List<MissionDef>(), weekly = new List<MissionDef>();
        public int missionAllBonus, weeklyAllBonus;
        public List<EventDef> events = new List<EventDef>();
        public List<ShopItemDef> packs = new List<ShopItemDef>(), permanent = new List<ShopItemDef>(), pool = new List<ShopItemDef>();
        public ShopItemDef starter;
        public Map city;
        public List<DecoDef> decos = new List<DecoDef>();
        public List<GroundDef> grounds = new List<GroundDef>();
        public List<MatKind> mats = new List<MatKind>();
        public List<string> clients = new List<string>();
        public List<OrderRequest> requests = new List<OrderRequest>();

        public BuildingDef Building(string id) => buildings.FirstOrDefault(b => b.id == id);
        public SkinDef Skin(string id) => skins.FirstOrDefault(s => s.id == id);
        public BgDef Bg(string id) => backgrounds.FirstOrDefault(s => s.id == id);
        public DecoDef Deco(string id) => decos.FirstOrDefault(d => d.id == id);
        public RarityDef Rarity(string id) => rarities.FirstOrDefault(r => r.id == id) ?? rarities[0];
        public double Cfg(string path, double def = 0)
        {
            // Accès « a.b.c » dans config.json
            object cur = config;
            foreach (var part in path.Split('.'))
            {
                if (!(cur is Map m) || !m.TryGetValue(part, out cur)) return def;
            }
            return cur == null ? def : Json.ToD(cur);
        }
        public List<object> CfgList(string path)
        {
            object cur = config;
            foreach (var part in path.Split('.'))
                if (!(cur is Map m) || !m.TryGetValue(part, out cur)) return new List<object>();
            return cur as List<object> ?? new List<object>();
        }

        /// <summary>Charge tout le contenu. read("skins") doit renvoyer le texte de Data/skins.json.</summary>
        public static GameData Load(Func<string, string> read)
        {
            var d = new GameData();
            Map J(string n) => (Map)Json.Parse(read(n));

            d.config = J("config");

            foreach (var b in J("buildings").Objs("buildings"))
                d.buildings.Add(new BuildingDef { id = b.S("id"), name = b.S("name"), desc = b.S("desc"), era = b.I("era", 1), baseCost = b.D("baseCost"), baseCps = b.D("baseCps"), cityHappy = b.D("cityHappy", 1) });

            foreach (var e in J("eras").Objs("eras"))
                d.eras.Add(new EraDef { id = e.I("id"), name = e.S("name"), color = e.S("color"), tagline = e.S("tagline"), unlockAt = e.D("unlockAt") });

            var sk = J("skins");
            foreach (var r in sk.Objs("rarities"))
                d.rarities.Add(new RarityDef { id = r.S("id"), label = r.S("label"), color = r.S("color"), weight = r.D("weight") });
            foreach (var s in sk.Objs("skins"))
                d.skins.Add(new SkinDef { id = s.S("id"), name = s.S("name"), rarity = s.S("rarity"), desc = s.S("desc"), isDefault = s.B("default"), gacha = s.B("gacha", true), mega = s.I("mega") });

            foreach (var b in J("backgrounds").Objs("backgrounds"))
                d.backgrounds.Add(new BgDef { id = b.S("id"), name = b.S("name"), rarity = b.S("rarity"), gacha = b.B("gacha", true) });

            // Améliorations : paliers par bâtiment + uniques
            var up = J("upgrades");
            foreach (var b in d.buildings)
                foreach (var t in up.Objs("buildingTiers"))
                    d.upgrades.Add(new UpgradeDef
                    {
                        id = b.id + "-" + t.I("owned"), name = t.S("name") + " · " + b.name, type = "building", target = b.id, mult = 2,
                        cost = b.baseCost * t.D("costMult"), unlockKind = "owned", unlockAt = t.D("owned"),
                        desc = b.name + " : production x2."
                    });
            foreach (var u in up.Objs("upgrades"))
            {
                var un = u.O("unlock") ?? new Map();
                var kind = un.Keys.FirstOrDefault() ?? "clicks";
                d.upgrades.Add(new UpgradeDef
                {
                    id = u.S("id"), name = u.S("name"), type = u.S("type"), target = u.S("target"), desc = u.S("desc"),
                    mult = u.D("mult", 1), pct = u.D("pct"), cost = u.D("cost"), unlockKind = kind, unlockAt = un.D(kind)
                });
            }
            d.upgrades = d.upgrades.OrderBy(u => u.cost).ToList();

            // Succès générés
            var ach = J("achievements");
            foreach (var g in ach.Objs("groups"))
            {
                var names = g.L("names"); var tiers = g.L("tiers");
                for (int i = 0; i < tiers.Count; i++)
                {
                    double n = Json.ToD(tiers[i]);
                    d.achievements.Add(new AchievementDef
                    {
                        id = g.S("stat") + "-" + n, stat = g.S("stat"), n = n,
                        name = i < names.Count ? names[i].ToString() : g.S("stat") + " " + (i + 1),
                        desc = g.S("text").Replace("{n}", Fmt.Num(n))
                    });
                }
            }
            var bt = ach.O("building");
            foreach (var b in d.buildings)
                foreach (var t in bt.L("tiers"))
                {
                    double n = Json.ToD(t);
                    d.achievements.Add(new AchievementDef
                    {
                        id = "b-" + b.id + "-" + n, stat = "building", building = b.id, n = n,
                        name = b.name + (n == 1 ? " : bienvenue !" : " x" + n),
                        desc = bt.S("text").Replace("{n}", Fmt.Num(n)).Replace("{b}", b.name)
                    });
                }

            foreach (var t in J("talents").Objs("talents"))
                d.talents.Add(new TalentDef { id = t.S("id"), name = t.S("name"), desc = t.S("desc"), need = t.S("need", null), cost = t.I("cost", 1) });

            foreach (var r in J("recipes").Objs("recipes"))
            {
                var rd = new RecipeDef { id = r.S("id"), name = r.S("name"), desc = r.S("desc"), era = r.I("era", 1), result = r.O("result") };
                foreach (var kv in r.O("cost") ?? new Map()) rd.cost[kv.Key] = (int)Json.ToD(kv.Value);
                d.recipes.Add(rd);
            }

            var mi = J("missions");
            d.missionAllBonus = mi.I("allBonus", 20);
            d.weeklyAllBonus = mi.I("weeklyAllBonus", 60);
            MissionDef M(Map m) => new MissionDef
            {
                id = m.S("id"), text = m.S("text"), stat = m.S("stat"),
                n = m.L("n").Select(Json.ToD).ToArray(), reward = m.L("reward").Select(x => (int)Json.ToD(x)).ToArray()
            };
            d.missions = mi.Objs("missions").Select(M).ToList();
            d.weekly = mi.Objs("weekly").Select(M).ToList();

            foreach (var e in J("events").Objs("events"))
            {
                var ev = new EventDef
                {
                    id = e.S("id"), name = e.S("name"), desc = e.S("desc"), start = e.S("start", null), end = e.S("end", null),
                    bonusPct = e.D("bonusPct"), shopDiscount = e.D("shopDiscount"), gachaRateUp = e.D("gachaRateUp", 1),
                    weekdays = e.L("weekdays").Select(x => (int)Json.ToD(x)).ToList(),
                    monthDays = e.L("monthDays").Select(x => (int)Json.ToD(x)).ToList(),
                };
                foreach (var o in e.Objs("offers")) ev.offers.Add(new OfferDef { kind = o.S("kind"), id = o.S("id"), price = o.I("price") });
                d.events.Add(ev);
            }

            var shop = J("shop");
            ShopItemDef SI(Map m) => new ShopItemDef
            {
                id = m.S("id"), name = m.S("name"), desc = m.S("desc", null), currency = m.S("currency", "gems"), price = m.S("price", null), tag = m.S("tag", null),
                iap = m.B("iap"), cost = m.D("cost"), costSec = m.D("costSec"), costMult = m.D("costMult"), give = m.O("give") ?? new Map()
            };
            d.packs = shop.Objs("packs").Select(SI).ToList();
            d.permanent = shop.Objs("permanent").Select(SI).ToList();
            d.pool = shop.Objs("pool").Select(SI).ToList();
            d.starter = SI(shop.O("starter"));

            d.city = J("city");
            foreach (var x in d.city.Objs("decos"))
                d.decos.Add(new DecoDef { id = x.S("id"), name = x.S("name"), cost = x.I("cost"), era = x.I("era", 1), happy = x.D("happy"), aura = x.D("aura") });
            foreach (var x in d.city.Objs("grounds"))
                d.grounds.Add(new GroundDef { id = x.S("id"), name = x.S("name"), cost = x.I("cost"), era = x.I("era", 1) });

            foreach (var k in (d.config.O("materials") ?? new Map()).Objs("kinds"))
                d.mats.Add(new MatKind { id = k.S("id"), name = k.S("name"), weight = k.D("weight", 1) });

            var ord = J("orders");
            d.clients = ord.L("clients").Select(x => x.ToString()).ToList();
            foreach (var r in ord.Objs("requests")) d.requests.Add(new OrderRequest { what = r.S("what"), main = r.S("main"), side = r.S("side") });
            return d;
        }
    }
}
