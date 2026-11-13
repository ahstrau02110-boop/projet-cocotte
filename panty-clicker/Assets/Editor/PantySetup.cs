// Préparation automatique du projet à l'ouverture dans Unity :
// scène principale + Build Settings, réglages joueur (portrait), import des sprites.
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace PantyClicker.EditorTools
{
    [InitializeOnLoad]
    public static class PantySetup
    {
        const string ScenePath = "Assets/Scenes/Main.unity";

        static PantySetup()
        {
            EditorApplication.delayCall += Setup;
        }

        [MenuItem("Panty Clicker/Préparer le projet")]
        public static void Setup()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode) return;
            if (!File.Exists(ScenePath))
            {
                Directory.CreateDirectory("Assets/Scenes");
                var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
                var cam = Camera.main;
                if (cam != null)
                {
                    cam.clearFlags = CameraClearFlags.SolidColor;
                    cam.backgroundColor = new Color(1f, .94f, .965f);
                    cam.orthographic = true;
                }
                EditorSceneManager.SaveScene(scene, ScenePath);
                EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
                Debug.Log("Panty Clicker : scène principale créée (" + ScenePath + "). Appuie sur Play !");
            }
            if (PlayerSettings.productName != "Panty Clicker")
            {
                PlayerSettings.productName = "Panty Clicker";
                PlayerSettings.companyName = "Pantsuville";
                PlayerSettings.defaultInterfaceOrientation = UIOrientation.Portrait;
                PlayerSettings.allowedAutorotateToLandscapeLeft = false;
                PlayerSettings.allowedAutorotateToLandscapeRight = false;
            }
        }
    }

    /// <summary>Les images de Resources/Sprites sont importées en Sprite, sans redimensionnement ni compression lourde.</summary>
    public class SpriteImport : AssetPostprocessor
    {
        void OnPreprocessTexture()
        {
            if (!assetPath.Replace('\\', '/').Contains("/Resources/Sprites/")) return;
            var ti = (TextureImporter)assetImporter;
            ti.textureType = TextureImporterType.Sprite;
            ti.spriteImportMode = SpriteImportMode.Single;
            ti.mipmapEnabled = false;
            ti.alphaIsTransparency = true;
            ti.npotScale = TextureImporterNPOTScale.None;
            ti.textureCompression = TextureImporterCompression.CompressedHQ;
            ti.maxTextureSize = 1024;
        }
    }
}
