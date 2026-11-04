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
	const mockUserPosition = [37.7431, -119.5370];
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

		routeLine = window.L.polyline([mockUserPosition, selectedPeer.coordinates], {
			color: themeColor('--route-color'),
			weight: 3,
			dashArray: '8 8',
			opacity: 0.9
		}).addTo(map);

		const demoPeers = [
			{ name: 'You · demo', coordinates: mockUserPosition, color: themeColor('--you-marker-color'), radius: 9 },
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

			map.flyTo(mockUserPosition, Math.max(map.getZoom(), 15));
			console.info('Centered map on the mock user location.', mockUserPosition);
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

	initializeMap();
	updateMockTargetDetails();
})();
