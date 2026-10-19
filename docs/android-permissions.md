# Android permission and privacy audit

Audited 2026-10-19 against source commit `cfadda6b5ec887f3eadfffa74f326951a421c38b`
(tree `5d6064abd66806d155fb57020983285369d6f5bc`) and the actual 0.2.5 preview APK.
APK SHA-256: `155448752132b6f734df0846151c11c31788a3e2cf630276b81c847c238efda4`.
Minimum Android API 29; target API 36. The 0.2.6 preview removes five permissions and retains WAKE_LOCK.
A new installation/update is required; source changes do not modify existing APKs.

## Shipped permissions and decisions

| Permission | Why it is in the shipped APK | Release policy |
| --- | --- | --- |
| RECORD_AUDIO | Native tuner and AudioStudio microphone input | Keep. The only user-facing runtime permission needed by Tunera. |
| MODIFY_AUDIO_SETTINGS | Expo Audio session/routing setup | Keep. Its native `setAudioModeAsync` sets audio mode and speakerphone routing. Normal install-time permission. |
| VIBRATE | Expo Haptics and optional metronome/tuner feedback | Keep. Normal install-time permission. |
| app.tunera.mobile.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION | AndroidX Core signature-protected dynamic receivers | Keep. Internal security mechanism, not access to personal data. |
| READ_EXTERNAL_STORAGE | Expo template and Expo FileSystem; capped at API 32 | Remove. No shared files are read. |
| WRITE_EXTERNAL_STORAGE | Expo template and Expo FileSystem; capped at API 32 | Remove. No shared files are written. |
| INTERNET | Expo template/FileSystem | Remove in release. App code, sounds, and font are bundled; no remote feature or OTA. |
| ACCESS_NETWORK_STATE | Media3 ExoPlayer/common through Expo Audio | Remove in release. Network information is unnecessary for local playback; installed Media3 handles the absent permission. |
| SYSTEM_ALERT_WINDOW | Expo's main Android template | Remove in release. No cross-app overlay feature. |
| WAKE_LOCK | Media3 ExoPlayer through Expo Audio | Keep for existing playback reliability. This does not control the app’s separate screen-on toggle. Normal install-time permission. |

The shipped APK has no location, contacts, phone-state, Bluetooth-connect,
notification, or foreground-service permission. It declares no background
service. The manifest-merger report attributes the transitive media permissions
to Media3 1.9.0 and filesystem permissions to Expo FileSystem 57.0.7.

A manifest declaration is not necessarily a runtime prompt. INTERNET,
ACCESS_NETWORK_STATE, MODIFY_AUDIO_SETTINGS, VIBRATE, and WAKE_LOCK are normal
permissions granted at installation. SYSTEM_ALERT_WINDOW is a special permission
approved through system settings. RECORD_AUDIO is a runtime permission.
READ/WRITE_EXTERNAL_STORAGE's API-32 cap leaves declarations on Android 10–12L;
that is not a reason to retain them for private storage.

## Data and dependency trace

- Settings, favorites, custom instruments, and metronome presets use AsyncStorage,
  backed by app-private SQLite on Android (`src/store/AppProvider.tsx`).
- Generated metronome loops use Expo FileSystem's `Paths.cache` in
  `src/audio/AudioProvider.tsx`. These synthesized WAV files are not microphone
  recordings. App-private cache and preferences need no broad storage permission.
- Four WAV files and the icon font are bundled. Reference-tone and metronome
  playback use those local assets or the private generated cache. Expo APIs named
  `downloadAsync` can resolve an already bundled resource locally.
- No application HTTP, upload, WebSocket, remote asset, or analytics call was found
  in `src`, `app`, or the custom native microphone module. This is a code audit,
  not a device packet-capture measurement.
- `expo-updates` is not installed; only the updates interface is present. The
  shipped release manifest already has `expo.modules.updates.ENABLED=false`.
  App configuration now makes the offline policy explicit with `updates.enabled=false`.
- Expo Audio calls audio-routing APIs that require MODIFY_AUDIO_SETTINGS. Haptics
  requires VIBRATE. Removing these would disable or jeopardize actual features.
- AndroidX's signature permission protects non-exported dynamic receivers on older
  supported Android versions. Removing a security boundary to shorten a list is
  inappropriate.

## Media3 networking and wake-lock behavior

These are based on installed Media3 **1.9.0**, checked against cached bytecode as
well as tagged upstream source. Re-audit on dependency upgrades.

- `NetworkTypeObserver.getNetworkTypeFromConnectivityManager` catches
  `SecurityException` from `getActiveNetworkInfo` and reports unknown network type.
  It does not need connectivity information to read local audio.
- `WakeLockManagerInternal.updateWakeLock` checks WAKE_LOCK permission before
  acquiring. The release retains that permission and existing playback behavior.
- `ExoPlayerImpl` may select WAKE_MODE_LOCAL by default when stuck-playback
  detection is enabled. This is why keeping WAKE_LOCK is a conservative playback
  choice even though the app does not directly create a PowerManager lock.
