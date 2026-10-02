using System;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace PCForgeShell;

/// <summary>
/// End-to-end check of the thing this shell exists for: that the game's save
/// survives, in the real runtime, at a real origin.
///
/// It loads the game exactly as the player would, waits for it to boot, then asks
/// the page itself what it has in storage. A check that only proves a folder was
/// created proves nothing: the first version of this shell created the profile and
/// wrote an empty database, which looks like success from the outside.
/// </summary>
internal sealed class SaveCheckForm : Form
{
    private readonly WebView2 _view = new();
    private readonly string _dataDir;
    private int _exit = 1;

    public SaveCheckForm(string dataDir)
    {
        _dataDir = dataDir;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        Location = new System.Drawing.Point(-4000, -4000);   // never seen
        Size = new System.Drawing.Size(900, 700);
        _view.Dock = DockStyle.Fill;
        Controls.Add(_view);
        Shown += async (_, _) => await Go();
    }

    public static int Run(string dataDir)
    {
        var form = new SaveCheckForm(dataDir);

        // A watchdog. If WebView2 cannot start at all - no interactive desktop, for
        // instance - the message loop would otherwise sit there forever holding a
        // process, which is exactly what the first version of this did.
        var watchdog = new System.Windows.Forms.Timer { Interval = 60000 };
        watchdog.Tick += (_, _) =>
        {
            Console.WriteLine("  RESULT          : FAIL - timed out after 60s "
                + "(no interactive desktop?)");
            Console.Out.Flush();
            Environment.Exit(1);
        };
        watchdog.Start();

        try
        {
            Application.Run(form);
        }
        catch (Exception e)
        {
            Console.WriteLine("  RESULT          : FAIL - " + e.Message);
        }
        Console.Out.Flush();
        return form._exit;
    }

    private async Task Go()
    {
        string result;
        try
        {
            Directory.CreateDirectory(_dataDir);
            Program.ExtractPage();

            var env = await CoreWebView2Environment.CreateAsync(userDataFolder: _dataDir);
            await _view.EnsureCoreWebView2Async(env);
            var core = _view.CoreWebView2;

            core.SetVirtualHostNameToFolderMapping(
                Program.Host, Program.WebDir, CoreWebView2HostResourceAccessKind.Allow);

            var loaded = new TaskCompletionSource<bool>();
            core.NavigationCompleted += (_, e) => loaded.TrySetResult(e.IsSuccess);
            core.Navigate("https://" + Program.Host + "/" + Program.Page);

            bool ok;
            try { ok = await Task.WhenAny(loaded.Task, Task.Delay(20000)) == loaded.Task
                        && loaded.Task.Result; }
            catch { ok = false; }

            Console.WriteLine("PCForge save check, in the real runtime");
            Console.WriteLine("  origin          : https://" + Program.Host + "/" + Program.Page);
            Console.WriteLine("  storage folder  : " + _dataDir);
            Console.WriteLine("  page loaded     : " + (ok ? "yes" : "NO"));

            if (!ok)
            {
                _exit = 1;
                Console.WriteLine("  RESULT          : FAIL - the page did not load, "
                    + "so nothing could be saved");
                Console.Out.Flush();
                Environment.Exit(1);
                return;
            }

            // give the game enough time to boot and write its first save
            await Task.Delay(2500);

            // Ask the PAGE, not the filesystem. The page is the only thing that
            // knows whether localStorage is actually writable here.
            const string probe = @"(() => {
                const K = 'pcforge.save.v1';
                let raw = null, err = null;
                try { raw = localStorage.getItem(K); } catch (e) { err = String(e); }
                let st = null;
                try { st = raw ? JSON.parse(raw).state : null; } catch (e) {}
                let writable = 'no';
                try { localStorage.setItem('__probe', 'x'); writable = localStorage.getItem('__probe') === 'x' ? 'yes' : 'no'; localStorage.removeItem('__probe'); } catch (e) { writable = 'threw: ' + e.message; }
                return { storageWritable: writable, saveFound: !!raw,
                         saveBytes: raw ? raw.length : 0,
                         board: st ? st.board : null,
                         cpu: st ? st.cpu : null,
                         budget: st ? Math.round(st.budget) : null,
                         hours: st ? st.hours : null,
                         error: err };
            })()";

            var raw2 = await core.ExecuteScriptAsync(probe);
            Console.WriteLine("  page said       : " + raw2);

            bool good = raw2.Contains("\"storageWritable\":\"yes\"")
                        && raw2.Contains("\"saveFound\":true")
                        && raw2.Contains("\"budget\":350");
            Console.WriteLine("  RESULT          : " + (good ? "PASS" : "FAIL"));
            Console.WriteLine("  meaning         : storage " +
                (raw2.Contains("\"storageWritable\":\"yes\"") ? "is writable" : "is NOT writable")
                + ", a save " + (raw2.Contains("\"saveFound\":true") ? "exists" : "does NOT exist")
                + ", and it holds the opening $" + S.LoanAmount + " loan");
            _exit = good ? 0 : 1;
        }
        catch (Exception e)
        {
            Console.WriteLine("  RESULT          : FAIL - " + e.Message);
            Console.Out.Flush();
            _exit = 1;
            Environment.Exit(1);
            return;
        }
        Console.Out.Flush();
        Environment.Exit(_exit);
    }

    private static class S { public const int LoanAmount = 350; }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        base.OnFormClosed(e);
        Application.ExitThread();
    }
}