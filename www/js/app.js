document.addEventListener('DOMContentLoaded', () => {
	const navigation = document.querySelector('.bottom-nav');

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
