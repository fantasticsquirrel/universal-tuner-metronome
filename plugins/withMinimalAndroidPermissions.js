const fs = require('node:fs/promises');
const path = require('node:path');
const { AndroidConfig, withDangerousMod } = require('expo/config-plugins');

// Release builds bundle all of Tunera's code and audio. Keep Metro/network and
// developer-menu permissions available in debug builds only.
const RELEASE_BLOCKED_PERMISSIONS = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.SYSTEM_ALERT_WINDOW',
];

function minimizeReleaseManifest(manifest) {
  AndroidConfig.Manifest.ensureToolsAvailable(manifest);
  // Migrate an already-prebuilt audit candidate: WAKE_LOCK was previously
  // blocked, but the release keeps Media3's playback lock. Leave unrelated
  // manifest settings alone and let the dependency provide this permission.
  manifest.manifest['uses-permission'] = (manifest.manifest['uses-permission'] || [])
    .filter((permission) => !(
      permission.$['android:name'] === 'android.permission.WAKE_LOCK'
      && permission.$['tools:node'] === 'remove'
    ));
  return AndroidConfig.Permissions.addBlockedPermissions(manifest, RELEASE_BLOCKED_PERMISSIONS);
}

function withMinimalAndroidPermissions(config) {
  return withDangerousMod(config, ['android', async (modConfig) => {
    const manifestPath = path.join(
      modConfig.modRequest.platformProjectRoot,
      'app/src/release/AndroidManifest.xml',
    );
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    let manifest;
    try {
      await fs.access(manifestPath);
      manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(manifestPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      manifest = { manifest: { $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' } } };
    }
    await AndroidConfig.Manifest.writeAndroidManifestAsync(manifestPath, minimizeReleaseManifest(manifest));
    return modConfig;
  }]);
}

module.exports = withMinimalAndroidPermissions;
module.exports.RELEASE_BLOCKED_PERMISSIONS = RELEASE_BLOCKED_PERMISSIONS;
module.exports.minimizeReleaseManifest = minimizeReleaseManifest;
