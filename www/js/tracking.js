(() => {
	const mapElement = document.getElementById('map');
	const mapPanel = document.getElementById('map-panel');
	const radarPanel = document.getElementById('radar-panel');
	const canvas = document.getElementById('radar-canvas');
	const modeToggle = document.getElementById('view-mode-toggle');
	const modeLabel = document.getElementById('mode-button-label');
	const mapStatus = document.getElementById('map-status');
	const mapStatusText = document.getElementById('map-status-text');
	const mapUnavailable = document.getElementById('map-unavailable');
	const context = canvas && canvas.getContext('2d');
	let map;
	let tileLayer;
	let tileLoaded = false;
	let currentMode = 'map';

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
		}).setView([51.505, -0.09], 14);

		window.L.control.zoom({ position: 'bottomleft' }).addTo(map);
		tileLayer = window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
		}).addTo(map);

		const demoPeers = [
			{ name: 'You · demo', coordinates: [51.505, -0.09], color: '#b5e66b', radius: 9 },
			{ name: 'Mira · sample', coordinates: [51.510, -0.076], color: '#ed795e', radius: 7 },
			{ name: 'Rafi · sample', coordinates: [51.498, -0.102], color: '#5e9da0', radius: 7 },
			{ name: 'Sol · sample', coordinates: [51.509, -0.105], color: '#e8b34f', radius: 7 }
		];

		demoPeers.forEach((peer) => {
			window.L.circleMarker(peer.coordinates, {
				radius: peer.radius,
				color: '#f8f6ec',
				weight: 2,
				fillColor: peer.color,
				fillOpacity: 1
			}).addTo(map).bindTooltip(peer.name, { direction: 'top', offset: [0, -8] });
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
		const radius = Math.max(40, Math.min(width, height) * 0.39);

		context.clearRect(0, 0, width, height);
		context.fillStyle = '#101e37';
		context.fillRect(0, 0, width, height);

		const glow = context.createRadialGradient(centerX, centerY, 2, centerX, centerY, radius);
		glow.addColorStop(0, 'rgba(86, 160, 137, 0.20)');
		glow.addColorStop(1, 'rgba(20, 40, 39, 0)');
		context.fillStyle = glow;
		context.beginPath();
		context.arc(centerX, centerY, radius, 0, Math.PI * 2);
		context.fill();

		context.strokeStyle = 'rgba(177, 219, 194, 0.24)';
		context.lineWidth = 1;
		[0.25, 0.5, 0.75, 1].forEach((scale) => {
			context.beginPath();
			context.arc(centerX, centerY, radius * scale, 0, Math.PI * 2);
			context.stroke();
		});

		context.strokeStyle = 'rgba(177, 219, 194, 0.16)';
		context.beginPath();
		context.moveTo(centerX - radius, centerY);
		context.lineTo(centerX + radius, centerY);
		context.moveTo(centerX, centerY - radius);
		context.lineTo(centerX, centerY + radius);
		context.stroke();

		context.font = '600 10px sans-serif';
		context.fillStyle = 'rgba(208, 227, 211, 0.66)';
		context.textAlign = 'center';
		context.fillText('N', centerX, centerY - radius - 10);
		context.fillText('E', centerX + radius + 12, centerY + 3);
		context.fillText('S', centerX, centerY + radius + 15);
		context.fillText('W', centerX - radius - 12, centerY + 3);

		const peers = [
			{ x: centerX + radius * 0.60, y: centerY - radius * 0.45, color: '#ed795e' },
			{ x: centerX - radius * 0.58, y: centerY - radius * 0.27, color: '#5e9da0' },
			{ x: centerX + radius * 0.26, y: centerY + radius * 0.68, color: '#e8b34f' }
		];

		peers.forEach((peer) => {
			context.beginPath();
			context.arc(peer.x, peer.y, 5, 0, Math.PI * 2);
			context.fillStyle = peer.color;
			context.fill();
			context.beginPath();
			context.arc(peer.x, peer.y, 9, 0, Math.PI * 2);
			context.strokeStyle = `${peer.color}88`;
			context.stroke();
		});

		const heading = -Math.PI / 2 + Math.PI / 4;
		const arrowLength = radius * 0.58;
		const tipX = centerX + Math.cos(heading) * arrowLength;
		const tipY = centerY + Math.sin(heading) * arrowLength;
		context.strokeStyle = '#b5e66b';
		context.fillStyle = '#b5e66b';
		context.lineWidth = 3;
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
		context.lineTo(-8, -5);
		context.lineTo(-8, 5);
		context.closePath();
		context.fill();
		context.restore();

		context.beginPath();
		context.arc(centerX, centerY, 6, 0, Math.PI * 2);
		context.fillStyle = '#f3f0e5';
		context.fill();
	}

	function setMode(mode) {
		currentMode = mode;
		const showRadar = mode === 'radar';
		mapPanel.hidden = showRadar;
		radarPanel.hidden = !showRadar;
		modeToggle.setAttribute('aria-pressed', String(showRadar));
		modeToggle.setAttribute('aria-label', `Switch to ${showRadar ? 'map' : 'radar'} mode`);
		modeLabel.textContent = showRadar ? 'Map mode' : 'Radar mode';

		if (showRadar) {
			requestAnimationFrame(drawRadar);
		} else if (map) {
			requestAnimationFrame(() => map.invalidateSize());
		}
	}

	if (modeToggle && mapPanel && radarPanel) {
		modeToggle.addEventListener('click', () => {
			setMode(currentMode === 'map' ? 'radar' : 'map');
		});
	}

	window.addEventListener('resize', drawRadar);
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
})();
