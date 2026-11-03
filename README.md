# Trace-a-peer

An SMS-based location telemetry and hybrid navigation utility for low-connectivity environments.
Built with Apache Cordova (HTML, CSS, JavaScript) for Android.

**Course:** ITCC 41-A, Mobile Application Development
**Team:** Delos Santos, Albacete, King

## What it does

Trace-a-peer shares GPS coordinates between trusted peers over SMS instead of mobile data, so location tracking keeps working when internet access is weak, congested, or down. When data is available it can plot peers on a lightweight map; when it is not, it falls back to a compass and distance radar.

## Requirements

Install these once on your computer:

| Tool | Notes |
| --- | --- |
| [Node.js](https://nodejs.org) (LTS) | Check with `node -v` |
| [Git](https://git-scm.com) | Check with `git --version` |
| Cordova | `npm install -g cordova`, check with `cordova -v` |
| JDK 17 | Check with `java -version` |
| Android Studio + Android SDK | Needed for the emulator; set `ANDROID_HOME` to your SDK folder |

Run `cordova requirements` to see what is still missing.

## Getting the code

```
git clone https://github.com/<owner>/Trace-A-Peer.git
cd Trace-A-Peer
git checkout develop
git pull origin develop
```

Create your own branch for your work:

```
git checkout -b feature/<your-feature>
```

## Installing

Run these from the project folder after cloning, and again after pulling changes that touch `package.json`:

```
npm install
cordova platform add android
```

The `node_modules`, `platforms`, and `plugins` folders are generated on each computer and are not committed to Git.

## Running

**In the browser (fastest for UI work):**

```
cordova platform add browser
cordova run browser
```

**On an Android Studio emulator:**

1. Start a virtual device from Android Studio's Device Manager.
2. Confirm it is detected: `adb devices`
3. Build and launch:
   ```
   cordova run android --target=<emulator-name>
   ```

Cordova copies `www` into the platform folder on every run, so re-run the command after editing files.
To debug the emulator's WebView, open `chrome://inspect` in desktop Chrome.

## Project structure

```
www/                  Web app that Cordova packages
  index.html          App shell (Radar, Peers, Settings)
  peers-ui/           Peer Management & Communication UI
    index.html
    css/peers.css
    js/peers.js
config.xml            Cordova app settings (start page, plugins)
package.json          Dependencies
```

## Peer Management UI (`www/peers-ui`)

- **Peers list:** saved peers with status badges (2G SMS Active, Offline Queueing, Handshake Pending), distance, and last-seen time. Search, sort (Recent, Nearest, A-Z), filter chips, and favourites.
- **Peer details:** coordinates, bearing needle, activity log, a toggle for whether a peer may request your location, and the actions Ping via SMS, Refresh Location, Pair Device, and Delete Peer.
- **Add Peer:** Philippine number validation (`09XX XXX XXXX` or `+639XXXXXXXXX`), duplicate check, nickname sanitising, and optional contact import.
- **Offline queue demo:** the network chip at the top cycles through states. Pings made while not on SMS are queued and sent when signal returns.
- **Theme:** light and dark mode, following the phone setting and remembering the user's choice.
- **Storage:** peers are saved in the WebView's `localStorage`.

All data is currently mocked. `SmsService` at the top of `js/peers.js` is the one place to replace with real SMS plugin calls later. Optional plugins used if installed: `cordova-plugin-contacts` and `cordova-plugin-statusbar`.

## Team workflow

- Branches: `main` (final), `staging` (testing), `develop` (integration). Do your work on a feature branch.
- Run `git pull` before you start and before you push.
- Open a pull request into `develop` instead of pushing straight to shared branches.
- Do not commit `node_modules`, `platforms`, `plugins`, keystores, or `local.properties`.
- Do not commit temporary edits to `config.xml` (for example a changed start page).

## Troubleshooting

- **Blank or wrong screen on the emulator:** check which page `config.xml` loads, then rebuild with `cordova run android`.
- **`JAVA_HOME` or `ANDROID_HOME` errors:** run `cordova requirements` and set the variable it names.
- **Gradle errors:** confirm `java -version` shows JDK 17.
- **"No target found":** wait for the emulator to finish booting and match the name from `adb devices`.
