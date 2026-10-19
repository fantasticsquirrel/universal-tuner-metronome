import unittest

from check import EXPECTED_PERMISSIONS, check_manifest


def manifest(permissions=EXPECTED_PERMISSIONS, extra='', application_extra=''):
    uses = ''.join(f'<uses-permission android:name="{name}"/>' for name in permissions)
    return f'''<manifest xmlns:android="http://schemas.android.com/apk/res/android"
       xmlns:tools="http://schemas.android.com/tools" package="app.tunera.mobile">
      {uses}
      <permission android:name="app.tunera.mobile.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"
       android:protectionLevel="signature"/>
      {extra}
      <application>
       <meta-data android:name="expo.modules.updates.ENABLED" android:value="false"/>
       {application_extra}
      </application>
    </manifest>'''


class ManifestPolicyTest(unittest.TestCase):
    def test_accepts_exact_release_policy(self):
        self.assertEqual(check_manifest(manifest()), sorted(EXPECTED_PERMISSIONS))

    def test_rejects_unexpected_dependency_permission(self):
        with self.assertRaisesRegex(ValueError, 'Unexpected permissions'):
            check_manifest(manifest(EXPECTED_PERMISSIONS | {'android.permission.INTERNET'}))

    def test_rejects_missing_microphone(self):
        with self.assertRaisesRegex(ValueError, 'missing expected permissions'):
            check_manifest(manifest(EXPECTED_PERMISSIONS - {'android.permission.RECORD_AUDIO'}))

    def test_checks_sdk_specific_permission_tags(self):
        with self.assertRaisesRegex(ValueError, 'Unexpected permissions'):
            check_manifest(manifest(extra='<uses-permission-sdk-23 android:name="android.permission.READ_CONTACTS"/>'))

    def test_rejects_unmerged_removal_markers(self):
        with self.assertRaisesRegex(ValueError, 'Unresolved tools'):
            check_manifest(manifest(extra='<uses-permission android:name="android.permission.INTERNET" tools:node="remove"/>'))

    def test_rejects_background_service(self):
        with self.assertRaisesRegex(ValueError, 'Unexpected background service'):
            check_manifest(manifest(application_extra='<service android:name="UnreviewedService"/>'))

    def test_rejects_ota_enablement(self):
        with self.assertRaisesRegex(ValueError, 'updates must be explicitly disabled'):
            check_manifest(manifest().replace('android:value="false"', 'android:value="true"'))

    def test_rejects_weakened_receiver_protection(self):
        with self.assertRaisesRegex(ValueError, 'signature protection'):
            check_manifest(manifest().replace('android:protectionLevel="signature"', 'android:protectionLevel="normal"'))


if __name__ == '__main__':
    unittest.main()
