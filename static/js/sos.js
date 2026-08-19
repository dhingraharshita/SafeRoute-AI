/**
 * SafeRoute AI — Emergency SOS Engine
 * Handles emergency escalation, instant emergency modal,
 * sirens, WhatsApp/SMS quick links, and PIN-secured disarm.
 */

const SOSManager = {
  isSOSActive: false,
  currentEvent: null,

  openSOSModal() {
    const modal = document.getElementById('sos-confirmation-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  },

  closeSOSModal() {
    const modal = document.getElementById('sos-confirmation-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  },

  async triggerEmergencySOS(source = 'manual_sos') {
    this.closeSOSModal();
    this.isSOSActive = true;

    const lat = window.MapManager ? window.MapManager.currentLat : 37.7749;
    const lng = window.MapManager ? window.MapManager.currentLng : -122.4194;

    // Start siren audio & speech alert
    if (window.VoiceEngine) {
      window.VoiceEngine.playEmergencySiren();
      window.VoiceEngine.speak("Emergency SOS Activated. Alerting trusted contacts with real-time location.");
    }

    try {
      const resp = await API.triggerSOS(lat, lng, source);
      this.currentEvent = resp;
      this.renderEmergencyScreen(resp);
    } catch (e) {
      console.error('[SOSManager] Error triggering SOS:', e);
    }
  },

  renderEmergencyScreen(data) {
    const screen = document.getElementById('sos-active-screen');
    if (!screen) return;

    screen.classList.remove('hidden');
    screen.classList.add('flex');
    document.body.classList.add('emergency-strobe-active');

    // Populate live coordinates & maps link
    const coordsEl = document.getElementById('sos-gps-coords');
    const mapsLinkEl = document.getElementById('sos-maps-link');
    if (coordsEl) coordsEl.textContent = `${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}`;
    if (mapsLinkEl) {
      mapsLinkEl.href = data.maps_url;
      mapsLinkEl.textContent = data.maps_url;
    }

    // Populate emergency contacts dispatch cards
    const contactsListEl = document.getElementById('sos-contacts-broadcast-list');
    if (contactsListEl && data.contacts_notified) {
      contactsListEl.innerHTML = data.contacts_notified.map(c => `
        <div class="p-3 rounded-xl bg-slate-900/90 border border-rose-600/40 flex items-center justify-between gap-3">
          <div>
            <div class="text-xs font-bold text-white flex items-center gap-1.5">
              <span>👤 ${c.name}</span>
              <span class="text-[10px] px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-700/50">${c.relationship}</span>
            </div>
            <div class="text-[11px] text-slate-300 font-mono mt-0.5">${c.phone}</div>
            <div class="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Dispatched (Simulated)
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <a href="${c.whatsapp_link}" target="_blank" class="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1 shadow-md transition">
              <span>WhatsApp</span>
            </a>
            <a href="${c.sms_link}" class="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold flex items-center gap-1 shadow-md transition">
              <span>SMS</span>
            </a>
          </div>
        </div>
      `).join('');
    }

    // Update risk gauge to 100
    if (window.RiskGauge) {
      window.RiskGauge.update({
        risk_score: 100,
        risk_level: 'HIGH RISK',
        factors: [{
          title: 'EMERGENCY SOS BROADCAST ACTIVE',
          description: 'Emergency response protocol triggered. Contacts notified.',
          severity: 'critical',
          points: 100,
          icon: 'shield-alert'
        }],
        explanation: 'EMERGENCY: SOS protocol active. Coordinates shared with trusted contacts.',
        recommended_action: 'Stay in a visible public area and await trusted contact or security.',
        action_type: 'sos_active'
      });
    }
  },

  openDisarmModal() {
    const modal = document.getElementById('sos-disarm-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  },

  closeDisarmModal() {
    const modal = document.getElementById('sos-disarm-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  },

  async confirmDisarm() {
    const pinInput = document.getElementById('sos-disarm-pin');
    const pin = pinInput ? pinInput.value.trim() : '';

    try {
      const resp = await API.resolveSOS(pin);
      if (resp.status === 'success') {
        this.closeDisarmModal();
        if (pinInput) pinInput.value = '';
        this.clearEmergencyState();
        if (window.VoiceEngine) {
          window.VoiceEngine.stopEmergencySiren();
          window.VoiceEngine.playSuccessChime();
          window.VoiceEngine.speak("Emergency SOS resolved. Returning to safe monitoring.");
        }
        if (window.App) {
          await window.App.syncJourneyState();
        }
      }
    } catch (e) {
      alert("Invalid Safety PIN. Default demo PIN is 1234.");
    }
  },

  clearEmergencyState() {
    this.isSOSActive = false;
    const screen = document.getElementById('sos-active-screen');
    if (screen) {
      screen.classList.add('hidden');
      screen.classList.remove('flex');
    }
    document.body.classList.remove('emergency-strobe-active');
    if (window.VoiceEngine) {
      window.VoiceEngine.stopEmergencySiren();
    }
  }
};
