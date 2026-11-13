using System;
using System.Globalization;

namespace PantyClicker.Core
{
    /// <summary>Formatage des nombres et durées (français).</summary>
    public static class Fmt
    {
        static readonly string[] Units = { "", "K", "M", "Md", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc", "UDc", "DDc", "TDc", "QaDc", "QiDc" };
        // Format français fixe (pas de dépendance aux cultures installées ; espace simple, lisible par toutes les polices)
        static readonly NumberFormatInfo Fr = new NumberFormatInfo { NumberDecimalSeparator = ",", NumberGroupSeparator = " ", NumberGroupSizes = new[] { 3 } };

        public static string Num(double n)
        {
            if (double.IsNaN(n) || double.IsInfinity(n)) return "max";
            if (n < 0) return "-" + Num(-n);
            if (n < 1000) return n < 10 && n % 1 != 0 ? n.ToString("0.#", Fr) : Math.Floor(n).ToString("0", Fr);
            int tier = (int)(Math.Log10(n) / 3);
            if (tier >= Units.Length) return n.ToString("0.00e0", CultureInfo.InvariantCulture);
            double v = n / Math.Pow(1000, tier);
            return v.ToString(v < 10 ? "0.00" : v < 100 ? "0.0" : "0", Fr) + " " + Units[tier];
        }

        public static string Int(double n) => Math.Floor(n).ToString("#,0", Fr);

        public static string Duration(double sec)
        {
            if (sec < 0) sec = 0;
            var t = TimeSpan.FromSeconds(Math.Ceiling(sec));
            if (t.TotalDays >= 1) return $"{(int)t.TotalDays} j {t.Hours} h";
            if (t.TotalHours >= 1) return $"{(int)t.TotalHours} h {t.Minutes:00}";
            if (t.TotalMinutes >= 1) return $"{t.Minutes} min {t.Seconds:00}";
            return $"{t.Seconds} s";
        }
    }
}
