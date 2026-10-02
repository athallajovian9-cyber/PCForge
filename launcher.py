#!/usr/bin/env python3
"""
PCForge launcher - a single .exe that opens the game in a clean app window.

WHY IT WORKS THIS WAY
    The game is one self-contained .html with no dependencies, so the only job
    here is presenting it: no installer, no bundled runtime, no admin.

TWO THINGS THAT WENT WRONG, AND WHAT THEY TAUGHT THIS FILE

    1. A windowless browser instance is a black hole. Chromium opens a URL by
       handing it to any instance already using that profile, then the new
       process exits. If the holder is running in a session with no visible
       desktop - a service session, a crashed shell, a killed-but-surviving
       process - every later launch silently does nothing at all. The user
       double-clicks and gets no window, no error, no clue.

       So: any instance holding OUR profile is stopped before we launch. Every
       launch is a fresh window that is guaranteed to appear. The game keeps no
       save state, so nothing is lost by this.

    2. Preferring Chrome is wrong when the user's default browser is Brave.
       We ask Windows what the default is, and if it is any Chromium-family
       browser we use that one. Chrome and Edge are fallbacks, not policy.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

APP = "PCForge"
TITLE = "PCForge - build it, then find the wall"
WINDOW = "1500,940"

# Windows: no console window when we shell out, and do not inherit the handles.
CREATE_NO_WINDOW = 0x08000000
DETACHED_PROCESS = 0x00000008

# Everything Chromium-based that can do --app=. Brave is here because Brave is
# what the default-browser lookup will usually hand back on this machine.
CHROMIUM_NAMES = {
    "chrome.exe", "brave.exe", "msedge.exe", "vivaldi.exe",
    "chromium.exe", "opera.exe", "thorium.exe", "yandex.exe",
}


def log_path() -> Path:
    d = Path(os.environ.get("LOCALAPPDATA", tempfile.gettempdir())) / APP
    try:
        d.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    return d / "launcher.log"


def note(msg: str) -> None:
    """Append a line to the launch log.

    A launcher that fails silently is the bug this file now exists to prevent,
    so every path writes what it did to a file that survives the process. The log
    is truncated rather than rotated: the last run is what matters.
    """
    line = time.strftime("%Y-%m-%d %H:%M:%S") + "  " + msg
    try:
        p = log_path()
        if p.is_file() and p.stat().st_size > 60000:
            p.unlink()
        with p.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass


def base_dir() -> Path:
    """Where our files live: the PyInstaller temp dir when frozen, else here."""
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return Path(__file__).resolve().parent


def profile_dir() -> Path:
    """The game's own browser profile, kept out of the user's real one."""
    return Path(os.environ.get("LOCALAPPDATA", tempfile.gettempdir())) / APP / "profile"


# ------------------------------------------------------------------ browser
def _reg(path: str, name: str):
    """Read one registry value, or None. Kept small so a failure is uneventful."""
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, path) as k:
            return winreg.QueryValueEx(k, name)[0]
    except Exception:
        return None


def _exe_from_progid(progid: str):
    """Turn a ProgId like BraveHTML into the full path of its executable."""
    if not progid:
        return None
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CLASSES_ROOT,
                            progid + r"\shell\open\command") as k:
            cmd = winreg.QueryValueEx(k, "")[0]
    except Exception:
        return None
    cmd = cmd.strip()
    if cmd.startswith('"'):
        exe = cmd[1:cmd.index('"', 1)]
    else:
        exe = cmd.split(" ")[0]
    p = Path(exe)
    return p if p.is_file() else None


def default_browser():
    """The user's default browser, if it is one we can drive with --app."""
    progid = _reg(r"SOFTWARE\Microsoft\Windows\Shell\Associations"
                  r"\UrlAssociations\http\UserChoice", "ProgId")
    exe = _exe_from_progid(progid)
    if exe and exe.name.lower() in CHROMIUM_NAMES:
        return exe
    return None


def find_browser():
    """Fallbacks: Chrome, then Edge, in the usual install locations."""
    pf = os.environ.get("ProgramFiles", r"C:\Program Files")
    pf86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
    local = os.environ.get("LOCALAPPDATA", "")
    for c in [
        Path(pf) / "Google/Chrome/Application/chrome.exe",
        Path(pf86) / "Google/Chrome/Application/chrome.exe",
        Path(local) / "Google/Chrome/Application/chrome.exe",
        Path(pf) / "BraveSoftware/Brave-Browser/Application/brave.exe",
        Path(local) / "BraveSoftware/Brave-Browser/Application/brave.exe",
        Path(pf) / "Microsoft/Edge/Application/msedge.exe",
        Path(pf86) / "Microsoft/Edge/Application/msedge.exe",
    ]:
        if c.is_file():
            return c
    return None


def choose_browser():
    b = default_browser()
    if b:
        return b, "the default browser"
    b = find_browser()
    if b:
        return b, "fallback (no Chromium default browser found)"
    return None, "none"


# ------------------------------------------------------- our own instances
_PS_LIST = (
    "$ErrorActionPreference='SilentlyContinue';"
    "Get-CimInstance Win32_Process | "
    "Where-Object { $_.CommandLine -like '*PCForge*profile*' } | "
    "Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress"
)


