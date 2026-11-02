# Trace-a-peer

## Android development setup

Use the same toolchain across the team:

- Node.js 20.17+ or 22.9+
- JDK 17, with `JAVA_HOME` pointing to it (set Android Studio's Gradle JDK to JDK 17 too)
- Android SDK Platform 36, Build Tools 36.x, and Android SDK Command-line Tools
- Android Studio

After cloning, open a terminal in the repository root and run these commands in PowerShell:

```powershell
npm.cmd ci
npx.cmd cordova platform add android@15.1.0
npx.cmd cordova prepare android
npx.cmd cordova build android
```

Open `platforms/android` in Android Studio after the platform has been generated. Edit app web assets in `www/`; changes made under `platforms/android` can be overwritten by Cordova.

## What belongs in Git

Commit `package.json`, `package-lock.json`, `config.xml`, and the contents of `www/`. The package manifest pins Cordova, the Android platform, and plugins; the lockfile pins their resolved npm dependency tree. Review and commit both whenever dependencies change.

Keep `platforms/`, `plugins/`, `node_modules/`, `.gradle/`, build output, and `local.properties` untracked. The existing `.gitignore` already covers these. `local.properties` contains a developer-specific Android SDK path. Do not commit signing keys, passwords, or machine-specific Gradle configuration.

No additional Android Gradle properties are needed for this baseline. If the project later needs a shared Gradle override, keep the source configuration in Git and have Cordova apply it through a supported `config.xml` preference or a tracked `build-extras.gradle` resource, rather than editing generated files under `platforms/android`.

The app ID in `config.xml` is a placeholder (`com.example.traceapeer`); replace it with the team's chosen unique application ID before distributing builds. The SMS plugin provides SMS sending; confirm it covers the intended workflow, and make location sharing explicit and user-initiated with appropriate runtime permission handling.