- Expo KeepAwake uses `FLAG_KEEP_SCREEN_ON`, which needs no WAKE_LOCK permission
  and applies while the app's activity is visible.

Sources:
- [Media3 network-state fallback](https://github.com/androidx/media/blob/1.9.0/libraries/common/src/main/java/androidx/media3/common/util/NetworkTypeObserver.java#L174-L186)
- [Media3 missing wake-lock permission guard](https://github.com/androidx/media/blob/1.9.0/libraries/common/src/main/java/androidx/media3/common/util/WakeLockManager.java#L126-L143)
- [Media3 default local wake mode](https://github.com/androidx/media/blob/1.9.0/libraries/exoplayer/src/main/java/androidx/media3/exoplayer/ExoPlayerImpl.java#L446-L459)
- [Android screen-on flag](https://developer.android.com/develop/background-work/background-tasks/awake/screen-on)

## Microphone behavior

Fresh launch checks existing permission without prompting. The first permission
request follows the user's Allow mic/Start listening action. An already granted
user can start automatically when opening the tuner. Denied users can still use
reference tones and the metronome. Native capture checks permission before opening
AudioRecord, processes PCM in memory, and delivers pitch metrics to JavaScript.
The fallback recorder disables file output explicitly.

The permission hardening gates the custom Android native backend's foreground
resume on a freshly completed permission check, honoring Stop, background, and
unmount while that check is pending. A revoked grant or failed check does not
trigger that resume or an unsolicited new permission request. The fallback
recorder retains its existing native lifecycle behavior; this change is not a
redesign or device validation of iOS/Expo Go fallback recording.

Listening can continue when switching tabs in the foreground app so the tuner
and metronome can operate together. It stops on Stop, app background, and teardown.
Do not describe this as “only while the Tuner tab is visible.” Android may kill
the app process when permission is revoked or a one-time grant expires.

## Privacy qualifications

Microphone audio is not saved or uploaded by Tunera. The existing Android
`allowBackup=true` behavior is unchanged: preferences/database may be included in
OS-managed backups, while cache is excluded. Removing INTERNET from the app does
not disable Android's backup service.

Media3's platform playback diagnostics are also unchanged. Android may collect
playback performance metrics according to the device user's diagnostics setting;
this is distinct from an application analytics endpoint or microphone upload.
Avoid claiming that every kind of operating-system data stays on the device.

- [Android backup rules](https://developer.android.com/identity/data/autobackup)
- [Media3 platform diagnostics](https://github.com/androidx/media/blob/1.9.0/libraries/exoplayer/src/main/java/androidx/media3/exoplayer/ExoPlayer.java#L1082-L1102)

## Enforcement and verification

`plugins/withMinimalAndroidPermissions.js` writes removal rules into the **release**
manifest, which has higher priority than main and dependency manifests. It
preserves unrelated release settings and is idempotent. Debug/development builds
retain Metro/network and developer-menu capabilities. A new native build is
required; OTA or a JavaScript-only update cannot change permissions.

After Expo prebuild, build and check the final merged manifest:

```sh
npx expo prebuild --platform android --no-install
cd android
./gradlew :app:processReleaseManifest
cd ..
python3 tools/android-permissions/check.py \
  android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml
python3 -m unittest discover -s tools/android-permissions -p 'test_*.py' -v
```

Before distributing an APK, run the checker on the actual packaged binary with
Android SDK `apkanalyzer` on PATH:

```sh
python3 tools/android-permissions/check.py --apk path/to/app-release.apk
```

The checker fails closed unless there are exactly five reviewed permissions, no
background services, OTA is disabled, and the internal receiver permission retains
signature protection. It rejects unmerged source manifests and removal markers.
Repeat the audit if a dependency introduces a new permission; do not expand the
allowlist just to make the check pass.

Required on-device release smoke tests:
1. Fresh install: no microphone prompt on launch; Allow mic prompts in context.
2. Deny, permanently deny, grant once, and revoke in Settings; background/reopen,
   pending check followed by Stop, and repeated background/resume remain safe.
3. Airplane mode: tuning, both reference tones, varied tempo/subdivision/sound
   metronome loops, simultaneous tuner/metronome, and saved preferences work.
4. Optional haptics and keep-screen-awake toggle work; background/screen lock does
   not leave microphone capture running; foreground resume is correct.
5. Upgrade preserves existing settings. Do not uninstall or clear user data to
   hide update failures.

Official permission references:
- [Android app-private storage](https://developer.android.com/training/data-storage/app-specific)
- [Android networking permissions](https://developer.android.com/develop/connectivity/network-ops/connecting)
- [Android runtime permission workflow](https://developer.android.com/training/permissions/requesting)
- [Android permission reference](https://developer.android.com/reference/android/Manifest.permission)
- [Android manifest merge priorities](https://developer.android.com/build/manage-manifests)
- [Expo permission configuration](https://docs.expo.dev/guides/permissions/)
- [AndroidX receiver protection](https://raw.githubusercontent.com/androidx/androidx/androidx-main/core/core/src/main/java/androidx/core/content/ContextCompat.java)
