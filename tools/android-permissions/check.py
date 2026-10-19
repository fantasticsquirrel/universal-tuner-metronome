#!/usr/bin/env python3
"""Fail closed on unexpected permissions in the merged release manifest or APK.

Usage:
  python3 tools/android-permissions/check.py path/to/merged/AndroidManifest.xml
  python3 tools/android-permissions/check.py --apk path/to/app-release.apk

For --apk, apkanalyzer must be on PATH (Android SDK command-line tools).
Do not pass app/src/main or app/src/release: they are merger inputs, not proof of
what the packaged app requests. This checker also rejects unresolved merge rules.
"""
import argparse
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path

ANDROID = '{http://schemas.android.com/apk/res/android}'
TOOLS = '{http://schemas.android.com/tools}'
EXPECTED_PERMISSIONS = {
    'android.permission.RECORD_AUDIO',
    'android.permission.MODIFY_AUDIO_SETTINGS',
    'android.permission.VIBRATE',
    'android.permission.WAKE_LOCK',
    'app.tunera.mobile.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
}


def check_manifest(xml):
    root = ET.fromstring(xml)
    if root.get('package') != 'app.tunera.mobile':
        raise ValueError('Expected the fully merged Tunera manifest with its package identity.')
    if any(key.startswith(TOOLS) for node in root.iter() for key in node.attrib):
        raise ValueError('Unresolved tools attributes: use the final merged or APK manifest.')
    permissions = {
        node.get(ANDROID + 'name') for node in root
        if node.tag in {'uses-permission', 'uses-permission-sdk-23', 'uses-permission-sdk-m'}
    }
    if permissions != EXPECTED_PERMISSIONS:
        raise ValueError(
            f'Unexpected permissions: {sorted(permissions - EXPECTED_PERMISSIONS)}; '
            f'missing expected permissions: {sorted(EXPECTED_PERMISSIONS - permissions)}'
        )
    application = root.find('application')
    if application is None or application.get(ANDROID + 'debuggable') == 'true':
        raise ValueError('Expected a non-debuggable release application.')
    if application.findall('service'):
        raise ValueError('Unexpected background service; audit it before changing this policy.')
    updates = [
        node.get(ANDROID + 'value') for node in application.findall('meta-data')
        if node.get(ANDROID + 'name') == 'expo.modules.updates.ENABLED'
    ]
    if updates != ['false']:
        raise ValueError('Expo updates must be explicitly disabled in this offline release.')
    internal = root.find('permission')
    if (internal is None
            or internal.get(ANDROID + 'name') != 'app.tunera.mobile.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'
            or internal.get(ANDROID + 'protectionLevel') != 'signature'):
        raise ValueError('The AndroidX receiver permission must retain signature protection.')
    return sorted(permissions)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path', type=Path)
    parser.add_argument('--apk', action='store_true')
    args = parser.parse_args()
    xml = subprocess.check_output(['apkanalyzer', 'manifest', 'print', str(args.path)], text=True) if args.apk else args.path.read_text()
    try:
        permissions = check_manifest(xml)
    except (ValueError, ET.ParseError) as error:
        parser.exit(1, f'FAIL: {error}\n')
    print('PASS: release permissions, no background services, disabled OTA, and receiver protection')
    print('\n'.join(permissions))


if __name__ == '__main__':
    main()
