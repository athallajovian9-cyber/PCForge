using System;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace PCForgeShell;

/// <summary>
/// The window itself: no title bar, no menu, no browser chrome. A slim header the
/// game's own colour, dragging anywhere on it moves the window, and the WebView
/// fills the rest. It reads as a game window rather than a web page because
/// nothing tells you it is a web page.
/// </summary>
internal sealed class ShellForm : Form
{
    private const int ResizeBorder = 6;
    private const int HeaderHeight = 34;

    private static readonly Color Bg = Color.FromArgb(0x0b, 0x0e, 0x14);
    private static readonly Color Border = Color.FromArgb(0x21, 0x2b, 0x3d);
    private static readonly Color Cyan = Color.FromArgb(0x00, 0xe5, 0xff);
    private static readonly Color Muted = Color.FromArgb(0x82, 0x90, 0xa6);
    private static readonly Color Red = Color.FromArgb(0xf4, 0x3f, 0x5e);

    private readonly WebView2 _view = new();
    private readonly Panel _header = new();
    private readonly Button _close = new();
    private readonly Button _max = new();
    private readonly Button _min = new();

    private bool _dragging;
    private Point _dragOrigin;

    public ShellForm()
    {
        Text = Program.Title;
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Bg;
        MinimumSize = new Size(900, 620);
        ClientSize = new Size(1500, 940);
        DoubleBuffered = true;
        KeyPreview = true;

        BuildHeader();
        _view.Dock = DockStyle.Fill;
        Controls.Add(_view);
        Controls.Add(_header);

        KeyDown += OnKeyDown;
        Shown += async (_, _) => await StartAsync();
    }

    // ------------------------------------------------------------------ header
    private void BuildHeader()
    {
        _header.Dock = DockStyle.Top;
        _header.Height = HeaderHeight;
        _header.BackColor = Bg;
        _header.MouseDown += (s, e) => BeginDrag(e);
        _header.MouseMove += (s, e) => ContinueDrag(e);
        _header.MouseUp += (_, _) => _dragging = false;
        _header.Paint += (_, e) =>
        {
            using var pen = new Pen(Border);
            e.Graphics.DrawLine(pen, 0, _header.Height - 1, _header.Width, _header.Height - 1);
            using var font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            using var cyan = new SolidBrush(Cyan);
            e.Graphics.DrawString("PCFORGE", font, cyan, 12, 10);
            using var small = new Font("Consolas", 8f);
            e.Graphics.DrawString("build it, then find the wall", small, new SolidBrush(Muted), 84, 12);
        };

        MakeButton(_min, "\u2013", "minimise", (_, _) => WindowState = FormWindowState.Minimized);
        MakeButton(_max, "\u25a1", "maximise", (_, _) => ToggleMaximise());
        MakeButton(_close, "\u2715", "close", (_, _) => Close());
        _close.ForeColor = Red;
        _header.Controls.Add(_min);
        _header.Controls.Add(_max);
        _header.Controls.Add(_close);
    }

    private void MakeButton(Button b, string glyph, string tip, EventHandler onClick)
    {
        b.Text = glyph;
        b.FlatStyle = FlatStyle.Flat;
        b.FlatAppearance.BorderSize = 0;
        b.FlatAppearance.MouseOverBackColor = Color.FromArgb(0x1b, 0x24, 0x34);
        b.BackColor = Bg;
        b.ForeColor = Muted;
        b.Font = new Font("Segoe UI", 9f);
        b.TabStop = false;
        b.Size = new Size(42, HeaderHeight);
        b.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        b.Cursor = Cursors.Hand;
        b.Click += onClick;
        var t = new ToolTip();
        t.SetToolTip(b, tip);
    }

    private void LayoutButtons()
    {
        int right = _header.Width;
        _close.Location = new Point(right - 42, 0);
        _max.Location = new Point(right - 84, 0);
        _min.Location = new Point(right - 126, 0);
    }

