using System;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace PCForgeShell;

/// <summary>
/// A frameless window that hosts PCForge in WebView2.
///
/// WHY A REAL ORIGIN MATTERS
///     The game saves your machine to browser storage. Opened as a plain file://
///     page, that storage is undefined behaviour by specification - browsers give
///     every file: URL its own area and reserve the right to change how. WebView2
///     can map a folder to a virtual HTTPS host, so the game gets a real origin
///     and its save is guaranteed to persist between runs.
/// </summary>
internal static class Program
{
    public const string Host = "pcforge.local";
    public const string Page = "PCForge.html";
    public const string Title = "PCForge";

    /// <summary>Where the game lives on disk, and where its browser storage lives.</summary>
    public static string AppDir =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "PCForge");

    public static string WebDir => Path.Combine(AppDir, "ui");

    /// <summary>Browser profile, kept beside the game and out of the real browser's.</summary>
    public static string DataDir => Path.Combine(AppDir, "browser");

    [STAThread]
    private static void Main(string[] args)
    {
        if (Array.IndexOf(args, "--check") >= 0)
        {
            Environment.Exit(SelfCheck());
            return;
        }

        // The check that matters: does the game's save actually survive in this
        // runtime? Run it in the real WebView2, then quit without a visible window.
        if (Array.IndexOf(args, "--savecheck") >= 0)
        {
            string dir = Path.Combine(AppDir, "browser-savecheck");
            if (Directory.Exists(dir)) Directory.Delete(dir, true);
            Environment.Exit(SaveCheckForm.Run(dir));
            return;
        }

        ApplicationConfiguration.Initialize();
        Application.Run(new ShellForm());
    }

    /// <summary>
    /// Verify the payload without opening a window: a bundle that can only be
    /// tested by putting a window on someone's screen gets tested badly.
    /// </summary>
    private static int SelfCheck()
    {
        int ok = 0;
        try
        {
            string page = ExtractPage();
            var html = File.ReadAllText(page);

            // Split on the tag and skip element ZERO: when the tag is absent Split
            // returns the entire document, which of course contains quotes, so
            // counting every element reports the whole page as one external script.
            var chunks = html.Split("<script src=");
            int external = 0;
            for (int i = 1; i < chunks.Length; i++)
                if (chunks[i].Contains('"')) external++;

            // and confirm the game is actually in there, not just some HTML
            bool hasSave = html.Contains("pcforge.save.v1");
            bool hasBoards = html.Contains("BOARDS");

            Console.WriteLine("PCForge WebView2 shell");
            Console.WriteLine("  page written to : " + page);
            Console.WriteLine("  bytes           : " + html.Length);
            Console.WriteLine("  external refs   : " + (external == 0 ? "none" : external.ToString()));
            Console.WriteLine("  self-contained  : " + (external == 0 ? "yes" : "NO"));
            Console.WriteLine("  save code       : " + (hasSave ? "present" : "MISSING"));
            Console.WriteLine("  board catalogue : " + (hasBoards ? "present" : "MISSING"));
            Console.WriteLine("  virtual origin  : https://" + Host + "/" + Page);
            Console.WriteLine("  storage         : " + DataDir);
            Console.WriteLine("  runtime         : " + (CoreWebView2Environment.GetAvailableBrowserVersionString()
                                                      ?? "not found"));
            bool good = external == 0 && html.Length > 5000 && hasSave && hasBoards;
            Console.WriteLine("  RESULT          : " + (good ? "PASS" : "FAIL"));
            ok = good ? 0 : 1;
        }
        catch (Exception e)
        {
            Console.WriteLine("  RESULT          : FAIL - " + e.Message);
            ok = 1;
        }
        try
        {
            File.WriteAllText(Path.Combine(AppContext.BaseDirectory, "_shell_check.txt"),
                ok == 0 ? "PASS" : "FAIL");
        }
        catch { /* a check that cannot write is still a check that ran */ }
        return ok;
    }

    /// <summary>
    /// Write the embedded page next to the browser profile. The exe carries the
    /// game inside it, so there is no second file to lose or to keep in sync.
    /// </summary>
    public static string ExtractPage()
    {
        Directory.CreateDirectory(WebDir);
        var target = Path.Combine(WebDir, Page);

        var asm = Assembly.GetExecutingAssembly();
        using var stream = asm.GetManifestResourceStream(Page)
            ?? throw new InvalidOperationException("the page is not embedded in this build");
        using var file = File.Create(target);
        stream.CopyTo(file);
        return target;
    }
}