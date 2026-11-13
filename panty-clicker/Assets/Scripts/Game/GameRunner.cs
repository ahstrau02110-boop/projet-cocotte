// Point d'entrée : démarre tout seul au lancement (aucun objet à placer dans la scène).
using PantyClicker.Core;
using PantyClicker.UI;
using UnityEngine;

namespace PantyClicker
{
    public class GameRunner : MonoBehaviour
    {
        public static GameRunner I;
        public Game G;
        public GameData Data;
        public MainUI Ui;
        float saveTimer;

        // Remise à zéro si le rechargement de domaine est désactivé (Enter Play Mode Options)
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() { I = null; }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Boot()
        {
            if (I != null) return;
            var go = new GameObject("PantyClicker");
            DontDestroyOnLoad(go);
            go.AddComponent<GameRunner>();
        }

        void Awake()
        {
            I = this;
            Application.targetFrameRate = 60;
            Screen.sleepTimeout = SleepTimeout.SystemSetting;
            Data = GameData.Load(name => Resources.Load<TextAsset>("Data/" + name).text);
            var state = SaveSystem.Load();
            G = new Game(Data, state) { Store = new SimulatedStore() };
            Sfx.Init(gameObject, G.S.settings);
            EnsureCamera();
            Ui = MainUI.Build(this);
            if (state != null)
            {
                var (sec, gain) = G.Offline(state.lastSave);
                if (sec > 0) Ui.ShowOffline(sec, gain);
            }
            else G.Welcome();
        }

        static void EnsureCamera()
        {
            if (Camera.main != null) { Camera.main.backgroundColor = Theme.PinkPale; Camera.main.clearFlags = CameraClearFlags.SolidColor; return; }
            var cam = new GameObject("Main Camera").AddComponent<Camera>();
            cam.tag = "MainCamera";
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = Theme.PinkPale;
            cam.orthographic = true;
        }

        void Update()
        {
            G.Tick(Time.unscaledDeltaTime);
            saveTimer += Time.unscaledDeltaTime;
            if (saveTimer >= G.D.Cfg("autosaveSec", 10)) { saveTimer = 0; Save(); }
        }

        public void Save() => SaveSystem.Save(G);

        /// <summary>Remplace la partie (import, remise à zéro) puis reconstruit l'interface.</summary>
        public void Replace(GameState s)
        {
            G = new Game(Data, s) { Store = new SimulatedStore() };
            if (s == null) G.Welcome();
            Sfx.Settings = G.S.settings;
            Sfx.ApplySettings();
            Save();
            if (Ui != null) Destroy(Ui.gameObject);
            Ui = MainUI.Build(this);
        }

        void OnApplicationPause(bool paused)
        {
            if (paused) Save();
            else if (G != null)
            {
                // Retour au premier plan : gains de l'absence
                var (sec, gain) = G.Offline(G.S.lastSave);
                if (sec > 0) Ui?.ShowOffline(sec, gain);
            }
        }

        void OnApplicationQuit() => Save();
    }
}
