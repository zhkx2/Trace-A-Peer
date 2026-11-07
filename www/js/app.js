const THEME_STORAGE_KEY = 'tap.theme';
const PEER_THEME_MESSAGE = 'trace-a-peer:theme';

function applyTheme(theme, persist = true) {
	const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
	document.body.classList.toggle('dark-theme', normalizedTheme === 'dark');

	const themeToggle = document.getElementById('theme-toggle');
	if (themeToggle) {
		themeToggle.checked = normalizedTheme === 'dark';
	}

	if (persist) {
		try {
			localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme);
		} catch (error) {
			console.warn('Unable to persist the theme preference.', error);
		}
	}

	const peerFrame = document.querySelector('.peer-view-frame');
	if (peerFrame && peerFrame.contentWindow) {
		const targetOrigin = window.location.origin === 'null' ? '*' : window.location.origin;
		peerFrame.contentWindow.postMessage({ type: PEER_THEME_MESSAGE, theme: normalizedTheme }, targetOrigin);
	}

	document.dispatchEvent(new CustomEvent('app:themechange', {
		detail: { theme: normalizedTheme }
	}));
}

function getSavedTheme() {
	try {
		return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
	} catch (error) {
		return 'light';
	}
}

document.addEventListener('DOMContentLoaded', () => {
	const navigation = document.querySelector('.bottom-nav');
	const themeToggle = document.getElementById('theme-toggle');
	const peerFrame = document.querySelector('.peer-view-frame');

	applyTheme(getSavedTheme(), false);

	if (themeToggle) {
		themeToggle.addEventListener('change', () => {
			applyTheme(themeToggle.checked ? 'dark' : 'light');
		});
	}

	if (peerFrame) {
		peerFrame.addEventListener('load', () => applyTheme(getSavedTheme(), false));
	}

	window.addEventListener('storage', (event) => {
		if (event.key === THEME_STORAGE_KEY) {
			applyTheme(event.newValue === 'dark' ? 'dark' : 'light', false);
		}
	});

	if (!navigation) {
		return;
	}

	navigation.addEventListener('click', (event) => {
		const tab = event.target.closest('[data-target]');

		if (!tab || !navigation.contains(tab)) {
			return;
		}

		const targetId = tab.dataset.target;
		const targetPanel = document.getElementById(targetId);

		if (!targetPanel) {
			return;
		}

		document.querySelectorAll('.view-panel').forEach((panel) => {
			const isActive = panel === targetPanel;
			panel.hidden = !isActive;
			panel.classList.toggle('active', isActive);
		});

		navigation.querySelectorAll('[data-target]').forEach((item) => {
			const isSelected = item === tab;
			item.classList.toggle('active', isSelected);
			item.setAttribute('aria-selected', String(isSelected));
		});

		window.dispatchEvent(new CustomEvent('app:viewchange', {
			detail: { view: targetId }
		}));
	});
});
