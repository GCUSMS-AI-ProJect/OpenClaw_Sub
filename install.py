#!/usr/bin/env python3
"""Install the bundled desktop/runtime into a fresh Linux user profile."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import secrets
import shlex
import shutil
import subprocess
import sys
import tarfile

BUNDLE = Path(__file__).resolve().parent
VERSION = '2026.10.5'
NODE = 'node-v24.21.0'


def check_integrity():
    manifest = json.loads((BUNDLE / 'checksums.json').read_text())
    for name, expected in manifest.items():
        path = BUNDLE / name
        digest = hashlib.sha256()
        with path.open('rb') as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b''):
                digest.update(chunk)
        if digest.hexdigest() != expected:
            raise RuntimeError('文件校验失败：' + name)
    print('安装包文件校验通过。')


def unpack_runtime(destination):
    destination.mkdir(parents=True, exist_ok=True)
    root = destination.resolve()
    with tarfile.open(BUNDLE / 'runtime.tar.gz') as archive:
        # Reject paths or links outside the tools directory before extracting.
        for member in archive:
            path = (root / member.name).resolve()
            if not path.is_relative_to(root):
                raise RuntimeError('运行时包含无效路径。')
            if member.isdev() or member.isfifo():
                raise RuntimeError('运行时包含无效文件类型。')
            if member.issym():
                target = (path.parent / member.linkname).resolve()
                if not target.is_relative_to(root):
                    raise RuntimeError('运行时包含外部符号链接。')
            if member.islnk() and not (root / member.linkname).resolve().is_relative_to(root):
                raise RuntimeError('运行时包含外部硬链接。')
        archive.extractall(root)


def prepare(target_home):
    state = target_home / '.openclaw'
    if state.exists() and any(state.iterdir()):
        raise RuntimeError('目标已有 .openclaw 数据，本安装包不会覆盖。请使用一个全新的系统用户安装。')
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    state.chmod(0o700)
    tools = state / 'tools'
    print('正在解压程序运行时……')
    unpack_runtime(tools)
    package = tools / NODE / 'lib/node_modules/openclaw'
    subprocess.run([sys.executable, str(BUNDLE / 'customizations/install.py'), '--ui-dir', str(package / 'dist/control-ui')], check=True)
    source_copy = target_home / '.local/share/openclaw-ui-customizations'
    shutil.copytree(BUNDLE / 'customizations', source_copy, dirs_exist_ok=True)
    workspace = state / 'workspace'
    shutil.copytree(BUNDLE / 'avatars', workspace / 'avatars', dirs_exist_ok=True)
    # Fresh configuration only: never copy source credentials or model providers.
    config = {
        'gateway': {'mode': 'local', 'auth': {'mode': 'token', 'token': secrets.token_hex(24)}},
        'agents': {'defaults': {'workspace': str(workspace)}, 'entries': {'main': {'identity': {
            'name': 'Assistant', 'emoji': '🦞', 'avatar': 'avatars/openclaw-official.png'
        }}}},
    }
    config_path = state / 'openclaw.json'
    config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
    config_path.chmod(0o600)
    runtime = next((tools / 'desktop-runtime').glob('*/bin/bun'))
    entry = package / 'dist/entry.js'
    wrapper = state / 'bin/openclaw'
    wrapper.parent.mkdir(parents=True, exist_ok=True)
    metadata = {'purpose': 'gateway', 'runtime': {'bun': str(runtime), 'sqlite': None}, 'entry': str(entry)}
    wrapper.write_text('#!/bin/sh\n# OpenClaw-Tauri runtime v1 ' + json.dumps(metadata, separators=(',', ':')) + '\n'
                       'unset OPENCLAW_SQLITE_LIBRARY LD_LIBRARY_PATH\n'
                       'exec ' + shlex.quote(str(runtime)) + ' --no-install ' + shlex.quote(str(entry)) + ' "$@"\n')
    wrapper.chmod(0o755)
    local_bin = target_home / '.local/bin'
    local_bin.mkdir(parents=True, exist_ok=True)
    cli = local_bin / 'openclaw'
    if cli.exists() or cli.is_symlink():
        raise RuntimeError('目标已存在 ~/.local/bin/openclaw，请自行处理后再安装。')
    cli.symlink_to(wrapper)
    launcher = local_bin / 'openclaw-desktop'
    launcher.write_text('#!/bin/sh\nexport WEBKIT_DISABLE_DMABUF_RENDERER=1\n'
                        'export WEBKIT_DISABLE_COMPOSITING_MODE=1\nexec /usr/bin/openclaw-desktop "$@"\n')
    launcher.chmod(0o755)
    apps = target_home / '.local/share/applications'
    apps.mkdir(parents=True, exist_ok=True)
    # Desktop Exec quoting is separate from shell quoting.
    desktop_exec = str(launcher).replace('\\', '\\\\').replace('"', '\\"').replace('`', '\\`').replace('$', '\\$').replace('%', '%%')
    (apps / 'OpenClaw.desktop').write_text('[Desktop Entry]\nType=Application\nName=OpenClaw\n'
        'Comment=OpenClaw Linux companion\nExec="' + desktop_exec + '"\nIcon=openclaw-desktop\n'
        'Terminal=false\nCategories=Utility;\nStartupWMClass=openclaw-desktop\nMimeType=x-scheme-handler/openclaw;\n')
    return wrapper, config_path


def install_service(wrapper):
    process = subprocess.run([str(wrapper), 'gateway', 'install', '--allow-unconfigured', '--wrapper', str(wrapper), '--json'], text=True, capture_output=True)
    if process.returncode:
        raise RuntimeError('Gateway 服务安装失败。可重新执行 ~/.openclaw/bin/openclaw gateway install --allow-unconfigured --wrapper ~/.openclaw/bin/openclaw --json。')


def main():
    if sys.version_info < (3, 9):
        raise RuntimeError('需要 Python 3.9 或更新版本，建议 Ubuntu 22.04/24.04 或更新系统。')
    parser = argparse.ArgumentParser(description='OpenClaw 新电脑安装包（无供应商/密钥/个人记录）')
    parser.add_argument('--check', action='store_true', help='只检查平台和安装包完整性')
    parser.add_argument('--prepare-only', action='store_true', help='仅解压和生成新配置，不安装系统包或服务')
    parser.add_argument('--target-home', type=Path, help='仅在 --prepare-only 时指定隔离目录')
    args = parser.parse_args()
    if platform.system() != 'Linux' or platform.machine() not in ('x86_64', 'amd64'):
        raise RuntimeError('此包仅支持 Linux x86_64/amd64，适用于 Ubuntu/Debian，不适用于 Windows、macOS 或 ARM。')
    if args.target_home and not args.prepare_only:
        raise RuntimeError('--target-home 仅可与 --prepare-only 一起使用。')
    check_integrity()
    if args.check:
        print('平台检查通过：Linux amd64。正式安装需要 Python 3.9+、apt、systemd 用户会话。')
        return
    target = (args.target_home or Path.home()).expanduser().resolve()
    state = target / '.openclaw'
    if state.exists() and any(state.iterdir()):
        raise RuntimeError('目标已有 .openclaw 数据，本安装包不会覆盖。请使用一个全新的系统用户安装。')
    for path in [target / '.local/bin/openclaw', target / '.local/bin/openclaw-desktop', target / '.local/share/applications/OpenClaw.desktop']:
        if path.exists() or path.is_symlink():
            raise RuntimeError('目标已有安装文件，不会覆盖：' + str(path))
    if not args.prepare_only:
        if os.geteuid() == 0:
            raise RuntimeError('请以普通桌面用户运行 bash install.sh，不要在整个安装命令前加 sudo。')
        if not shutil.which('apt') or not shutil.which('systemctl'):
            raise RuntimeError('需要基于 Debian/Ubuntu、具有 systemd 用户服务的桌面系统。')
        print('正在安装桌面应用和系统依赖，sudo 可能要求输入本机密码。')
        subprocess.run(['sudo', 'apt', 'install', '-y', str(BUNDLE / 'packages/OpenClaw-2026.10.5-amd64.deb')], check=True)
    wrapper, config = prepare(target)
    if args.prepare_only:
        print('隔离准备完成，未安装系统软件、未启动服务。')
        return
    install_service(wrapper)
    if shutil.which('update-desktop-database'):
        subprocess.run(['update-desktop-database', str(target / '.local/share/applications')], check=False, capture_output=True)
    print('安装完成！从应用菜单打开 OpenClaw；请在模型设置中自行添加供应商和 API Key。')
    print('首次连接如需打开本机控制台，可运行：~/.openclaw/bin/openclaw dashboard')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, subprocess.SubprocessError, ValueError) as error:
        print('安装未完成：' + str(error), file=sys.stderr)
        sys.exit(1)
