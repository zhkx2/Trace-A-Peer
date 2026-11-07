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
var permissionFlowStarted = false;
var permissionState = {
    location: false,
    notifications: false,
    backgroundLocation: false,
    sms: false
};

function checkPermission(plugin, permission) {
    return new Promise(function(resolve) {
        plugin.checkPermission(permission, function(status) {
            resolve(!!(status && status.hasPermission));
        }, function() {
            resolve(false);
        });
    });
}

function requestPermissions(plugin, list) {
    return new Promise(function(resolve) {
        plugin.requestPermissions(list, function() {
            resolve();
        }, function() {
            console.error('Error requesting permissions:', list);
            resolve();
        });
    });
}

// Resolves true only if every permission in `required` is granted after (optionally) prompting.
function ensurePermissions(plugin, required, requestList) {
    function checkAll() {
        return Promise.all(required.map(function(permission) {
            return checkPermission(plugin, permission);
        })).then(function(results) {
            return results.every(Boolean);
        });
    }

    return checkAll().then(function(granted) {
        if (granted) {
            return true;
        }
        return requestPermissions(plugin, requestList || required).then(checkAll);
    });
}

// Lets other modules (e.g. the foreground service in tracking.js) react to granted permissions.
function announcePermissions() {
    document.dispatchEvent(new CustomEvent('app:permissions', {
        detail: {
            location: permissionState.location,
            notifications: permissionState.notifications,
            backgroundLocation: permissionState.backgroundLocation,
            sms: permissionState.sms
        }
    }));
}

function requestNativePermissions() {
    var permissions = window.cordova && window.cordova.plugins && window.cordova.plugins.permissions;
    if (!permissions) {
        console.log('Permissions plugin not available in web preview.');
        return Promise.resolve(permissionState);
    }

    if (permissionFlowStarted) {
        return Promise.resolve(permissionState);
    }
    permissionFlowStarted = true;

    // Step 1: precise location. Android 12+ requires FINE and COARSE to be requested together.
    return ensurePermissions(
        permissions,
        [permissions.ACCESS_FINE_LOCATION],
        [permissions.ACCESS_FINE_LOCATION, permissions.ACCESS_COARSE_LOCATION]
    ).then(function(granted) {
        permissionState.location = granted;
        console.log(granted ? 'Foreground location granted.' : 'Foreground location denied.');

        // Step 2: notifications, so the foreground service notification is visible (Android 13+).
        return ensurePermissions(permissions, [permissions.POST_NOTIFICATIONS]);
    }).then(function(granted) {
        permissionState.notifications = granted;
        announcePermissions();

        // Step 3: background location, requested on its own and only after foreground location was approved.
        if (!permissionState.location) {
            console.warn('Skipping background location: foreground location was not granted.');
            return false;
        }
        return ensurePermissions(permissions, [permissions.ACCESS_BACKGROUND_LOCATION]);
    }).then(function(granted) {
        permissionState.backgroundLocation = granted;
        console.log(granted ? 'Background location granted.' : 'Background location not granted.');

        // Step 4: SMS.
        return ensurePermissions(permissions, [
            permissions.SEND_SMS,
            permissions.RECEIVE_SMS,
            permissions.READ_SMS
        ]);
    }).then(function(granted) {
        permissionState.sms = granted;
        console.log(granted ? 'SMS permissions granted.' : 'SMS permissions denied.');
        announcePermissions();
        return permissionState;
    }).catch(function(error) {
        console.error('Permission flow failed.', error);
        return permissionState;
    });
}

// 2. Explicit Save & Discard Logic
function saveSettings() {
    // Save telemetry interval dropdown (checking multiple possible element IDs)
    var intervalSelect = document.getElementById('intervalSelect') ||
                         document.getElementById('telemetryInterval') ||
                         document.getElementById('interval');

    if (intervalSelect) {
        localStorage.setItem('telemetry_interval', intervalSelect.value);
        console.log('Interval successfully saved:', intervalSelect.value);
    }

    // Save toggle switch states
    var toggles = document.querySelectorAll('.switch input[type="checkbox"]');
    toggles.forEach(function(toggle, index) {
        localStorage.setItem('setting_toggle_' + index, toggle.checked);
    });

    alert('Settings saved successfully!');
}

function discardSettings() {
    // Revert UI back to last saved localStorage values
    loadSavedPreferences();
    console.log('Changes discarded, reverted to saved preferences.');
    alert('Changes discarded.');
}

function loadSavedPreferences() {
    // Restore saved interval dropdown
    var savedInterval = localStorage.getItem('telemetry_interval');
    var intervalSelect = document.getElementById('intervalSelect') ||
                         document.getElementById('telemetryInterval') ||
                         document.getElementById('interval');

    if (savedInterval && intervalSelect) {
        intervalSelect.value = savedInterval;
    }

    // Restore saved toggle switches
    var toggles = document.querySelectorAll('.switch input[type="checkbox"]');
    toggles.forEach(function(toggle, index) {
        var savedState = localStorage.getItem('setting_toggle_' + index);
        if (savedState !== null) {
            toggle.checked = (savedState === 'true');
        }
    });
}