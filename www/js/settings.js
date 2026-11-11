// Load saved preferences immediately when the DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    loadSavedPreferences();
});

// Handle native Cordova actions when the device environment is ready
document.addEventListener('deviceready', onDeviceReady, false);

function onDeviceReady() {
    console.log('Cordova native layer ready.');
    requestNativePermissions();
}

// 1. Native Android Permission Prompt Flow
function requestNativePermissions() {
    if (!window.cordova || !window.cordova.plugins || !window.cordova.plugins.permissions) {
        console.log('Permissions plugin not available in web preview.');
        return;
    }

    var permissions = window.cordova.plugins.permissions;
    var list = [
        permissions.SEND_SMS,
        permissions.RECEIVE_SMS,
        permissions.READ_SMS,
        permissions.ACCESS_FINE_LOCATION,
        permissions.ACCESS_BACKGROUND_LOCATION
    ];

    permissions.requestPermissions(list, function(status) {
        if (status.hasPermission) {
            console.log("All essential runtime permissions granted.");
        } else {
            console.warn("Permissions denied by user.");
        }
    }, function() {
        console.error("Error requesting permissions.");
    });
}

// 2. Explicit Save & Integration Logic for Milestone 4
function saveSettings() {
    // Save Telemetry Interval Dropdown
    var intervalSelect = document.getElementById('intervalSelect');
    if (intervalSelect) {
        localStorage.setItem('telemetry_interval', intervalSelect.value);
    }

    // Save Toggles by ID
    var smsToggle = document.getElementById('smsToggle');
    var gpsToggle = document.getElementById('gpsToggle');
    var notifToggle = document.getElementById('notifToggle');
    var appearanceToggle = document.getElementById('appearanceToggle');
    var batterySaverToggle = document.getElementById('batterySaverToggle');

    if (smsToggle) localStorage.setItem('setting_sms', smsToggle.checked);
    if (gpsToggle) localStorage.setItem('setting_gps', gpsToggle.checked);
    if (notifToggle) localStorage.setItem('setting_notif', notifToggle.checked);

    if (appearanceToggle) {
        localStorage.setItem('setting_appearance', appearanceToggle.checked);
        applyTheme(appearanceToggle.checked);
    }

    if (batterySaverToggle) {
        localStorage.setItem('setting_battery_saver', batterySaverToggle.checked);
        applyBatterySaverBehavior(batterySaverToggle.checked);
    }

    alert('Settings saved and integrated successfully!');
}

function discardSettings() {
    loadSavedPreferences();
    alert('Changes discarded.');
}

function loadSavedPreferences() {
    // Restore Interval Dropdown
    var savedInterval = localStorage.getItem('telemetry_interval');
    var intervalSelect = document.getElementById('intervalSelect');
    if (savedInterval && intervalSelect) {
        intervalSelect.value = savedInterval;
    }

    // Restore Toggles by ID
    var smsToggle = document.getElementById('smsToggle');
    var gpsToggle = document.getElementById('gpsToggle');
    var notifToggle = document.getElementById('notifToggle');
    var appearanceToggle = document.getElementById('appearanceToggle');
    var batterySaverToggle = document.getElementById('batterySaverToggle');

    if (smsToggle) {
        var val = localStorage.getItem('setting_sms');
        if (val !== null) smsToggle.checked = (val === 'true');
    }
    if (gpsToggle) {
        var val = localStorage.getItem('setting_gps');
        if (val !== null) gpsToggle.checked = (val === 'true');
    }
    if (notifToggle) {
        var val = localStorage.getItem('setting_notif');
        if (val !== null) notifToggle.checked = (val === 'true');
    }
    if (appearanceToggle) {
        var val = localStorage.getItem('setting_appearance');
        if (val !== null) {
            appearanceToggle.checked = (val === 'true');
            applyTheme(appearanceToggle.checked);
        }
    }
    if (batterySaverToggle) {
        var val = localStorage.getItem('setting_battery_saver');
        if (val !== null) {
            batterySaverToggle.checked = (val === 'true');
            applyBatterySaverBehavior(batterySaverToggle.checked);
        }
    }
}

// Theme Application Workflow
function applyTheme(isDark) {
    if (isDark) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
}

// Battery Saver Workflow Integration (Used by tracking.js / background sync)
function applyBatterySaverBehavior(isBatterySaverActive) {
    if (isBatterySaverActive) {
        console.log('[Battery Saver] Active: GPS polling intervals relaxed to conserve power.');
        localStorage.setItem('active_battery_saver_mode', 'true');
    } else {
        console.log('[Battery Saver] Inactive: Standard high-accuracy telemetry active.');
        localStorage.setItem('active_battery_saver_mode', 'false');
    }
}