    private void BeginDrag(MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left) return;
        _dragging = true;
        _dragOrigin = e.Location;
    }

    private void ContinueDrag(MouseEventArgs e)
    {
        if (!_dragging) return;
        if (WindowState == FormWindowState.Maximized)
        {
            // dragging a maximised window restores it, as every window manager does
            var screenPoint = PointToScreen(e.Location);
            WindowState = FormWindowState.Normal;
            Location = new Point(screenPoint.X - Width / 2, screenPoint.Y - e.Y);
            return;
        }
        Location = new Point(
            Location.X + e.X - _dragOrigin.X,
            Location.Y + e.Y - _dragOrigin.Y);
    }

    private void ToggleMaximise()
    {
        WindowState = WindowState == FormWindowState.Maximized
            ? FormWindowState.Normal
            : FormWindowState.Maximized;
        _max.Text = WindowState == FormWindowState.Maximized ? "\u2750" : "\u25a1";
    }

    private void OnKeyDown(object? sender, KeyEventArgs e)
    {
        if (e.KeyCode == Keys.F11) { ToggleMaximise(); e.Handled = true; }
        if (e.KeyCode == Keys.Escape && WindowState == FormWindowState.Maximized)
        {
            WindowState = FormWindowState.Normal;
            e.Handled = true;
        }
    }

    // -------------------------------------------------------------- the web view
    private async System.Threading.Tasks.Task StartAsync()
    {
        try
        {
            Directory.CreateDirectory(Program.DataDir);
            string page = Program.ExtractPage();

            var env = await CoreWebView2Environment.CreateAsync(
                userDataFolder: Program.DataDir);
            await _view.EnsureCoreWebView2Async(env);

            var core = _view.CoreWebView2;

            // A real origin instead of file://, so the game's save is guaranteed
            // rather than merely usually working.
            core.SetVirtualHostNameToFolderMapping(
                Program.Host, Program.WebDir, CoreWebView2HostResourceAccessKind.Allow);

            var s = core.Settings;
            s.AreDefaultContextMenusEnabled = false;   // not a web page
            s.AreBrowserAcceleratorKeysEnabled = false; // no Ctrl+P, no F5, no zoom keys
            s.IsZoomControlEnabled = false;
            s.IsStatusBarEnabled = false;
            s.IsSwipeNavigationEnabled = false;
            s.AreDevToolsEnabled = false;
            s.IsPasswordAutosaveEnabled = false;
            s.IsGeneralAutofillEnabled = false;

            // Inside the shell, links that leave the game should not take the game
            // window with them.
            core.NewWindowRequested += (_, e) => { e.Handled = true; };

            core.Navigate("https://" + Program.Host + "/" + Program.Page);
        }
        catch (Exception e)
        {
            var label = new Label
            {
                Dock = DockStyle.Fill,
                ForeColor = Red,
                BackColor = Bg,
                Font = new Font("Consolas", 10f),
                Padding = new Padding(24),
                Text = "PCForge could not start its web view.\r\n\r\n" + e.Message
                    + "\r\n\r\nThe WebView2 runtime is required. It ships with Microsoft Edge;\r\n"
                    + "if Edge has been removed, install the WebView2 Runtime from Microsoft.",
            };
            Controls.Add(label);
            label.BringToFront();
        }
    }

    // ------------------------------------------------------- frameless resizing
    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        LayoutButtons();
        using var g = CreateGraphics();
        // Windows 11 rounds the corners of a normal window; a frameless one has to
        // ask, and the composited region is what gives the app its own edges.
        Region = WindowState == FormWindowState.Maximized
            ? null
            : Region.FromHrgn(CreateRoundRectRgn(0, 0, Width + 1, Height + 1, 10, 10));
    }

    protected override void WndProc(ref Message m)
    {
        const int WM_NCHITTEST = 0x0084;
        if (m.Msg == WM_NCHITTEST && WindowState == FormWindowState.Normal)
        {
            base.WndProc(ref m);
            var p = PointToClient(new Point(m.LParam.ToInt32() & 0xFFFF,
                m.LParam.ToInt32() >> 16));
            bool left = p.X <= ResizeBorder, right = p.X >= ClientSize.Width - ResizeBorder;
            bool top = p.Y <= ResizeBorder, bottom = p.Y >= ClientSize.Height - ResizeBorder;
            if (top && left) m.Result = (IntPtr)HTTOPLEFT;
            else if (top && right) m.Result = (IntPtr)HTTOPRIGHT;
            else if (bottom && left) m.Result = (IntPtr)HTBOTTOMLEFT;
            else if (bottom && right) m.Result = (IntPtr)HTBOTTOMRIGHT;
            else if (left) m.Result = (IntPtr)HTLEFT;
            else if (right) m.Result = (IntPtr)HTRIGHT;
            else if (top) m.Result = (IntPtr)HTTOP;
            else if (bottom) m.Result = (IntPtr)HTBOTTOM;
            return;
        }
        base.WndProc(ref m);
    }

    private const int HTLEFT = 10, HTRIGHT = 11, HTTOP = 12, HTTOPLEFT = 13,
        HTTOPRIGHT = 14, HTBOTTOM = 15, HTBOTTOMLEFT = 16, HTBOTTOMRIGHT = 17;

    [DllImport("gdi32.dll")]
    private static extern IntPtr CreateRoundRectRgn(
        int l, int t, int r, int b, int w, int h);
}