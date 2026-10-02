# -*- mode: python ; coding: utf-8 -*-
# One file in, one exe out. The page is bundled as data so the launcher has
# something to present; no icon yet, so none is declared rather than pointing at
# a file that does not exist.

a = Analysis(
    ['launcher.py'],
    pathex=[],
    binaries=[],
    datas=[('PCForge.html', '.')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='PCForge',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
