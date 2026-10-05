(() => {
  const DATA_URL = 'dados/celulas-demo.json';
  const SAO_PAULO = [-23.55052, -46.633308];
  const DAY_ORDER = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'];
  const state = { cells: [], presencial: [], online: [], map: null, markers: new Map(), origin: null, searchController: null, requestId: 0 };

  const $ = (selector) => document.querySelector(selector);
  const els = {
    tabs: [...document.querySelectorAll('.mode-tab')],
    presencialPanel: $('#panel-presencial'), onlinePanel: $('#panel-online'),
    form: $('#address-form'), input: $('#address-input'), location: $('#location-button'),
    status: $('#status-message'), list: $('#cell-list'), count: $('#result-count'),
    dayFilters: $('#day-filters'), onlineList: $('#online-list')
  };

  const escapeHTML = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const titleCase = (text) => text.charAt(0).toUpperCase() + text.slice(1);
  const distanceKm = (a, b) => {
    const rad = (n) => n * Math.PI / 180;
    const dLat = rad(b[0] - a[0]); const dLon = rad(b[1] - a[1]);
    const h = Math.sin(dLat/2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon/2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
  };
  const setStatus = (message, error = false) => { els.status.textContent = message; els.status.classList.toggle('is-error', error); };

  function selectTab(tab) {
    const presencial = tab.dataset.mode === 'presencial';
    els.tabs.forEach((item) => {
      const active = item === tab;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
    });
    els.presencialPanel.hidden = !presencial;
    els.onlinePanel.hidden = presencial;
    if (presencial && state.map) setTimeout(() => state.map.invalidateSize(), 0);
  }

  function initTabs() {
    els.tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => selectTab(tab));
      tab.addEventListener('keydown', (event) => {
        const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
        if (!keys.includes(event.key)) return;
        event.preventDefault();
        let next = index;
        if (event.key === 'ArrowLeft') next = (index - 1 + els.tabs.length) % els.tabs.length;
        if (event.key === 'ArrowRight') next = (index + 1) % els.tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = els.tabs.length - 1;
        selectTab(els.tabs[next]);
        els.tabs[next].focus();
      });
    });
    selectTab(els.tabs.find((tab) => tab.classList.contains('is-active')) || els.tabs[0]);
  }

  function initMap() {
    if (!window.L) { setStatus('O mapa não pôde ser carregado. A lista continua disponível.', true); return; }
    state.map = L.map('cell-map', { scrollWheelZoom: false }).setView(SAO_PAULO, 10.5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(state.map);
    state.presencial.forEach((cell) => {
      const icon = L.divIcon({ className: '', html: '<span class="cell-pin" style="display:block;width:20px;height:20px"></span>', iconSize:[20,20], iconAnchor:[10,10] });
      const marker = L.marker([cell.latitude, cell.longitude], { icon }).addTo(state.map);
      marker.bindPopup(`<strong>${escapeHTML(cell.nome)}</strong><br>${escapeHTML(cell.referencia)}<br>${escapeHTML(cell.diaSemana)} · ${escapeHTML(cell.horario)}`);
      marker.on('click', () => activateCard(cell.id)); state.markers.set(cell.id, marker);
    });
  }

  function activateCard(id) {
    document.querySelectorAll('.cell-card').forEach((card) => card.classList.toggle('is-active', card.dataset.id === id));
    const card = document.querySelector(`.cell-card[data-id="${CSS.escape(id)}"]`);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderPresencial(origin = null, label = '') {
    state.origin = origin;
    const cells = state.presencial.map((cell) => ({ ...cell, distance: origin ? distanceKm(origin, [cell.latitude, cell.longitude]) : null }))
      .sort((a,b) => origin ? a.distance - b.distance : a.regiao.localeCompare(b.regiao, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'));
    els.count.textContent = `${cells.length} pontos de teste`;
    els.list.innerHTML = cells.map((cell) => {
      const distance = cell.distance == null ? cell.regiao : `${cell.distance.toFixed(1).replace('.', ',')} km`;
      const route = `https://www.google.com/maps/dir/?api=1&destination=${cell.latitude},${cell.longitude}`;
      return `<article class="cell-card" data-id="${escapeHTML(cell.id)}"><div class="cell-card-top"><div><h4>${escapeHTML(cell.nome)}</h4><p class="reference">Referência: ${escapeHTML(cell.referencia)}</p></div><span class="distance">${escapeHTML(distance)}</span></div><p>${escapeHTML(titleCase(cell.diaSemana))} · ${escapeHTML(cell.horario)}</p><p>${escapeHTML(cell.bairro)} · ${escapeHTML(cell.cidade)}</p><button class="map-focus" type="button">Ver no mapa</button><a class="route-link" href="${route}" target="_blank" rel="noopener">Ver rota ↗</a></article>`;
    }).join('');
    els.list.querySelectorAll('.cell-card').forEach((card) => {
      const open = () => { const marker = state.markers.get(card.dataset.id); if (marker && state.map) { state.map.setView(marker.getLatLng(), 14); marker.openPopup(); activateCard(card.dataset.id); } };
      card.addEventListener('click', (event) => { if (!event.target.closest('a, button')) open(); });
      card.querySelector('.map-focus').addEventListener('click', open);
    });
    if (origin && state.map) {
      const bounds = L.latLngBounds(cells.slice(0, 5).map((cell) => [cell.latitude, cell.longitude])); bounds.extend(origin); state.map.fitBounds(bounds, { padding:[35,35], maxZoom:13 });
      if (state.originMarker) state.originMarker.remove();
      state.originMarker = L.circleMarker(origin, { radius:8, color:'#3A0505', fillColor:'#C9A227', fillOpacity:1, weight:3 }).addTo(state.map).bindPopup('Sua referência de busca');
      setStatus(`Resultados ordenados pela distância de ${label}.`);
    }
  }

  async function geocode(query, signal) {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&accept-language=pt-BR&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal });
    if (!response.ok) throw new Error('Falha na busca');
    const results = await response.json();
    if (!results.length) throw new Error('Endereço não encontrado');
    return [Number(results[0].lat), Number(results[0].lon)];
  }

  function initSearch() {
    els.form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const query = els.input.value.trim();
      if (!query) return;
      if (state.searchController) state.searchController.abort();
      const requestId = ++state.requestId;
      const controller = new AbortController();
      state.searchController = controller;
      setStatus('Buscando endereço…');
      try {
        const origin = await geocode(`${query}, São Paulo, SP`, controller.signal);
        if (state.requestId !== requestId || state.searchController !== controller) return;
        renderPresencial(origin, query);
      } catch (error) {
        if (state.requestId !== requestId || state.searchController !== controller || error.name === 'AbortError') return;
        setStatus(error.message === 'Endereço não encontrado' ? 'Não encontramos esse endereço. Tente informar bairro, rua ou CEP.' : 'A busca está indisponível agora. Você ainda pode explorar todos os pontos.', true);
      } finally {
        if (state.searchController === controller) state.searchController = null;
      }
    });
    els.location.addEventListener('click', () => {
      if (state.searchController) { state.searchController.abort(); state.searchController = null; }
      const requestId = ++state.requestId;
      if (!navigator.geolocation) { setStatus('A localização não é compatível com este navegador.', true); return; }
      setStatus('Solicitando sua localização…');
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          if (state.requestId !== requestId) return;
          renderPresencial([coords.latitude, coords.longitude], 'sua localização');
        },
        () => {
          if (state.requestId !== requestId) return;
          setStatus('Não foi possível acessar sua localização. Digite um endereço para continuar.', true);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  function renderOnline(day) {
    const cells = state.online.filter((cell) => !day || cell.diaSemana === day);
    els.dayFilters.querySelectorAll('.day-filter').forEach((button) => { const active = button.dataset.day === day; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); });
    els.onlineList.innerHTML = cells.length ? cells.map((cell) => `<article class="online-card"><span class="online-day">${escapeHTML(titleCase(cell.diaSemana))} · ${escapeHTML(cell.horario)}</span><h3>${escapeHTML(cell.nome)}</h3><p>Reunião online de demonstração. O acesso real será enviado após confirmação.</p><a href="https://wa.me/5511988916868">Solicitar informações ↗</a></article>`).join('') : '<p class="empty-state">Não há encontro de demonstração neste dia.</p>';
  }

  function initOnline() {
    DAY_ORDER.forEach((day) => { const button = document.createElement('button'); button.type='button'; button.className='day-filter'; button.dataset.day=day; button.setAttribute('aria-pressed','false'); button.textContent=titleCase(day); button.addEventListener('click', () => renderOnline(day)); els.dayFilters.appendChild(button); });
    renderOnline(state.online[0]?.diaSemana || DAY_ORDER[0]);
  }

  async function boot() {
    initTabs();
    try {
      const response = await fetch(DATA_URL); if (!response.ok) throw new Error();
      const data = await response.json(); state.cells = data.celulas.filter((cell) => cell.ativo); state.presencial = state.cells.filter((cell) => cell.modalidade === 'presencial' && Number.isFinite(cell.latitude) && Number.isFinite(cell.longitude)); state.online = state.cells.filter((cell) => cell.modalidade === 'online');
      renderPresencial(); initMap(); initSearch(); initOnline();
    } catch { setStatus('Não foi possível carregar os dados de demonstração.', true); els.list.innerHTML='<p class="empty-state">Dados temporariamente indisponíveis.</p>'; }
  }
  boot();
})();
