/**
 * SafeRoute AI — Main Application Orchestrator
 * Coordinates Navigation, Map, Risk Engine, Geolocation, Check-ins, and Reports.
 */

window.App = {
  currentTab: 'dashboard',
  config: null,
  userProfile: null,
  activeJourney: null,
  reports: [],
  geoWatchId: null,
  isPinningReport: false,
  pendingReportCoords: null,

  async init() {
    console.log('[SafeRoute AI] Bootstrapping application...');
    
    // Initialize components
    window.RiskGauge && window.RiskGauge.init();
    window.DemoSimulator && window.DemoSimulator.init();

    // Bind DOM events
    this.bindTabNavigation();
    this.bindModals();
    this.bindStartJourneyForm();

    // Load initial data
    await this.loadInitialData();

    // Request Geolocation
    this.initGeolocation();

    // Initialize Lucide icons
    if (window.lucide) {
      window.lucide.createIcons();
    }
  },

  async loadInitialData() {
    try {
      // 1. Config
      const cfgResp = await API.getConfig();
      this.config = cfgResp;

      // Init map with default or configured center
      const center = cfgResp.default_center || { lat: 37.7749, lng: -122.4194 };
      if (window.MapManager) {
        window.MapManager.init(center.lat, center.lng);
        window.MapManager.renderSafeHavens(cfgResp.safe_havens);
      }

      // Render preset destination cards
      this.renderPresetDestinations(cfgResp.preset_destinations);

      // 2. Profile & Contacts
      await this.loadProfile();

      // 3. Safety Reports
      await this.loadReports();

      // 4. Check for active journey
      await this.syncJourneyState();

    } catch (e) {
      console.error('[App] Error loading initial data:', e);
    }
  },

  async loadProfile() {
    try {
      const resp = await API.getProfile();
      if (resp.status === 'success') {
        this.userProfile = resp.profile;
        this.renderProfileUI(resp.profile);
        this.renderContactsList(resp.profile.contacts || []);
      }
    } catch (e) {
      console.error('Error fetching profile:', e);
    }
  },

  async loadReports() {
    try {
      const resp = await API.getReports();
      if (resp.status === 'success') {
        this.reports = resp.reports;
        if (window.MapManager) {
          window.MapManager.renderSafetyReports(resp.reports);
        }
        this.renderReportsList(resp.reports);
      }
    } catch (e) {
      console.error('Error fetching reports:', e);
    }
  },

  async syncJourneyState() {
    try {
      const resp = await API.getActiveJourney();
      if (resp.status === 'success' && resp.journey) {
        this.activeJourney = resp.journey;
        this.renderActiveJourneyUI(resp.journey);

        // Update Map
        if (window.MapManager) {
          window.MapManager.drawPlannedRoute(resp.journey.planned_route);
          window.MapManager.drawActualPath(resp.journey.actual_path, resp.journey.risk_level);
          window.MapManager.setDestinationMarker(resp.journey.dest_lat, resp.journey.dest_lng, resp.journey.dest_address);
          window.MapManager.updateUserLocation(resp.journey.current_lat, resp.journey.current_lng);
        }

        // Start check-in timer
        const intervalMins = (this.userProfile && this.userProfile.checkin_interval_mins) || 5;
        if (window.CheckinManager) {
          window.CheckinManager.init(intervalMins, resp.journey.id);
        }

        // Update Risk Gauge
        if (window.RiskGauge) {
          window.RiskGauge.update({
            risk_score: resp.journey.risk_score,
            risk_level: resp.journey.risk_level,
            factors: (resp.journey.recent_risk_logs && resp.journey.recent_risk_logs[0] && resp.journey.recent_risk_logs[0].factors) || [],
            explanation: (resp.journey.recent_risk_logs && resp.journey.recent_risk_logs[0] && resp.journey.recent_risk_logs[0].explanation) || 'Active journey monitoring enabled.',
            recommended_action: (resp.journey.recent_risk_logs && resp.journey.recent_risk_logs[0] && resp.journey.recent_risk_logs[0].recommended_action) || 'Continue along your planned route.',
            action_type: 'continue'
          });
        }
      } else {
        this.activeJourney = null;
        this.renderInactiveJourneyUI();
      }
    } catch (e) {
      console.error('Error syncing journey state:', e);
    }
  },

  // GEOLOCATION
  initGeolocation() {
    const geoStatus = document.getElementById('geo-status-indicator');
    if (!('geolocation' in navigator)) {
      if (geoStatus) geoStatus.textContent = 'GPS: Simulated (High Accuracy)';
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (window.MapManager) {
          window.MapManager.updateUserLocation(lat, lng, false);
        }
        if (geoStatus) {
          geoStatus.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400"></span> GPS: Live Locked (±' + Math.round(pos.coords.accuracy) + 'm)';
        }
      },
      (err) => {
        console.warn('[Geolocation] Browser location unavailable, using high-accuracy demo corridor:', err.message);
        if (geoStatus) {
          geoStatus.innerHTML = '<span class="w-2 h-2 rounded-full bg-cyan-400"></span> GPS: Demo Corridor Locked';
        }
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 10000 }
    );
  },

  // TAB NAVIGATION
  bindTabNavigation() {
    const navButtons = document.querySelectorAll('[data-tab-target]');
    navButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = btn.getAttribute('data-tab-target');
        this.switchTab(tab);
      });
    });
  },

  switchTab(tabKey) {
    this.currentTab = tabKey;
    const tabPanes = document.querySelectorAll('.tab-content-pane');
    tabPanes.forEach(pane => {
      pane.classList.add('hidden');
    });

    const activePane = document.getElementById(`tab-pane-${tabKey}`);
    if (activePane) {
      activePane.classList.remove('hidden');
    }

    // Update nav buttons active styles
    const navButtons = document.querySelectorAll('[data-tab-target]');
    navButtons.forEach(btn => {
      const target = btn.getAttribute('data-tab-target');
      if (target === tabKey) {
        btn.classList.add('text-cyan-400', 'bg-slate-800/80', 'border-cyan-500/50');
        btn.classList.remove('text-slate-400', 'border-transparent');
      } else {
        btn.classList.remove('text-cyan-400', 'bg-slate-800/80', 'border-cyan-500/50');
        btn.classList.add('text-slate-400', 'border-transparent');
      }
    });

    // Invalidate Leaflet map size on switch to ensure crisp rendering
    if (tabKey === 'dashboard' && window.MapManager && window.MapManager.map) {
      setTimeout(() => {
        window.MapManager.map.invalidateSize();
      }, 100);
    }
  },

  // START JOURNEY
  bindStartJourneyForm() {
    const customForm = document.getElementById('custom-journey-form');
    if (customForm) {
      customForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const destInput = document.getElementById('journey-dest-input');
        const destAddress = destInput ? destInput.value.trim() : 'Destination Point';
        
        // Use standard destination point offset if custom
        const startLat = window.MapManager ? window.MapManager.currentLat : 37.7749;
        const startLng = window.MapManager ? window.MapManager.currentLng : -122.4194;
        const destLat = startLat + 0.009;
        const destLng = startLng + 0.011;

        await this.startJourney({
          start_lat: startLat,
          start_lng: startLng,
          dest_lat: destLat,
          dest_lng: destLng,
          dest_address: destAddress,
          planned_route: [
            [startLat, startLng],
            [startLat + 0.003, startLng + 0.004],
            [startLat + 0.006, startLng + 0.008],
            [destLat, destLng]
          ]
        });
      });
    }
  },

  async startPresetJourney(index) {
    if (!this.config || !this.config.preset_destinations || !this.config.preset_destinations[index]) return;
    const preset = this.config.preset_destinations[index];
    const sampleRoute = this.config.sample_route || [];

    const startPt = sampleRoute[0] || [37.7749, -122.4194];
    await this.startJourney({
      start_lat: startPt[0],
      start_lng: startPt[1],
      dest_lat: preset.lat,
      dest_lng: preset.lng,
      dest_address: preset.name,
      planned_route: sampleRoute
    });
  },

  async startJourney(payload) {
    try {
      const resp = await API.startJourney(payload);
      if (resp.status === 'success') {
        this.activeJourney = resp.journey;
        this.renderActiveJourneyUI(resp.journey);
        
        if (window.MapManager) {
          window.MapManager.drawPlannedRoute(resp.journey.planned_route);
          window.MapManager.setDestinationMarker(resp.journey.dest_lat, resp.journey.dest_lng, resp.journey.dest_address);
          window.MapManager.updateUserLocation(resp.journey.start_lat, resp.journey.start_lng, true);
          window.MapManager.recenterRoute();
        }

        const intervalMins = (this.userProfile && this.userProfile.checkin_interval_mins) || 5;
        if (window.CheckinManager) {
          window.CheckinManager.init(intervalMins, resp.journey.id);
        }

        if (window.VoiceEngine) {
          window.VoiceEngine.playSuccessChime();
          window.VoiceEngine.speak(`Active journey initiated to ${resp.journey.dest_address}. Safety Net engaged.`);
        }

        this.switchTab('dashboard');
      }
    } catch (e) {
      alert(`Error starting journey: ${e.message}`);
    }
  },

  async endCurrentJourney() {
    if (!this.activeJourney) return;
    if (!confirm("Are you sure you want to conclude this safe journey?")) return;

    try {
      await API.endJourney(this.activeJourney.id, 'completed');
      this.activeJourney = null;
      this.renderInactiveJourneyUI();
      if (window.CheckinManager) {
        window.CheckinManager.stopTimer();
      }
      if (window.VoiceEngine) {
        window.VoiceEngine.playSuccessChime();
        window.VoiceEngine.speak("Journey completed safely. SafeRoute companion standby.");
      }
    } catch (e) {
      console.error('Error ending journey:', e);
    }
  },

  handleCheckin() {
    if (window.CheckinManager) {
      window.CheckinManager.confirmSafe();
    }
  },

  // RENDERERS
  renderPresetDestinations(presets) {
    const container = document.getElementById('preset-destinations-container');
    if (!container || !presets) return;

    container.innerHTML = presets.map((p, idx) => `
      <div onclick="window.App.startPresetJourney(${idx})" class="p-3.5 rounded-xl glass-panel hover:border-cyan-500/60 hover:bg-slate-800/80 transition-all cursor-pointer group flex items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-cyan-950/80 text-cyan-400 border border-cyan-700/50 flex items-center justify-center group-hover:scale-105 transition">
            <i data-lucide="map-pin" class="w-4 h-4"></i>
          </div>
          <div>
            <div class="text-xs font-bold text-slate-100 group-hover:text-cyan-300 transition">${p.name}</div>
            <div class="text-[11px] text-slate-400 mt-0.5">${p.address}</div>
          </div>
        </div>
        <div class="text-right shrink-0">
          <span class="text-[11px] font-mono text-cyan-400 font-bold bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/60">~${p.est_walking_mins} min</span>
        </div>
      </div>
    `).join('');

    if (window.lucide) window.lucide.createIcons();
  },

  renderActiveJourneyUI(journey) {
    const card = document.getElementById('active-journey-banner');
    const destName = document.getElementById('active-dest-name');
    const startName = document.getElementById('active-start-name');
    const startBtn = document.getElementById('quick-start-journey-btn');

    if (card) card.classList.remove('hidden');
    if (startBtn) startBtn.classList.add('hidden');

    if (destName) destName.textContent = journey.dest_address;
    if (startName) startName.textContent = journey.start_address;
  },

  renderInactiveJourneyUI() {
    const card = document.getElementById('active-journey-banner');
    const startBtn = document.getElementById('quick-start-journey-btn');

    if (card) card.classList.add('hidden');
    if (startBtn) startBtn.classList.remove('hidden');
  },

  renderProfileUI(profile) {
    const nameEl = document.getElementById('profile-display-name');
    const roleEl = document.getElementById('profile-display-role');
    const batteryEl = document.getElementById('profile-display-battery');
    const batteryBar = document.getElementById('profile-battery-bar');

    if (nameEl) nameEl.textContent = profile.name;
    if (roleEl) roleEl.textContent = profile.role_description;
    if (batteryEl) batteryEl.textContent = `${profile.battery_level}%`;
    if (batteryBar) batteryBar.style.width = `${profile.battery_level}%`;
  },

  renderContactsList(contacts) {
    const container = document.getElementById('trusted-contacts-list');
    const quickPings = document.getElementById('dashboard-contacts-quick');

    if (container) {
      if (contacts.length === 0) {
        container.innerHTML = `<div class="text-xs text-slate-400 italic p-4 text-center">No trusted emergency contacts added yet.</div>`;
      } else {
        container.innerHTML = contacts.map(c => `
          <div class="p-3 rounded-xl glass-panel flex items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 text-cyan-400 flex items-center justify-center font-bold text-xs">
                ${c.name.charAt(0)}
              </div>
              <div>
                <div class="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <span>${c.name}</span>
                  ${c.is_primary ? '<span class="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">PRIMARY</span>' : ''}
                </div>
                <div class="text-[11px] text-slate-400 font-mono">${c.relationship} • ${c.phone}</div>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="window.App.deleteContact(${c.id})" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </div>
        `).join('');
      }
    }

    if (quickPings && contacts.length > 0) {
      quickPings.innerHTML = contacts.slice(0, 2).map(c => `
        <div class="px-2.5 py-1.5 rounded-lg bg-slate-900/60 border border-slate-700/60 text-xs flex items-center justify-between">
          <span class="text-slate-300 font-medium">${c.name}</span>
          <span class="text-[10px] text-emerald-400 flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Connected
          </span>
        </div>
      `).join('');
    }

    if (window.lucide) window.lucide.createIcons();
  },

  renderReportsList(reports) {
    const list = document.getElementById('community-reports-board-list');
    if (!list) return;

    if (reports.length === 0) {
      list.innerHTML = `<div class="text-xs text-slate-400 italic p-4 text-center">No community hazard reports active in your vicinity.</div>`;
      return;
    }

    list.innerHTML = reports.map(r => `
      <div class="p-3.5 rounded-xl glass-panel flex items-start justify-between gap-3">
        <div class="flex items-start gap-3">
          <div class="p-2 rounded-lg bg-slate-900/80 ${r.severity === 'high' ? 'text-rose-400' : 'text-amber-400'} border border-slate-700 mt-0.5">
            <i data-lucide="alert-triangle" class="w-4 h-4"></i>
          </div>
          <div>
            <div class="text-xs font-bold text-slate-200 flex items-center gap-2">
              <span>${r.title}</span>
              <span class="text-[9px] font-mono px-1.5 py-0.2 rounded ${r.severity === 'high' ? 'bg-rose-950 text-rose-300' : 'bg-amber-950 text-amber-300'} border border-slate-700 uppercase">${r.severity}</span>
            </div>
            <div class="text-[11px] text-slate-400 mt-1 leading-snug">${r.description}</div>
            <div class="text-[10px] text-slate-500 mt-1 flex items-center gap-2">
              <span>📍 ${r.address}</span>
            </div>
          </div>
        </div>
        <div class="shrink-0 text-right">
          <button onclick="window.App.handleUpvoteReport(${r.id})" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs text-cyan-300 flex items-center gap-1.5 transition">
            <span>👍</span> <span class="font-bold font-mono">${r.upvotes}</span>
          </button>
        </div>
      </div>
    `).join('');

    if (window.lucide) window.lucide.createIcons();
  },

  // CONTACTS & REPORTS HANDLERS
  async deleteContact(id) {
    if (!confirm("Remove this trusted contact?")) return;
    try {
      await API.deleteContact(id);
      await this.loadProfile();
    } catch (e) {
      alert("Failed to delete contact: " + e.message);
    }
  },

  async handleUpvoteReport(id) {
    try {
      await API.upvoteReport(id);
      await this.loadReports();
    } catch (e) {
      console.error(e);
    }
  },

  // MODALS & REPORT SUBMISSION
  bindModals() {
    // Add Contact Modal
    const addContactForm = document.getElementById('add-contact-form');
    if (addContactForm) {
      addContactForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('contact-name-input').value;
        const phone = document.getElementById('contact-phone-input').value;
        const rel = document.getElementById('contact-rel-input').value;
        const primary = document.getElementById('contact-primary-input').checked;

        try {
          await API.addContact({ name, phone, relationship: rel, is_primary: primary });
          this.closeModal('add-contact-modal');
          addContactForm.reset();
          await this.loadProfile();
        } catch (err) {
          alert('Error adding contact: ' + err.message);
        }
      });
    }

    // Submit Safety Report Form
    const reportForm = document.getElementById('submit-report-form');
    if (reportForm) {
      reportForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cat = document.getElementById('report-cat-input').value;
        const title = document.getElementById('report-title-input').value;
        const desc = document.getElementById('report-desc-input').value;
        const sev = document.getElementById('report-sev-input').value;
        const addr = document.getElementById('report-addr-input').value || 'Reported Location';

        const lat = this.pendingReportCoords ? this.pendingReportCoords.lat : (window.MapManager ? window.MapManager.currentLat : 37.7770);
        const lng = this.pendingReportCoords ? this.pendingReportCoords.lng : (window.MapManager ? window.MapManager.currentLng : -122.4150);

        try {
          await API.createReport({
            category: cat,
            title: title,
            description: desc,
            severity: sev,
            address: addr,
            lat: lat,
            lng: lng
          });
          this.closeModal('submit-report-modal');
          reportForm.reset();
          this.pendingReportCoords = null;
          await this.loadReports();
          alert("Community hazard report submitted and pinned to safety network.");
        } catch (err) {
          alert('Error creating report: ' + err.message);
        }
      });
    }
  },

  openModal(id) {
    const m = document.getElementById(id);
    if (m) {
      m.classList.remove('hidden');
      m.classList.add('flex');
    }
  },

  closeModal(id) {
    const m = document.getElementById(id);
    if (m) {
      m.classList.add('hidden');
      m.classList.remove('flex');
    }
  },

  startPinningReport() {
    this.isPinningReport = true;
    this.switchTab('dashboard');
    alert("Click anywhere on the map to pin the hazard location.");
  },

  handleReportPinSelected(lat, lng) {
    this.isPinningReport = false;
    this.pendingReportCoords = { lat, lng };
    const addrInput = document.getElementById('report-addr-input');
    if (addrInput) {
      addrInput.value = `Pinned Coordinates (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    }
    this.openModal('submit-report-modal');
  }
};

// Start application on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  window.App.init();
});
