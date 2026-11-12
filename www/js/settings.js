// Wire the settings screen as soon as the DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    loadSavedPreferences();
    wirePermissionToggles();
    wireBatterySaverToggle();
    wireClearLogsButton();
});

// Handle native Cordova actions when the device environment is ready
document.addEventListener('deviceready', onDeviceReady, false);
document.addEventListener('resume', refreshPermissionStates, false);
window.addEventListener('app:viewchange', function(event) {
    if (event.detail && event.detail.view === 'view-settings') {
        refreshPermissionStates();
    }
});

function onDeviceReady() {
    console.log('Cordova native layer ready.');
    requestNativePermissions().then(refreshPermissionStates);
    refreshPermissionStates();
}

// 1. Native Android Permission Prompt Flow
var permissionFlowStarted = false;
var permissionState = {
    location: false,
    notifications: false,
    backgroundLocation: false,
    sms: false
};

function getPermissionsPlugin() {
    return (window.cordova && window.cordova.plugins && window.cordova.plugins.permissions) || null;
}

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

// Android 12+ requires FINE and COARSE to be requested together.
function requestFineLocation(plugin) {
    return ensurePermissions(
        plugin,
        [plugin.ACCESS_FINE_LOCATION],
        [plugin.ACCESS_FINE_LOCATION, plugin.ACCESS_COARSE_LOCATION]
    ).then(function(granted) {
        permissionState.location = granted;
        return granted;
    });
}

// Background location is requested on its own, and only after foreground location was approved.
function requestBackgroundLocation(plugin) {
    if (!permissionState.location) {
        console.warn('Skipping background location: foreground location was not granted.');
        return Promise.resolve(false);
    }
    return ensurePermissions(plugin, [plugin.ACCESS_BACKGROUND_LOCATION]).then(function(granted) {
        permissionState.backgroundLocation = granted;
        return granted;
    });
}

// Needed so the foreground service notification is visible (Android 13+).
function requestNotifications(plugin) {
    return ensurePermissions(plugin, [plugin.POST_NOTIFICATIONS]).then(function(granted) {
        permissionState.notifications = granted;
        return granted;
    });
}

function requestSms(plugin) {
    return ensurePermissions(plugin, [plugin.SEND_SMS, plugin.RECEIVE_SMS, plugin.READ_SMS]).then(function(granted) {
        permissionState.sms = granted;
        return granted;
    });
}

function requestNativePermissions() {
    var permissions = getPermissionsPlugin();
    if (!permissions) {
        console.log('Permissions plugin not available in web preview.');
        return Promise.resolve(permissionState);
    }

    if (permissionFlowStarted) {
        return Promise.resolve(permissionState);
    }
    permissionFlowStarted = true;

    // Order: precise location, notifications, background location (separate step), SMS.
    return requestFineLocation(permissions).then(function() {
        return requestNotifications(permissions);
    }).then(function() {
        announcePermissions();
        return requestBackgroundLocation(permissions);
    }).then(function() {
        return requestSms(permissions);
    }).then(function() {
        announcePermissions();
        return permissionState;
    }).catch(function(error) {
        console.error('Permission flow failed.', error);
        return permissionState;
    });
}

// 2. Essential Permissions toggles reflect the real Android permission state
function androidMajorVersion() {
    var match = /Android\s+(\d+)/i.exec(navigator.userAgent || '');
    return match ? parseInt(match[1], 10) : null;
}

function readPermissionStates() {
    var permissions = getPermissionsPlugin();
    if (!permissions) {
        return Promise.resolve(null);
    }

    var major = androidMajorVersion();
    var notificationsCheck = major !== null && major < 13
        ? Promise.resolve(true) // POST_NOTIFICATIONS only exists on Android 13+
        : checkPermission(permissions, permissions.POST_NOTIFICATIONS);

    return Promise.all([
        checkPermission(permissions, permissions.ACCESS_FINE_LOCATION),
        checkPermission(permissions, permissions.ACCESS_BACKGROUND_LOCATION),
        notificationsCheck,
        Promise.all([permissions.SEND_SMS, permissions.RECEIVE_SMS, permissions.READ_SMS].map(function(permission) {
            return checkPermission(permissions, permission);
        })).then(function(results) {
            return results.every(Boolean);
        })
    ]).then(function(results) {
        return {
            location: results[0],
            backgroundLocation: results[1],
            notifications: results[2],
            sms: results[3]
        };
    });
}

function renderPermissionStates(state) {
    var toggles = document.querySelectorAll('input[data-permission]');
    Array.prototype.forEach.call(toggles, function(toggle) {
        toggle.disabled = !state;
        toggle.checked = !!state && !!state[toggle.dataset.permission];
    });

    var banner = document.getElementById('permission-banner');
    var title = document.getElementById('permission-banner-title');
    var text = document.getElementById('permission-banner-text');
    if (!banner || !title || !text) {
        return;
    }

    var ready = !!state && state.sms && state.location && state.notifications;
    var message;
    if (!state) {
        message = ['Permissions unavailable', 'Open the app on an Android device to check permissions.'];
    } else if (!ready) {
        message = ['Permissions needed', 'Turn on the permissions below so Trace-a-peer can send, receive and locate.'];
    } else if (!state.backgroundLocation) {
        message = ['Almost ready', 'Allow location "all the time" so tracking keeps working with the screen off.'];
    } else {
        message = ['Ready for the trail', 'Essential permissions are enabled.'];
    }

    title.textContent = message[0];
    text.textContent = message[1];
    var good = ready && state.backgroundLocation;
    banner.classList.toggle('alert-success', good);
    banner.classList.toggle('alert-warning', !good);
}