def instances():
    """Processes holding OUR profile. Nothing else on the machine uses that path.

    Identified by the profile path rather than by browser name, so this stays
    correct whatever browser the user prefers.
    """
    try:
        r = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", _PS_LIST],
            capture_output=True, text=True, timeout=25,
            creationflags=CREATE_NO_WINDOW,
        )
        raw = (r.stdout or "").strip()
        if not raw:
            return []
        data = json.loads(raw)
        if isinstance(data, dict):
            data = [data]
    except Exception:
        return []
    needle = str(profile_dir()).lower()
    out = []
    for p in data:
        cl = (p.get("CommandLine") or "")
        # Only ever kill a browser, and only one that names our profile.
        if cl.lower().find(needle) >= 0 and str(p.get("Name", "")).lower() in CHROMIUM_NAMES:
            out.append((int(p["ProcessId"]), p.get("Name", "?")))
    return out


def stop_game(verbose=True) -> int:
    """Close any instance holding our profile. Returns how many were stopped."""
    procs = instances()
    if not procs:
        if verbose:
            print("  no PCForge window was running")
        return 0
    for pid, name in procs:
        subprocess.run(["taskkill", "/F", "/PID", str(pid)],
                       capture_output=True, text=True,
                       creationflags=CREATE_NO_WINDOW)
    if verbose:
        print(f"  closed {len(procs)} {procs[0][1]} process(es) holding the game window")
    return len(procs)


# --------------------------------------------------------------- the page
def stage_page() -> Path:
    """Put the game somewhere a browser can load it from."""
    src = base_dir() / "PCForge.html"
    if not src.is_file():
        alt = Path(sys.executable).parent / "PCForge.html"
        if alt.is_file():
            src = alt
        else:
            raise SystemExit(
                "  PCForge.html not found.\n"
                f"  Looked in: {base_dir()}\n"
                f"             {Path(sys.executable).parent}"
            )
    dest_dir = Path(os.environ.get("LOCALAPPDATA", tempfile.gettempdir())) / APP
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / "PCForge.html"
    try:
        shutil.copy2(src, dest)
    except OSError:
        pass
    return dest if dest.is_file() else src


def self_check() -> int:
    """Verify the bundle without opening a browser window."""
    page = stage_page()
    html = page.read_text(encoding="utf-8", errors="replace")
    external = []
    for line in html.split("<script src=")[1:]:
        external.append(line.split('"')[1] if '"' in line else "?")
    browser, how = choose_browser()
    held = instances()
    lines = [
        "PCForge launch check",
        "  page staged at : " + str(page),
        "  bytes          : " + str(len(html)),
        "  external refs  : " + (", ".join(external) if external else "none"),
        "  self-contained : " + ("yes" if not external else "NO"),
        "  browser        : " + str(browser or "none") + "  (" + how + ")",
        "  stale windows  : " + (str(len(held)) + " would be closed on launch"
                                if held else "none"),
        "  RESULT         : " + ("PASS" if not external and len(html) > 5000 else "FAIL"),
    ]
    report = "\n".join(lines)
    print(report)
    try:
        (Path(sys.executable).parent / "_launch_check.txt").write_text(report, encoding="utf-8")
    except OSError:
        pass
    return 0 if "PASS" in lines[-1] else 1


def main() -> int:
    args = sys.argv[1:]
    if "--check" in args:
        return self_check()
    if "--stop" in args:
        return 0 if stop_game() >= 0 else 1

    note("--- launch requested  argv=" + repr(sys.argv[1:]) + "  pid=" + str(os.getpid())
         + "  frozen=" + str(getattr(sys, "frozen", False)))
    try:
        page = stage_page()
    except SystemExit as e:
        note("FATAL stage_page: " + str(e))
        raise
    url = page.as_uri()
    note("page staged: " + str(page))
    browser, how = choose_browser()
    note("browser: " + str(browser) + "  (" + how + ")")

    if not browser:
        print("  No Chrome, Brave or Edge found - opening with the default handler.")
        try:
            os.startfile(str(page))  # noqa: S606 - intended: OS handler
            return 0
        except Exception as e:
            print(f"  could not open the page: {e}")
            print(f"  Open it by hand: {page}")
            return 1

    # Heal before launching. This is the fix for the silent-no-window failure:
    # whatever holds our profile is stopped, so this launch cannot be swallowed.
    held = instances()
    note("holders of the profile: " + str([h[0] for h in held]))
    if held:
        print(f"  a previous game window was still holding the profile "
              f"({len(held)} process(es)) - closing it so this one appears")
        stop_game(verbose=False)
        time.sleep(1.5)          # let the old instance actually die first

    prof = profile_dir()
    prof.mkdir(parents=True, exist_ok=True)
    cmd = [
        str(browser),
        f"--app={url}",
        f"--user-data-dir={prof}",       # isolated from the user's real profile
        f"--window-size={WINDOW}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-features=Translate",
    ]
    note("launching: " + " ".join(cmd))
    try:
        proc = subprocess.Popen(cmd, creationflags=DETACHED_PROCESS | CREATE_NO_WINDOW,
                                close_fds=True)
    except OSError as e:
        note("FATAL could not start " + browser.name + ": " + str(e))
        print(f"  could not start {browser.name}: {e}")
        return 1
    note("started pid " + str(proc.pid))

    # Confirm it took. A browser that dies at once is exactly the failure that
    # used to be invisible: a window that never appears and no error anywhere.
    time.sleep(3.0)
    alive = instances()
    if alive:
        note("OK: " + str(len(alive)) + " process(es) holding the profile")
    else:
        rc = proc.poll()
        note("WARNING: nothing took the profile. browser pid alive="
             + ("yes" if rc is None else "no, exit=" + str(rc)))
        print("  the browser started but no window took the profile - see "
              + str(log_path()))

    print(f"  opening PCForge in {browser.name} ({how})")
    print(f"  window: {TITLE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
