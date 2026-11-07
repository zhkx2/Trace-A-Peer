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