function refreshPermissionStates() {
    return readPermissionStates().then(renderPermissionStates).catch(function(error) {
        console.error('Unable to read permission states.', error);
    });
}

function wirePermissionToggles() {
    var toggles = document.querySelectorAll('input[data-permission]');
    Array.prototype.forEach.call(toggles, function(toggle) {
        toggle.disabled = true; // enabled once real states are known
        toggle.addEventListener('change', onPermissionToggle);
    });
    renderPermissionStates(null);
}

function openAppSettingsFallback() {
    window.alert('Open Android Settings > Apps > Trace-a-peer > Permissions to turn this permission off.');
}

function openAppSettings() {
    try {
        var plugin = window.cordova && window.cordova.plugins && window.cordova.plugins.settings;
        if (!plugin || typeof plugin.open !== 'function') {
            openAppSettingsFallback();
            return;
        }
        plugin.open('application_details', function() {}, function(error) {
            console.error('Unable to open app settings.', error);
            openAppSettingsFallback();
        });
    } catch (error) {
        console.error('Open settings plugin failed.', error);
        openAppSettingsFallback();
    }
}

// Android apps cannot revoke their own permissions, so route the user to system Settings.
function confirmPermissionOff() {
    var message = 'Android only lets you turn a permission off in system Settings. Open app settings now?';
    var onChoice = function(choice) {
        // Native confirm returns the 1-based button index; Cancel (2) or dismiss (0) keeps the permission.
        if (choice === 1) {
            openAppSettings();
        }
        refreshPermissionStates(); // always snap the toggle back to the real system state
    };

    try {
        if (navigator.notification && typeof navigator.notification.confirm === 'function') {
            navigator.notification.confirm(message, onChoice, 'Turn off permission', ['Open Settings', 'Cancel']);
            return;
        }
    } catch (error) {
        console.error('Native confirm failed.', error);
    }

    if (window.confirm(message)) {
        openAppSettings();
    }
    refreshPermissionStates();
}

function onPermissionToggle(event) {
    var toggle = event.target;
    var permissions = getPermissionsPlugin();
    if (!permissions) {
        return;
    }

    if (!toggle.checked) {
        confirmPermissionOff();
        return;
    }

    toggle.disabled = true;
    var key = toggle.dataset.permission;
    var request;
    if (key === 'location') {
        request = requestFineLocation(permissions).then(function(granted) {
            return granted ? requestBackgroundLocation(permissions) : false;
        });
    } else if (key === 'notifications') {
        request = requestNotifications(permissions);
    } else {
        request = requestSms(permissions);
    }

    request.then(function() {
        announcePermissions();
        return refreshPermissionStates();
    });
}

// Battery Saver: persisted immediately; tracking.js restarts the GPS watcher on the event.
var BATTERY_SAVER_KEY = 'battery_saver';

function wireBatterySaverToggle() {
    var toggle = document.getElementById('battery-saver-toggle');
    if (!toggle) {
        return;
    }
    toggle.checked = localStorage.getItem(BATTERY_SAVER_KEY) === 'true';
    toggle.addEventListener('change', function() {
        try {
            localStorage.setItem(BATTERY_SAVER_KEY, toggle.checked ? 'true' : 'false');
        } catch (error) {
            console.error('Unable to save Battery Saver state.', error);
        }
        document.dispatchEvent(new CustomEvent('app:batterysaver', { detail: { enabled: toggle.checked } }));
    });
}

// 3. Clear local SQLite logs
function wireClearLogsButton() {
    var button = document.getElementById('clear-logs-button');
    if (button) {
        button.addEventListener('click', clearLocalLogs);
    }
}

function clearLocalLogs() {
    var store = window.TraceDB;
    if (!store) {
        window.alert('The local database is not available.');
        return Promise.resolve();
    }

    if (!window.confirm('Delete all received-location history, last known positions and activity logs? Your peers are kept.')) {
        return Promise.resolve();
    }

    return store.open().then(function() {
        return store.clearHistory();
    }).then(function(result) {
        if (window.TraceTracking) {
            window.TraceTracking.notifyPeersChanged();
        }
        window.alert('Cleared ' + result.locations + ' saved location(s) and all activity logs.');
    }).catch(function(error) {
        console.error('Unable to clear logs.', error);
        window.alert('Could not clear the local logs. Please try again.');
    });
}

// 4. Explicit Save & Discard Logic
function saveSettings() {
    // Save telemetry interval dropdown (checking multiple possible element IDs)
    var intervalSelect = document.getElementById('intervalSelect') ||
                         document.getElementById('telemetryInterval') ||
                         document.getElementById('interval');

    if (intervalSelect) {
        localStorage.setItem('telemetry_interval', intervalSelect.value);
        console.log('Interval successfully saved:', intervalSelect.value);
    }

    // Save toggle switch states (permission toggles always mirror the OS, so they are skipped)
    var toggles = document.querySelectorAll('.switch input[type="checkbox"]:not([data-permission]):not(#battery-saver-toggle)');
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
    var toggles = document.querySelectorAll('.switch input[type="checkbox"]:not([data-permission]):not(#battery-saver-toggle)');
    toggles.forEach(function(toggle, index) {
        var savedState = localStorage.getItem('setting_toggle_' + index);
        if (savedState !== null) {
            toggle.checked = (savedState === 'true');
        }
    });
}
