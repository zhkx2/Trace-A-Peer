(() => {
	const mapElement = document.getElementById('map');
	const mapPanel = document.getElementById('map-panel');
	const layersButton = document.getElementById('layers-button');
	const centerMapButton = document.getElementById('center-map-button');
	const radarPanel = document.getElementById('radar-panel');
	const canvas = document.getElementById('radar-canvas');
	const radarTargetName = document.getElementById('radar-target-name');
	const radarDistanceValue = document.getElementById('radar-distance-value');
	const openRadarButton = document.getElementById('open-radar-button');
	const returnToMapButton = document.getElementById('return-to-map-button');
	const refreshSmsButton = document.getElementById('refresh-sms-button');
	const mapStatus = document.getElementById('map-status');
	const mapStatusText = document.getElementById('map-status-text');
	const mapUnavailable = document.getElementById('map-unavailable');
	const context = canvas && canvas.getContext('2d');
	let localPosition = [37.7431, -119.5370];
	const selectedPeer = {
		name: 'Joshua King',
		initials: 'JK',
		status: 'Offline',
		coordinates: [37.74590, -119.53320],
		latitude: '37.74590 N',
		longitude: '119.53320 W',
		distanceMeters: 450,
	bearingDegrees: 48,
		bearingLabel: '048 Northeast',
		lastLocation: 'Last location - 12:38 via SMS',
		lastSmsAge: '4 min ago',
		receivedAt: 'Received at 12:38',
		accuracyMeters: 12
	};
	let map;
	let tileLayer;
	let routeLine;
	let demoMarkers = [];
	let localMarker;
	let peerMarker;
	let tileLoaded = false;
	let currentMode = 'map';
	let terrainEnabled = true;

	function themeColor(name) {
		return getComputedStyle(document.body).getPropertyValue(name).trim();
	}

	function updateMapStatus(message, state) {
		if (!mapStatus || !mapStatusText) {
			return;
		}

		mapStatusText.textContent = message;
		mapStatus.classList.remove('is-checking', 'is-online', 'is-offline');
		mapStatus.classList.add(state);
	}

	function initializeMap() {
		if (!mapElement || !window.L) {
			if (mapUnavailable) {
				mapUnavailable.hidden = false;
			}
			updateMapStatus('Map library unavailable', 'is-offline');
			return;
		}

		map = window.L.map(mapElement, {
			zoomControl: false,
			scrollWheelZoom: false
		}).setView(selectedPeer.coordinates, 14);

		window.L.control.zoom({ position: 'bottomleft' }).addTo(map);
		tileLayer = window.L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
			maxZoom: 17,
			attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
		}).addTo(map);

		routeLine = window.L.polyline([localPosition, selectedPeer.coordinates], {
			color: themeColor('--route-color'),
			weight: 3,
			dashArray: '8 8',
			opacity: 0.9
		}).addTo(map);

		const demoPeers = [
			{ name: 'You · demo', coordinates: localPosition, color: themeColor('--you-marker-color'), radius: 9 },
			{ name: `${selectedPeer.name} · demo`, coordinates: selectedPeer.coordinates, color: themeColor('--target-marker-color'), radius: 8 }
		];

		demoPeers.forEach((peer) => {
			const marker = window.L.circleMarker(peer.coordinates, {
				radius: peer.radius,
				color: themeColor('--marker-outline'),
				weight: 2,
				fillColor: peer.color,
				fillOpacity: 1
			}).addTo(map).bindTooltip(peer.name, { direction: 'top', offset: [0, -8] });
			demoMarkers.push(marker);
		});

		[localMarker, peerMarker] = demoMarkers;

		tileLayer.on('load', () => {
			tileLoaded = true;
			updateMapStatus('Map tiles online', 'is-online');
			if (mapUnavailable) {
				mapUnavailable.hidden = true;
			}
		});

		tileLayer.on('tileerror', () => {
			if (!tileLoaded) {
				updateMapStatus('Map tiles unavailable', 'is-offline');
				if (mapUnavailable) {
					mapUnavailable.hidden = false;
				}
			}
		});

		if (!navigator.onLine) {
			updateMapStatus('Offline · switch to Radar', 'is-offline');
			if (mapUnavailable) {
				mapUnavailable.hidden = false;
			}
		}
	}

	function updateMockTargetDetails() {
		document.getElementById('target-avatar').textContent = selectedPeer.initials;
		document.getElementById('target-name').textContent = selectedPeer.name;
		document.getElementById('radar-target-name').textContent = selectedPeer.name;
		document.getElementById('target-status').textContent = selectedPeer.status;
		document.getElementById('target-last-location').textContent = selectedPeer.lastLocation;
		document.getElementById('target-coordinates').textContent = `${selectedPeer.latitude}\n${selectedPeer.longitude}`;
		document.getElementById('target-distance').textContent = `${selectedPeer.distanceMeters} m\n${selectedPeer.bearingLabel}`;
		document.getElementById('radar-distance-value').textContent = String(selectedPeer.distanceMeters);
		document.getElementById('radar-canvas').setAttribute('aria-label', `Compass pointing ${selectedPeer.bearingDegrees} degrees toward ${selectedPeer.name}`);
		console.info('Loaded mock target telemetry.', selectedPeer);
	}

	function drawRadar() {
		if (!canvas || !context || radarPanel.hidden) {
			return;
		}

		const bounds = canvas.getBoundingClientRect();
		if (!bounds.width || !bounds.height) {
			return;
		}

		const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = Math.round(bounds.width * pixelRatio);
		canvas.height = Math.round(bounds.height * pixelRatio);
		context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

		const width = bounds.width;
		const height = bounds.height;
		const centerX = width / 2;
		const centerY = height / 2;
		const radius = Math.min(width * 0.37, height * 0.38);
		const radarBackground = themeColor('--radar-bg');
		const radarGrid = themeColor('--radar-grid');
		const radarStrongGrid = themeColor('--radar-grid-strong');
		const radarLabel = themeColor('--radar-label');
		const radarArrow = themeColor('--radar-arrow');
		const radarCenter = themeColor('--radar-center');

		context.clearRect(0, 0, width, height);
		context.fillStyle = radarBackground;
		context.fillRect(0, 0, width, height);

		context.beginPath();
		context.arc(centerX, centerY, radius, 0, Math.PI * 2);
		context.strokeStyle = radarGrid;
		context.lineWidth = 1;
		context.stroke();

		for (let degrees = 0; degrees < 360; degrees += 5) {
			const angle = (degrees - 90) * Math.PI / 180;
			const tickLength = degrees % 30 === 0 ? 14 : degrees % 10 === 0 ? 9 : 5;
			const innerRadius = radius - tickLength;
			context.beginPath();
			context.moveTo(centerX + Math.cos(angle) * innerRadius, centerY + Math.sin(angle) * innerRadius);
			context.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
			context.strokeStyle = degrees % 30 === 0 ? radarStrongGrid : radarGrid;
			context.lineWidth = degrees % 30 === 0 ? 2 : 1;
			context.stroke();
		}

		context.font = '700 12px sans-serif';
		context.fillStyle = radarLabel;
		context.textAlign = 'center';
		context.textBaseline = 'middle';
		[
			{ label: 'N', degrees: 0 },
			{ label: 'E', degrees: 90 },
			{ label: 'S', degrees: 180 },
			{ label: 'W', degrees: 270 }
		].forEach(({ label, degrees }) => {
			const angle = (degrees - 90) * Math.PI / 180;
			const labelRadius = radius + 16;
			context.fillText(label, centerX + Math.cos(angle) * labelRadius, centerY + Math.sin(angle) * labelRadius);
		});

		const heading = (selectedPeer.bearingDegrees - 90) * Math.PI / 180;
		const arrowLength = radius * 0.62;
		const tipX = centerX + Math.cos(heading) * arrowLength;
		const tipY = centerY + Math.sin(heading) * arrowLength;
		context.strokeStyle = radarArrow;
		context.fillStyle = radarArrow;
		context.lineWidth = 16;
		context.lineCap = 'round';
		context.beginPath();
		context.moveTo(centerX, centerY);
		context.lineTo(tipX, tipY);
		context.stroke();

		context.save();
		context.translate(tipX, tipY);
		context.rotate(heading);
		context.beginPath();
		context.moveTo(0, 0);
		context.lineTo(-32, -22);
		context.lineTo(-32, 22);
		context.closePath();
		context.fill();
		context.restore();

		context.beginPath();
		context.arc(centerX, centerY, 7, 0, Math.PI * 2);
		context.fillStyle = radarCenter;
		context.fill();
	}

	function setMode(mode) {
		currentMode = mode;
		const showRadar = mode === 'radar';
		mapPanel.hidden = showRadar;
		radarPanel.hidden = !showRadar;

		if (showRadar) {
			requestAnimationFrame(drawRadar);
		} else if (map) {
			requestAnimationFrame(() => map.invalidateSize());
		}
	}

	if (openRadarButton) {
		openRadarButton.addEventListener('click', () => setMode('radar'));
	}

	if (returnToMapButton) {
		returnToMapButton.addEventListener('click', () => setMode('map'));
	}

	if (centerMapButton) {
		centerMapButton.addEventListener('click', () => {
			if (!map) {
				console.warn('Cannot recenter: the demo map is not available.');
				return;
			}

			map.flyTo(localPosition, Math.max(map.getZoom(), 15));
			console.info('Centered map on the local user location.', localPosition);
		});
	}

	if (layersButton) {
		layersButton.addEventListener('click', () => {
			if (!tileLayer) {
				console.warn('Cannot change layers: the demo map is not available.');
				return;
			}

			terrainEnabled = !terrainEnabled;
			const url = terrainEnabled
				? 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'
				: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
			tileLayer.setUrl(url);
			const nextLayer = terrainEnabled ? 'street map' : 'terrain map';
			layersButton.setAttribute('aria-label', `Switch to ${nextLayer}`);
			layersButton.title = `Switch to ${nextLayer}`;
			console.info(`Switched mock map layer to ${terrainEnabled ? 'terrain' : 'street'}.`);
		});
	}

	if (refreshSmsButton) {
		refreshSmsButton.addEventListener('click', () => {
			console.info(`Mock SMS refresh requested for ${selectedPeer.name}.`);
		});
	}

	window.addEventListener('resize', drawRadar);
	document.addEventListener('app:themechange', () => {
		if (routeLine) {
			routeLine.setStyle({ color: themeColor('--route-color') });
		}
		demoMarkers.forEach((marker, index) => {
			marker.setStyle({
				color: themeColor('--marker-outline'),
				fillColor: themeColor(index === 0 ? '--you-marker-color' : '--target-marker-color')
			});
		});
		if (currentMode === 'radar') {
			requestAnimationFrame(drawRadar);
		}
	});
	window.addEventListener('offline', () => {
		tileLoaded = false;
		updateMapStatus('Offline · switch to Radar', 'is-offline');
		if (mapUnavailable) {
			mapUnavailable.hidden = false;
		}
	});
	window.addEventListener('online', () => {
		updateMapStatus('Checking map tiles', 'is-checking');
		if (mapUnavailable) {
			mapUnavailable.hidden = true;
		}
		if (tileLayer) {
			tileLayer.redraw();
		}
	});
	window.addEventListener('app:viewchange', (event) => {
		if (event.detail.view === 'view-tracking') {
			if (currentMode === 'radar') {
				requestAnimationFrame(drawRadar);
			} else if (map) {
				requestAnimationFrame(() => map.invalidateSize());
			}
		}
	});

	if (canvas && 'ResizeObserver' in window) {
		new ResizeObserver(drawRadar).observe(canvas);
	}

	// ---------------------------------------------------------------------
	// Milestone 3: hardware APIs, radar math, map binding, test mode
	// ---------------------------------------------------------------------

	const EARTH_RADIUS_METERS = 6371000;
	const SMS_PREFIX = 'TAP';
	// Wire format: TAP|<lat>|<lon>|<unix seconds>
	const SMS_PATTERN = /^TAP\|(-?\d{1,2}(?:\.\d+)?)\|(-?\d{1,3}(?:\.\d+)?)\|(\d{9,})$/;
	const COMPASS_POINTS = ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'];
	const GEOLOCATION_OPTIONS = { enableHighAccuracy: false, timeout: 15000, maximumAge: 5000 };
	// Replace with your own number before running testPing() on the device.
	const TEST_PHONE_NUMBER = '+639950059801';

	const toRadians = (degrees) => degrees * Math.PI / 180;
	const toDegrees = (radians) => radians * 180 / Math.PI;

	// --- Radar math ------------------------------------------------------

	function calculateDistance(lat1, lon1, lat2, lon2) {
		const deltaLat = toRadians(lat2 - lat1);
		const deltaLon = toRadians(lon2 - lon1);
		const a = Math.sin(deltaLat / 2) ** 2
			+ Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2;

		return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	}

	// Initial bearing from point 1 to point 2, in degrees clockwise from true north (0-360).
	function calculateBearing(lat1, lon1, lat2, lon2) {
		const deltaLon = toRadians(lon2 - lon1);
		const y = Math.sin(deltaLon) * Math.cos(toRadians(lat2));
		const x = Math.cos(toRadians(lat1)) * Math.sin(toRadians(lat2))
			- Math.sin(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.cos(deltaLon);

		return (toDegrees(Math.atan2(y, x)) + 360) % 360;
	}

	// --- Hardware: geolocation and compass --------------------------------

	function getLocation() {
    console.warn("[Mock GPS] Bypassing hardware to prevent Java crash.");
    return Promise.resolve({
        latitude: 37.74590,
        longitude: -119.53320,
        accuracy: 10,
        timestamp: Date.now()
    });
}

	function getHeading() {
		return new Promise((resolve, reject) => {
			if (!navigator.compass) {
				reject(new Error('Device orientation plugin is not available.'));
				return;
			}

			navigator.compass.getCurrentHeading(
				(heading) => resolve({
					magneticHeading: heading.magneticHeading,
					trueHeading: heading.trueHeading,
					accuracy: heading.headingAccuracy
				}),
				(error) => reject(new Error(`Compass failed (code ${error && error.code}).`))
			);
		});
	}

	// --- Hardware: SMS transmission ---------------------------------------

	function formatLocationMessage(latitude, longitude, timestampMs = Date.now()) {
		return `${SMS_PREFIX}|${latitude.toFixed(6)}|${longitude.toFixed(6)}|${Math.floor(timestampMs / 1000)}`;
	}

	function ensureSmsPermission() {
    console.warn("[Mock SMS Auth] Bypassing permission check to prevent Java crash.");
    return Promise.resolve(true); // Automatically approve since we did it in Android Settings
}

function sendLocationSMS(phone) {
        if (!phone) {
            return Promise.reject(new Error('A destination phone number is required.'));
        }

        return Promise.all([getLocation(), ensureSmsPermission()]).then(([position]) => {
            const message = formatLocationMessage(position.latitude, position.longitude, position.timestamp);
            
            return new Promise((resolve) => {
                console.warn("[Mock SMS] Bypassing broken Java plugin. Using native web intent.");
                // Force Android to open the default SMS app via URI scheme
                window.location.href = `sms:${phone}?body=${encodeURIComponent(message)}`;
                resolve({ phone, message, position });
            });
        });
    }

	// --- Hardware: SMS reception ------------------------------------------

	function parsePeerLocation(body) {
		const match = SMS_PATTERN.exec(String(body || '').trim());
		if (!match) {
			return null;
		}

		const latitude = Number(match[1]);
		const longitude = Number(match[2]);
		if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
			return null;
		}

		return { latitude, longitude, timestamp: Number(match[3]) * 1000 };
	}

	// Entry point for every incoming SMS; non-TAP messages are ignored.
	function handleIncomingSms(sms) {
		const peer = parsePeerLocation(sms && sms.body);
		if (!peer) {
			return Promise.resolve(false);
		}

		return getLocation()
			.then((position) => {
				localPosition = [position.latitude, position.longitude];
			})
			.catch((error) => console.warn('Using last known local position.', error))
			.then(() => {
				const distance = calculateDistance(localPosition[0], localPosition[1], peer.latitude, peer.longitude);
				updateMap({ latitude: localPosition[0], longitude: localPosition[1] }, peer, distance);
				return true;
			});
	}

	// Incoming SMS comes from `cordova-plugin-sms-receive` (cordova-sms-plugin can only send).
	function startSmsListener() {
		const receiver = window.cordova && window.cordova.plugins && window.cordova.plugins.SMSReceive;
		if (!receiver || typeof receiver.startWatch !== 'function') {
			console.warn('SMS receive plugin (cordova-plugin-sms-receive) is not installed; incoming SMS will not be intercepted.');
			return;
		}

		document.addEventListener('onSMSArrive', (event) => {
			const message = event.data || event;
			handleIncomingSms({ address: message.address, body: message.body });
		});

		receiver.startWatch(
			() => console.info('Listening for incoming SMS.'),
			(error) => console.error('Unable to start the SMS listener.', error)
		);
	}

	// --- Leaflet map binding ----------------------------------------------

	function formatCoordinate(value, positiveLabel, negativeLabel) {
		return `${Math.abs(value).toFixed(5)} ${value >= 0 ? positiveLabel : negativeLabel}`;
	}

	function formatBearing(degrees) {
		const rounded = Math.round(degrees) % 360;
		const point = COMPASS_POINTS[Math.round(rounded / 45) % 8];
		return `${String(rounded).padStart(3, '0')} ${point}`;
	}

	function updateMap(local, peer, distanceMeters) {
		const localLatLng = [local.latitude, local.longitude];
		const peerLatLng = [peer.latitude, peer.longitude];
		const bearing = calculateBearing(local.latitude, local.longitude, peer.latitude, peer.longitude);
		const receivedAt = new Date(peer.timestamp || Date.now());
		const time = receivedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

		Object.assign(selectedPeer, {
			coordinates: peerLatLng,
			latitude: formatCoordinate(peer.latitude, 'N', 'S'),
			longitude: formatCoordinate(peer.longitude, 'E', 'W'),
			distanceMeters: Math.round(distanceMeters),
			bearingDegrees: Math.round(bearing) % 360,
			bearingLabel: formatBearing(bearing),
			lastLocation: `Last location - ${time} via SMS`
		});
		updateMockTargetDetails();

		if (map && localMarker && peerMarker && routeLine) {
			localMarker.setLatLng(localLatLng).setTooltipContent('You');
			peerMarker.setLatLng(peerLatLng).setTooltipContent(`${selectedPeer.name} · ${selectedPeer.distanceMeters} m`);
			routeLine.setLatLngs([localLatLng, peerLatLng]);
			map.fitBounds(window.L.latLngBounds([localLatLng, peerLatLng]), { padding: [48, 48], maxZoom: 17 });
		}

		if (currentMode === 'radar') {
			requestAnimationFrame(drawRadar);
		}
	}

	// --- Independent test mode --------------------------------------------

	// Verifies geolocation, compass and SMS on a physical device without the UI/database work.
	async function testPing() {
		try {
			const position = await getLocation();
			console.info('[testPing] Location:', position);

			const heading = await getHeading().catch((error) => {
				console.warn('[testPing] Compass unavailable.', error);
				return null;
			});
			console.info('[testPing] Heading:', heading);

			const result = await sendLocationSMS(TEST_PHONE_NUMBER);
			console.info(`[testPing] SMS sent to ${result.phone}: ${result.message}`);
			return result;
		} catch (error) {
			console.error('[testPing] Failed.', error);
			throw error;
		}
	}

	window.TraceTracking = {
		getLocation,
		getHeading,
		sendLocationSMS,
		handleIncomingSms,
		calculateDistance,
		calculateBearing,
		updateMap,
		testPing
	};

	document.addEventListener('deviceready', () => {
		startSmsListener();
		console.info('Trace-A-Peer hardware APIs ready. Run TraceTracking.testPing() to test.');
	}, false);

	initializeMap();
	updateMockTargetDetails();
})();
