(() => {
	const byId = (id) => document.getElementById(id);
	const mapElement = byId('map');
	const mapPanel = byId('map-panel');
	const layersButton = byId('layers-button');
	const centerMapButton = byId('center-map-button');
	const radarPanel = byId('radar-panel');
	const canvas = byId('radar-canvas');
	const openRadarButton = byId('open-radar-button');
	const returnToMapButton = byId('return-to-map-button');
	const refreshSmsButton = byId('refresh-sms-button');
	const mapStatus = byId('map-status');
	const mapStatusText = byId('map-status-text');
	const mapUnavailable = byId('map-unavailable');
	const context = canvas && canvas.getContext('2d');

	const DEFAULT_VIEW = { center: [12.8797, 121.774], zoom: 5 }; // shown until the first GPS fix
	const LAST_FIX_KEY = 'tap.lastFix';
	const ONLINE_WINDOW_MS = 15 * 60000;
	const EARTH_RADIUS_METERS = 6371000;
	const SMS_PATTERN = /^TAP\|(-?\d{1,2}(?:\.\d+)?)\|(-?\d{1,3}(?:\.\d+)?)\|(\d{9,})$/; // TAP|<lat>|<lon>|<unix seconds>
	const PING_MESSAGE = 'TAP|PING';
	const COMPASS_POINTS = ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'];
	const GEOLOCATION_OPTIONS = { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 };
	const WATCH_OPTIONS = { enableHighAccuracy: true, timeout: 30000, maximumAge: 10000 };
	// Replace with your own number before running testPing() on the device.
	const TEST_PHONE_NUMBER = '+10000000000';

	let map;
	let tileLayer;
	let routeLine;
	let localMarker;
	let localPosition = null; // latest real GPS fix: { latitude, longitude, accuracy, timestamp }
	let watchId = null;
	let centeredOnFix = false;
	let selectedPeerId = null;
	let radarBearing = null;
	let deviceHeading = null; // smoothed compass heading in degrees, null until the first reading
	let compassWatchId = null;
	let trackingVisible = true;
	let tileLoaded = false;
	let currentMode = 'map';
	let terrainEnabled = true;
	const peers = new Map();
	const peerMarkers = new Map();

	const toRadians = (degrees) => degrees * Math.PI / 180;
	const toDegrees = (radians) => radians * 180 / Math.PI;
	const setText = (id, text) => {
		const element = byId(id);
		if (element) {
			element.textContent = text;
		}
	};

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

	// --- Formatting ------------------------------------------------------

	function formatCoordinate(value, positiveLabel, negativeLabel) {
		return `${Math.abs(value).toFixed(5)} ${value >= 0 ? positiveLabel : negativeLabel}`;
	}

	function formatBearing(degrees) {
		const rounded = Math.round(degrees) % 360;
		const point = COMPASS_POINTS[Math.round(rounded / 45) % 8];
		return `${String(rounded).padStart(3, '0')} ${point}`;
	}

	function formatDistance(meters) {
		return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(2)} km`;
	}

	function formatClock(timestamp) {
		return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
	}

	function formatAge(timestamp) {
		const minutes = Math.floor((Date.now() - timestamp) / 60000);
		if (minutes < 1) {
			return 'Just now';
		}
		return minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} hr ago`;
	}

	function initials(name) {
		return String(name).split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase() || '?';
	}

	// --- Hardware: geolocation and compass --------------------------------

	function toFix(position) {
		return {
			latitude: position.coords.latitude,
			longitude: position.coords.longitude,
			accuracy: position.coords.accuracy,
			timestamp: position.timestamp
		};
	}

	function getLocation() {
		return new Promise((resolve, reject) => {
			if (!navigator.geolocation) {
				reject(new Error('Geolocation plugin is not available.'));
				return;
			}

			navigator.geolocation.getCurrentPosition(
				(position) => resolve(toFix(position)),
				(error) => reject(new Error(`Geolocation failed (code ${error.code}): ${error.message}`)),
				GEOLOCATION_OPTIONS
			);
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

	// Resolves only when location is allowed; on a device that means ACCESS_FINE_LOCATION is granted.
	function withLocationPermission(callback) {
		const permissions = window.cordova && window.cordova.plugins && window.cordova.plugins.permissions;
		if (!permissions) {
			callback();
			return;
		}

		permissions.checkPermission(permissions.ACCESS_FINE_LOCATION, (status) => {
			if (status && status.hasPermission) {
				callback();
			} else {
				console.info('Waiting for location permission.');
			}
		}, (error) => console.error('Unable to check location permission.', error));
	}

	function applyLocalPosition(fix) {
		localPosition = fix;
		try {
			localStorage.setItem(LAST_FIX_KEY, JSON.stringify([fix.latitude, fix.longitude]));
		} catch (error) {
			console.warn('Unable to store the last GPS fix.', error);
		}

		if (map) {
			const latLng = [fix.latitude, fix.longitude];
			if (localMarker) {
				localMarker.setLatLng(latLng);
			} else {
				localMarker = window.L.circleMarker(latLng, markerStyle('--you-marker-color', 9))
					.addTo(map).bindTooltip(tooltipText('You'), { direction: 'top', offset: [0, -8] });
			}
			if (!centeredOnFix) {
				centeredOnFix = true;
				map.setView(latLng, 15);
			}
		}

		syncPeerMarkers();
		updateRoute();
		renderTarget();
	}

	// getCurrentPosition for a fast first fix, then watchPosition for continuous updates.
	function startLocationTracking() {
		if (watchId !== null || !navigator.geolocation) {
			return;
		}

		withLocationPermission(() => {
			if (watchId !== null) {
				return;
			}

			getLocation().then(applyLocalPosition).catch((error) => console.warn('Initial GPS fix failed.', error));
			watchId = navigator.geolocation.watchPosition(
				(position) => applyLocalPosition(toFix(position)),
				(error) => {
					console.warn(`GPS watch error (code ${error.code}): ${error.message}`);
					if (error.code === 1) {
						navigator.geolocation.clearWatch(watchId);
						watchId = null;
					}
				},
				WATCH_OPTIONS
			);
		});
	}

	// --- Hardware: SMS transmission ---------------------------------------

	const normalizePhone = (phone) => String(phone).replace(/[\s\-().]/g, '');
	const phoneKey = (phone) => String(phone || '').replace(/\D/g, '').slice(-10);

	function formatLocationMessage(latitude, longitude, timestampMs = Date.now()) {
		return `TAP|${latitude.toFixed(6)}|${longitude.toFixed(6)}|${Math.floor(timestampMs / 1000)}`;
	}

	function ensureSmsPermission() {
		return new Promise((resolve, reject) => {
			if (!window.sms) {
				reject(new Error('SMS plugin is not available.'));
				return;
			}

			window.sms.hasPermission((granted) => {
				if (granted) {
					resolve();
					return;
				}
				window.sms.requestPermission(
					(nowGranted) => (nowGranted ? resolve() : reject(new Error('SEND_SMS permission denied.'))),
					() => reject(new Error('SEND_SMS permission request failed.'))
				);
			}, () => reject(new Error('Unable to check SEND_SMS permission.')));
		});
	}

	function sendSms(phone, message) {
		if (!phone) {
			return Promise.reject(new Error('A destination phone number is required.'));
		}

		return ensureSmsPermission().then(() => new Promise((resolve, reject) => {
			// An empty Android intent sends silently in the background instead of opening the SMS app.
			const options = { replaceLineBreaks: false, android: { intent: '' } };
			window.sms.send(normalizePhone(phone), message, options, () => resolve(message), (error) => {
				reject(new Error(`SMS send failed: ${error}`));
			});
		}));
	}

	function sendLocationSMS(phone) {
		return getLocation().then((position) => {
			const message = formatLocationMessage(position.latitude, position.longitude, position.timestamp);
			return sendSms(phone, message).then(() => ({ phone, message, position }));
		});
	}

	// 'sms' = ready, 'perm' = permission missing, 'none' = plugin missing.
	function getSmsStatus(requestIfNeeded = false) {
		if (!window.sms) {
			return Promise.resolve('none');
		}
		if (requestIfNeeded) {
			return ensureSmsPermission().then(() => 'sms', () => 'perm');
		}
		return new Promise((resolve) => {
			window.sms.hasPermission((granted) => resolve(granted ? 'sms' : 'perm'), () => resolve('perm'));
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

	// Incoming SMS comes from `cordova-plugin-sms-receive` (cordova-sms-plugin can only send).
	// The plugin is registered exactly once here; other modules (e.g. the peers iframe) subscribe via window.TraceSms.
	const smsSubscribers = new Set();
	let smsDispatcherBound = false;
	let smsWatching = false;

	function subscribeToSms(handler) {
		smsSubscribers.add(handler);
		return () => smsSubscribers.delete(handler);
	}

	function dispatchIncomingSms(event) {
		const message = event.data || event;
		smsSubscribers.forEach((handler) => {
			try {
				handler({ address: message.address, body: message.body });
			} catch (error) {
				console.error('SMS subscriber failed.', error);
			}
		});
	}

	function startSmsListener() {
		if (smsWatching) {
			return;
		}

		const receiver = window.cordova && window.cordova.plugins && window.cordova.plugins.SMSReceive;
		if (!receiver || typeof receiver.startWatch !== 'function') {
			console.warn('SMS receive plugin (cordova-plugin-sms-receive) is not installed; incoming SMS will not be intercepted.');
			return;
		}

		if (!smsDispatcherBound) {
			document.addEventListener('onSMSArrive', dispatchIncomingSms, false);
			smsDispatcherBound = true;
		}

		smsWatching = true;
		receiver.startWatch(
			() => console.info('Listening for incoming SMS.'),
			(error) => {
				smsWatching = false;
				console.error('Unable to start the SMS listener.', error);
			}
		);
	}

	// --- Foreground service -------------------------------------------------

	const FOREGROUND_NOTIFICATION = {
		title: 'Trace-A-Peer',
		text: 'Location tracking is active',
		icon: '',
		importance: '1',
		id: ''
	};
	let foregroundStarted = false;

	// Android 14+ throws a SecurityException if a location-type service starts before location is granted,
	// so the service only starts after ACCESS_FINE_LOCATION is confirmed.
	function startForegroundService() {
		if (foregroundStarted) {
			return;
		}

		const service = window.cordova && window.cordova.plugins && window.cordova.plugins.foregroundService;
		if (!service) {
			console.warn('Foreground service plugin unavailable; skipping foreground service.');
			return;
		}

		withLocationPermission(() => {
			if (foregroundStarted) {
				return;
			}

			foregroundStarted = true;
			service.start(
				FOREGROUND_NOTIFICATION.title,
				FOREGROUND_NOTIFICATION.text,
				FOREGROUND_NOTIFICATION.icon,
				FOREGROUND_NOTIFICATION.importance,
				FOREGROUND_NOTIFICATION.id
			);
			console.info('Foreground service started.');
		});
	}

	function stopForegroundService() {
		const service = window.cordova && window.cordova.plugins && window.cordova.plugins.foregroundService;
		if (service && foregroundStarted) {
			service.stop();
			foregroundStarted = false;
		}
	}

	// --- Peer data (SQLite via window.TraceDB) -----------------------------

	const peerListeners = new Set();

	function onPeersChanged(callback) {
		peerListeners.add(callback);
		return () => peerListeners.delete(callback);
	}

	function notifyPeersChanged() {
		peerListeners.forEach((callback) => {
			try {
				callback();
			} catch (error) {
				console.error('Peer listener failed.', error);
			}
		});
	}

	function loadPeers() {
		const store = window.TraceDB;
		return store ? store.open().then(() => store.all()) : Promise.resolve([]);
	}

	const hasLocation = (peer) => peer && typeof peer.lat === 'number' && typeof peer.lng === 'number';
	const findPeerByAddress = (rows, address) => {
		const key = phoneKey(address);
		return key ? rows.find((peer) => phoneKey(peer.phone) === key) : undefined;
	};
	const addLog = (peer, text) => {
		peer.log = [{ t: Date.now(), x: text }].concat(peer.log || []).slice(0, 20);
	};

	function refreshPeers() {
		return loadPeers().then((rows) => {
			peers.clear();
			rows.forEach((peer) => peers.set(peer.id, peer));

			if (!peers.has(selectedPeerId)) {
				const latest = rows.filter(hasLocation).sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
				selectedPeerId = latest ? latest.id : null;
			}

			syncPeerMarkers();
			updateRoute();
			renderTarget();
		}).catch((error) => console.error('Unable to load peers.', error));
	}

	function selectPeer(peerId) {
		if (peers.has(peerId)) {
			selectedPeerId = peerId;
			updateRoute();
			renderTarget();
		}
	}

	// Handles every incoming SMS: pings from paired peers and location payloads from paired peers.
	function handleIncomingSms(sms) {
		const body = String((sms && sms.body) || '').trim();
		if (body === PING_MESSAGE) {
			return respondToPing(sms.address);
		}

		const payload = parsePeerLocation(body);
		return payload ? receivePeerLocation(sms.address, payload) : Promise.resolve(false);
	}

	async function receivePeerLocation(address, payload) {
		const peer = findPeerByAddress(await loadPeers(), address);
		if (!peer || !peer.paired) {
			console.warn('Ignoring a location SMS from an unknown or unpaired number.');
			return false;
		}

		if (!localPosition) {
			await getLocation().then(applyLocalPosition).catch((error) => console.warn('No local fix for distance yet.', error));
		}

		const now = Date.now();
		peer.lat = Number(payload.latitude.toFixed(5));
		peer.lng = Number(payload.longitude.toFixed(5));
		peer.ts = now;
		peer.status = 'active';
		if (localPosition) {
			const meters = calculateDistance(localPosition.latitude, localPosition.longitude, peer.lat, peer.lng);
			peer.dist = Math.round(meters / 10) / 100;
			peer.bearing = Math.round(calculateBearing(localPosition.latitude, localPosition.longitude, peer.lat, peer.lng)) % 360;
		}
		addLog(peer, 'Location received');

		const store = window.TraceDB;
		await store.update(peer);
		await store.addLocation({ peer_id: peer.id, lat: peer.lat, lng: peer.lng, ts: now, dist: peer.dist, bearing: peer.bearing });

		peers.set(peer.id, peer);
		selectedPeerId = peer.id;
		focusPeerOnMap(peer);
		notifyPeersChanged();
		return true;
	}

	async function respondToPing(address) {
		const store = window.TraceDB;
		const peer = findPeerByAddress(await loadPeers(), address);
		if (!peer || !peer.paired) {
			console.warn('Ignoring a ping from an unknown or unpaired number.');
			return false;
		}

		if (!peer.allow) {
			addLog(peer, 'Ping blocked (tracking not allowed)');
			await store.update(peer);
			notifyPeersChanged();
			return false;
		}

		try {
			await sendLocationSMS(address);
			addLog(peer, 'Ping answered with my location');
		} catch (error) {
			addLog(peer, `Could not answer ping: ${error.message}`);
		}
		await store.update(peer);
		notifyPeersChanged();
		return true;
	}

	// Asks a paired peer for their location; the answer arrives as an SMS handled above.
	async function pingPeer(peerId) {
		const store = window.TraceDB;
		const peer = (await loadPeers()).find((row) => row.id === peerId);
		if (!peer) {
			throw new Error('Peer not found.');
		}
		if (!peer.paired) {
			throw new Error('Pair with this peer first.');
		}

		try {
			await sendSms(peer.phone, PING_MESSAGE);
			peer.status = 'waiting';
			addLog(peer, 'Ping sent via SMS');
		} catch (error) {
			peer.status = 'queue';
			addLog(peer, `Ping failed: ${error.message}`);
			await store.update(peer);
			notifyPeersChanged();
			throw error;
		}

		await store.update(peer);
		peers.set(peer.id, peer);
		selectPeer(peer.id);
		notifyPeersChanged();
		return peer;
	}

	// --- Leaflet map binding ----------------------------------------------

	const tooltipText = (text) => {
		const element = document.createElement('span');
		element.textContent = text;
		return element;
	};

	function markerStyle(fillVariable, radius) {
		return {
			radius,
			color: themeColor('--marker-outline'),
			weight: 2,
			fillColor: themeColor(fillVariable),
			fillOpacity: 1
		};
	}

	function targetMetrics(peer) {
		if (!hasLocation(peer)) {
			return null;
		}
		if (localPosition) {
			return {
				meters: calculateDistance(localPosition.latitude, localPosition.longitude, peer.lat, peer.lng),
				bearing: calculateBearing(localPosition.latitude, localPosition.longitude, peer.lat, peer.lng)
			};
		}
		return peer.dist == null ? null : { meters: peer.dist * 1000, bearing: peer.bearing };
	}

	function syncPeerMarkers() {
		if (!map) {
			return;
		}

		const live = new Set();
		peers.forEach((peer) => {
			if (!hasLocation(peer)) {
				return;
			}

			live.add(peer.id);
			const metrics = targetMetrics(peer);
			const label = metrics ? `${peer.name} · ${formatDistance(metrics.meters)}` : peer.name;
			const style = markerStyle('--target-marker-color', peer.id === selectedPeerId ? 10 : 8);
			let marker = peerMarkers.get(peer.id);
			if (!marker) {
				marker = window.L.circleMarker([peer.lat, peer.lng], style).addTo(map)
					.bindTooltip(tooltipText(label), { direction: 'top', offset: [0, -8] });
				peerMarkers.set(peer.id, marker);
			} else {
				marker.setLatLng([peer.lat, peer.lng]).setStyle(style).setTooltipContent(tooltipText(label));
			}
		});

		peerMarkers.forEach((marker, id) => {
			if (!live.has(id)) {
				marker.remove();
				peerMarkers.delete(id);
			}
		});
	}

	function updateRoute() {
		const peer = peers.get(selectedPeerId);
		if (!map || !localPosition || !hasLocation(peer)) {
			if (routeLine) {
				routeLine.remove();
				routeLine = null;
			}
			return;
		}

		const path = [[localPosition.latitude, localPosition.longitude], [peer.lat, peer.lng]];
		if (routeLine) {
			routeLine.setLatLngs(path);
		} else {
			routeLine = window.L.polyline(path, {
				color: themeColor('--route-color'),
				weight: 3,
				dashArray: '8 8',
				opacity: 0.9
			}).addTo(map);
		}
	}

	function focusPeerOnMap(peer) {
		syncPeerMarkers();
		updateRoute();
		renderTarget();

		if (!map || !hasLocation(peer)) {
			return;
		}
		if (localPosition) {
			map.fitBounds(window.L.latLngBounds([[localPosition.latitude, localPosition.longitude], [peer.lat, peer.lng]]), { padding: [48, 48], maxZoom: 17 });
		} else {
			map.setView([peer.lat, peer.lng], 15);
		}
	}

	function initializeMap() {
		if (!mapElement || !window.L) {
			if (mapUnavailable) {
				mapUnavailable.hidden = false;
			}
			updateMapStatus('Map library unavailable', 'is-offline');
			return;
		}

		let startCenter = DEFAULT_VIEW.center;
		let startZoom = DEFAULT_VIEW.zoom;
		try {
			const saved = JSON.parse(localStorage.getItem(LAST_FIX_KEY));
			if (Array.isArray(saved) && saved.length === 2 && saved.every(Number.isFinite)) {
				startCenter = saved;
				startZoom = 13;
			}
		} catch (error) {
			console.warn('Ignoring unreadable last GPS fix.', error);
		}

		map = window.L.map(mapElement, {
			zoomControl: false,
			scrollWheelZoom: false
		}).setView(startCenter, startZoom);

		window.L.control.zoom({ position: 'bottomleft' }).addTo(map);
		tileLayer = window.L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
			maxZoom: 17,
			attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
		}).addTo(map);

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

	// --- Target card and radar ----------------------------------------------

	function statusText(peer) {
		if (peer.status === 'waiting') {
			return 'Awaiting reply';
		}
		return peer.ts && Date.now() - peer.ts < ONLINE_WINDOW_MS ? 'Online' : 'Offline';
	}

	function renderTarget() {
		const peer = peers.get(selectedPeerId);
		const located = hasLocation(peer);
		const metrics = targetMetrics(peer);
		const name = peer ? peer.name : 'No peer selected';
		radarBearing = metrics && metrics.bearing != null ? metrics.bearing : null;

		setText('target-avatar', peer ? initials(peer.name) : '--');
		setText('target-name', name);
		setText('radar-target-name', name);
		setText('target-status', peer ? statusText(peer) : 'Waiting for SMS');
		setText('target-last-location', located && peer.ts ? `Last location - ${formatClock(peer.ts)} via SMS` : 'No SMS location received yet');
		setText('target-coordinates', located ? `${formatCoordinate(peer.lat, 'N', 'S')}\n${formatCoordinate(peer.lng, 'E', 'W')}` : '--');
		setText('target-distance', metrics ? `${formatDistance(metrics.meters)}${radarBearing === null ? '' : `\n${formatBearing(radarBearing)}`}` : '--');
		setText('radar-distance-value', metrics ? String(Math.round(metrics.meters)) : '--');
		setText('telemetry-age', located && peer.ts ? formatAge(peer.ts) : '--');
		setText('telemetry-lat', located ? formatCoordinate(peer.lat, 'N', 'S') : '--');
		setText('telemetry-lon', located ? formatCoordinate(peer.lng, 'E', 'W') : '--');
		setText('telemetry-received', located && peer.ts ? `Received at ${formatClock(peer.ts)}` : 'Nothing received yet');

		if (canvas) {
			canvas.setAttribute('aria-label', radarBearing === null
				? 'Compass waiting for a peer location'
				: `Compass pointing ${Math.round(radarBearing)} degrees toward ${name}`);
		}
		if (refreshSmsButton) {
			refreshSmsButton.disabled = !peer || !peer.paired;
		}

		drawRadar();
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

		// The dial turns with the phone: true north sits at -heading, and the arrow is relative to where the phone points.
		const north = deviceHeading === null ? 0 : deviceHeading;

		for (let degrees = 0; degrees < 360; degrees += 5) {
			const angle = (degrees - north - 90) * Math.PI / 180;
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
			const angle = (degrees - north - 90) * Math.PI / 180;
			const labelRadius = radius + 16;
			context.fillText(label, centerX + Math.cos(angle) * labelRadius, centerY + Math.sin(angle) * labelRadius);
		});

		if (radarBearing !== null) {
			const heading = (radarBearing - north - 90) * Math.PI / 180;
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
		}

		context.beginPath();
		context.arc(centerX, centerY, 7, 0, Math.PI * 2);
		context.fillStyle = radarCenter;
		context.fill();
	}

	// Compass runs only while the radar is on screen, to save battery.
	let radarFramePending = false;
	function scheduleRadarDraw() {
		if (radarFramePending) {
			return;
		}
		radarFramePending = true;
		requestAnimationFrame(() => {
			radarFramePending = false;
			drawRadar();
		});
	}

	function applyHeading(heading) {
		const reading = heading.trueHeading >= 0 ? heading.trueHeading : heading.magneticHeading;
		if (!Number.isFinite(reading)) {
			return;
		}
		if (deviceHeading === null) {
			deviceHeading = reading;
		} else {
			// Low-pass filter along the shortest way round the circle so the arrow does not jitter.
			const delta = ((reading - deviceHeading + 540) % 360) - 180;
			deviceHeading = (deviceHeading + delta * 0.3 + 360) % 360;
		}
		scheduleRadarDraw();
	}

	function syncCompass() {
		const shouldRun = currentMode === 'radar' && trackingVisible;
		if (shouldRun && compassWatchId === null && navigator.compass) {
			compassWatchId = navigator.compass.watchHeading(
				applyHeading,
				(error) => console.warn(`Compass watch error (code ${error && error.code}).`),
				{ frequency: 120 }
			);
		} else if (!shouldRun && compassWatchId !== null) {
			navigator.compass.clearWatch(compassWatchId);
			compassWatchId = null;
			deviceHeading = null;
		}
	}

	function setMode(mode) {
		currentMode = mode;
		const showRadar = mode === 'radar';
		mapPanel.hidden = showRadar;
		radarPanel.hidden = !showRadar;
		syncCompass();

		if (showRadar) {
			requestAnimationFrame(drawRadar);
		} else if (map) {
			requestAnimationFrame(() => map.invalidateSize());
		}
	}

	// --- UI wiring ----------------------------------------------------------

	if (openRadarButton) {
		openRadarButton.addEventListener('click', () => setMode('radar'));
	}

	if (returnToMapButton) {
		returnToMapButton.addEventListener('click', () => setMode('map'));
	}

	if (centerMapButton) {
		centerMapButton.addEventListener('click', () => {
			if (!map) {
				console.warn('Cannot recenter: the map is not available.');
				return;
			}
			if (!localPosition) {
				updateMapStatus('Waiting for GPS fix', 'is-checking');
				return;
			}

			map.flyTo([localPosition.latitude, localPosition.longitude], Math.max(map.getZoom(), 15));
		});
	}

	if (layersButton) {
		layersButton.addEventListener('click', () => {
			if (!tileLayer) {
				console.warn('Cannot change layers: the map is not available.');
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
		});
	}

	if (refreshSmsButton) {
		refreshSmsButton.addEventListener('click', () => {
			if (selectedPeerId === null) {
				return;
			}

			refreshSmsButton.disabled = true;
			pingPeer(selectedPeerId)
				.then(() => updateMapStatus('Ping sent. Waiting for reply', 'is-checking'))
				.catch((error) => updateMapStatus(error.message, 'is-offline'))
				.then(renderTarget);
		});
	}

	window.addEventListener('resize', drawRadar);
	document.addEventListener('app:themechange', () => {
		if (routeLine) {
			routeLine.setStyle({ color: themeColor('--route-color') });
		}
		if (localMarker) {
			localMarker.setStyle(markerStyle('--you-marker-color', 9));
		}
		syncPeerMarkers();
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
		trackingVisible = event.detail.view === 'view-tracking';
		syncCompass();
		if (trackingVisible) {
			refreshPeers();
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

	// settings.js announces when the permission flow progresses.
	document.addEventListener('app:permissions', (event) => {
		if (event.detail && event.detail.location) {
			startForegroundService();
			startLocationTracking();
		}
	});

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

	window.TraceSms = { subscribe: subscribeToSms };
	subscribeToSms(handleIncomingSms);

	window.TraceTracking = {
		getLocation,
		getHeading,
		sendLocationSMS,
		getSmsStatus,
		handleIncomingSms,
		calculateDistance,
		calculateBearing,
		pingPeer,
		selectPeer,
		refreshPeers,
		onPeersChanged,
		notifyPeersChanged,
		startForegroundService,
		stopForegroundService,
		testPing
	};

	function startHardware() {
		startSmsListener();
		startForegroundService();
		startLocationTracking();
		refreshPeers();
	}

	onPeersChanged(refreshPeers);
	document.addEventListener('deviceready', () => {
		startHardware();
		console.info('Trace-A-Peer hardware APIs ready.');
	}, false);
	setInterval(renderTarget, 30000);

	initializeMap();
	renderTarget();
	if (!window.cordova) {
		startHardware(); // browser preview: no deviceready event
	}
})();
