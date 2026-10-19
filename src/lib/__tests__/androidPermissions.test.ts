const { minimizeReleaseManifest, RELEASE_BLOCKED_PERMISSIONS } = jest.requireActual('../../../plugins/withMinimalAndroidPermissions');

describe('release Android permission minimization', () => {
  it('removes unneeded capabilities even when transitive libraries declare them', () => {
    const result = minimizeReleaseManifest({
      manifest: {
        $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
        'uses-permission': [
          { $: { 'android:name': 'android.permission.INTERNET' } },
          { $: { 'android:name': 'android.permission.RECORD_AUDIO' } },
        ],
      },
    });
    expect(RELEASE_BLOCKED_PERMISSIONS).toEqual([
      'android.permission.INTERNET',
      'android.permission.ACCESS_NETWORK_STATE',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ]);
    expect(result.manifest.$['xmlns:tools']).toBe('http://schemas.android.com/tools');
    for (const permission of RELEASE_BLOCKED_PERMISSIONS) {
      expect(result.manifest['uses-permission']).toContainEqual({
        $: { 'android:name': permission, 'tools:node': 'remove' },
      });
    }
    expect(result.manifest['uses-permission']).toContainEqual({
      $: { 'android:name': 'android.permission.RECORD_AUDIO' },
    });
  });

  it('is idempotent and preserves other release manifest settings', () => {
    const original = {
      manifest: {
        $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
        application: [{ $: { 'android:label': 'Tunera' } }],
      },
    };
    const once = minimizeReleaseManifest(original);
    const expected = JSON.parse(JSON.stringify(once));
    expect(minimizeReleaseManifest(once)).toEqual(expected);
    expect(once.manifest.application).toEqual(original.manifest.application);
  });

  it('clears a stale wake-lock removal while preserving unrelated release rules', () => {
    const result = minimizeReleaseManifest({
      manifest: {
        $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
        'uses-permission': [
          { $: { 'android:name': 'android.permission.WAKE_LOCK', 'tools:node': 'remove' } },
          { $: { 'android:name': 'android.permission.CAMERA', 'tools:node': 'remove' } },
        ],
      },
    });
    expect(result.manifest['uses-permission']).not.toContainEqual({
      $: { 'android:name': 'android.permission.WAKE_LOCK', 'tools:node': 'remove' },
    });
    expect(result.manifest['uses-permission']).toContainEqual({
      $: { 'android:name': 'android.permission.CAMERA', 'tools:node': 'remove' },
    });
  });

});
