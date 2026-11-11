// tracking.js - Background Telemetry and Location Options Handler

function getTelemetryGPSOptions() {
    var isBatterySaver = localStorage.getItem('active_battery_saver_mode') === 'true';

    return {
        maximumAge: isBatterySaver ? 60000 : 10000,    // Longer cache in battery saver mode
        timeout: isBatterySaver ? 20000 : 10000,       // Relaxed timeout
        enableHighAccuracy: !isBatterySaver          // Turn off high accuracy GPS if battery saver is on
    };
}

// Core telemetry execution routine
function startTrackingTelemetry() {
    console.log("Initializing telemetry tracking engine...");
    var options = getTelemetryGPSOptions();

    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            function(position) {
                console.log("Telemetry coordinate acquired:", position.coords.latitude, position.coords.longitude);
            },
            function(error) {
                console.error("Telemetry GPS error code " + error.code + ": " + error.message);
            },
            options
        );
    } else {
        console.warn("Geolocation API not supported on this device/environment.");
    }
}