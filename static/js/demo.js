/**
 * SafeRoute AI — Hackathon Demo & Simulation Suite
 * Enables judges and presenters to walk through all 5 core safety states
 * (Detect -> Assess -> Explain -> Assist -> Escalate)
 * using the REAL risk engine and transparent mathematical models.
 */

const DemoSimulator = {
  activeScenario: 'baseline',

  init() {
    this.bindControls();
  },

  bindControls() {
    // Sliders & inputs
    const devSlider = document.getElementById('demo-deviation-slider');
    const stopSlider = document.getElementById('demo-stop-slider');
    const devVal = document.getElementById('demo-deviation-val');
    const stopVal = document.getElementById('demo-stop-val');

    if (devSlider && devVal) {
      devSlider.addEventListener('input', (e) => {
        devVal.textContent = `${e.target.value}m`;
        this.runCustomSimulation();
      });
    }

    if (stopSlider && stopVal) {
      stopSlider.addEventListener('input', (e) => {
        stopVal.textContent = `${e.target.value}s`;
        this.runCustomSimulation();
      });
    }

    const nightToggle = document.getElementById('demo-night-toggle');
    const hazardToggle = document.getElementById('demo-hazard-toggle');
    const missedSelect = document.getElementById('demo-missed-select');
    const batteryToggle = document.getElementById('demo-battery-toggle');

    [nightToggle, hazardToggle, missedSelect, batteryToggle].forEach(el => {
      if (el) {
        el.addEventListener('change', () => this.runCustomSimulation());
      }
    });
  },

  // 1-CLICK DEMO SCENARIOS
  async runScenario(scenarioKey) {
    this.activeScenario = scenarioKey;
    console.log(`[DemoSimulator] Running Scenario: ${scenarioKey}`);

    // Ensure journey is active
    if (!window.App || !window.App.activeJourney) {
      await window.App.startPresetJourney(0);
    }

    const devSlider = document.getElementById('demo-deviation-slider');
    const stopSlider = document.getElementById('demo-stop-slider');
    const nightToggle = document.getElementById('demo-night-toggle');
    const hazardToggle = document.getElementById('demo-hazard-toggle');
    const missedSelect = document.getElementById('demo-missed-select');
    const batteryToggle = document.getElementById('demo-battery-toggle');

    if (scenarioKey === 'safe') {
      // 1. Normal Walk (Score ~15)
      if (devSlider) devSlider.value = 0;
      if (stopSlider) stopSlider.value = 0;
      if (nightToggle) nightToggle.checked = false;
      if (hazardToggle) hazardToggle.checked = false;
      if (missedSelect) missedSelect.value = 0;
      if (batteryToggle) batteryToggle.checked = false;

      // Move marker along planned route
      const pt = [37.7769, -122.4168];
      window.MapManager && window.MapManager.updateUserLocation(pt[0], pt[1], true);

      await this.evaluateAndRender({
        route_deviation_meters: 10,
        stopped_duration_seconds: 0,
        is_night: false,
        missed_checkins_count: 0,
        nearby_hazards: [],
        battery_level: 88
      });

      if (window.VoiceEngine) {
        window.VoiceEngine.stopEmergencySiren();
        window.VoiceEngine.playSuccessChime();
        window.VoiceEngine.speak("Safe route active. All metrics nominal.");
      }

    } else if (scenarioKey === 'deviation') {
      // 2. Off-Route Deviation (Score ~45, Caution)
      if (devSlider) devSlider.value = 110;
      if (stopSlider) stopSlider.value = 0;
      if (nightToggle) nightToggle.checked = false;
      if (hazardToggle) hazardToggle.checked = false;
      if (missedSelect) missedSelect.value = 0;

      // Shift location to side alley
      const pt = [37.7780, -122.4180];
      window.MapManager && window.MapManager.updateUserLocation(pt[0], pt[1], true);

      await this.evaluateAndRender({
        route_deviation_meters: 110,
        stopped_duration_seconds: 0,
        is_night: false,
        missed_checkins_count: 0,
        nearby_hazards: [],
        battery_level: 80
      });

      if (window.VoiceEngine) {
        window.VoiceEngine.playWarningChime();
        window.VoiceEngine.speak("Caution: 110-meter route deviation detected. SafeRoute AI suggests returning to designated corridor.");
      }

    } else if (scenarioKey === 'stop_night') {
      // 3. Stop + Night Time (Score ~64, Caution/Approaching High)
      if (devSlider) devSlider.value = 95;
      if (stopSlider) stopSlider.value = 190;
      if (nightToggle) nightToggle.checked = true;
      if (hazardToggle) hazardToggle.checked = false;
      if (missedSelect) missedSelect.value = 0;

      const pt = [37.7790, -122.4160];
      window.MapManager && window.MapManager.updateUserLocation(pt[0], pt[1], true);

      await this.evaluateAndRender({
        route_deviation_meters: 95,
        stopped_duration_seconds: 190,
        is_night: true,
        missed_checkins_count: 0,
        nearby_hazards: [],
        battery_level: 70
      });

      if (window.VoiceEngine) {
        window.VoiceEngine.playWarningChime();
        window.VoiceEngine.speak("Warning: Extended stationary pause detected during late night hours.");
      }

    } else if (scenarioKey === 'missed_hazard') {
      // 4. Missed Check-in + Nearby Incident (Score ~84, High Risk)
      if (devSlider) devSlider.value = 140;
      if (stopSlider) stopSlider.value = 200;
      if (nightToggle) nightToggle.checked = true;
      if (hazardToggle) hazardToggle.checked = true;
      if (missedSelect) missedSelect.value = 1;

      const pt = [37.7802, -122.4158]; // near harassment hotspot
      window.MapManager && window.MapManager.updateUserLocation(pt[0], pt[1], true);

      await this.evaluateAndRender({
        route_deviation_meters: 140,
        stopped_duration_seconds: 200,
        is_night: true,
        missed_checkins_count: 1,
        nearby_hazards: [{
          title: "Recent Verbal Harassment Hotspot",
          severity: "high",
          distance_meters: 45
        }],
        battery_level: 45
      });

      if (window.VoiceEngine) {
        window.VoiceEngine.playWarningChime();
        window.VoiceEngine.speak("High Risk Alert: Missed safety check-in in proximity to verified hazard zone. Prepare escalation.");
      }

    } else if (scenarioKey === 'sos') {
      // 5. Emergency SOS Trigger (Score 100)
      if (window.SOSManager) {
        window.SOSManager.triggerEmergencySOS('demo_simulation');
      }
    }

    this.syncUIValues();
  },

  async runCustomSimulation() {
    const devSlider = document.getElementById('demo-deviation-slider');
    const stopSlider = document.getElementById('demo-stop-slider');
    const nightToggle = document.getElementById('demo-night-toggle');
    const hazardToggle = document.getElementById('demo-hazard-toggle');
    const missedSelect = document.getElementById('demo-missed-select');
    const batteryToggle = document.getElementById('demo-battery-toggle');

    const dev = devSlider ? parseInt(devSlider.value) : 0;
    const stop = stopSlider ? parseInt(stopSlider.value) : 0;
    const night = nightToggle ? nightToggle.checked : false;
    const hazard = hazardToggle ? hazardToggle.checked : false;
    const missed = missedSelect ? parseInt(missedSelect.value) : 0;
    const battery = (batteryToggle && batteryToggle.checked) ? 10 : 85;

    const hazards = hazard ? [{
      title: "Poor Lighting & Dark Alley",
      severity: "high",
      distance_meters: 60
    }] : [];

    await this.evaluateAndRender({
      route_deviation_meters: dev,
      stopped_duration_seconds: stop,
      is_night: night,
      missed_checkins_count: missed,
      nearby_hazards: hazards,
      battery_level: battery
    });
  },

  async evaluateAndRender(payload) {
    // Include current position
    payload.current_lat = window.MapManager ? window.MapManager.currentLat : 37.7749;
    payload.current_lng = window.MapManager ? window.MapManager.currentLng : -122.4194;
    payload.planned_route = window.App && window.App.activeJourney ? window.App.activeJourney.planned_route : [];

    try {
      // Call real risk engine endpoint
      const resp = await API.evaluateRisk(payload);
      if (resp.status === 'success' && resp.assessment) {
        const assessment = resp.assessment;

        // Render on Gauge
        if (window.RiskGauge) {
          window.RiskGauge.update(assessment);
        }

        // Update map actual path styling
        if (window.MapManager && window.App && window.App.activeJourney) {
          const path = window.App.activeJourney.actual_path || [[payload.current_lat, payload.current_lng]];
          window.MapManager.drawActualPath(path, assessment.risk_level);
        }
      }
    } catch (e) {
      console.error('[DemoSimulator] Error evaluating risk:', e);
    }
  },

  syncUIValues() {
    const devSlider = document.getElementById('demo-deviation-slider');
    const stopSlider = document.getElementById('demo-stop-slider');
    const devVal = document.getElementById('demo-deviation-val');
    const stopVal = document.getElementById('demo-stop-val');

    if (devSlider && devVal) devVal.textContent = `${devSlider.value}m`;
    if (stopSlider && stopVal) stopVal.textContent = `${stopSlider.value}s`;
  },

  async resetDemo() {
    console.log('[DemoSimulator] Resetting Demo state...');
    try {
      await API.resetDemo();
      if (window.SOSManager) {
        window.SOSManager.clearEmergencyState();
      }
      if (window.CheckinManager) {
        window.CheckinManager.stopTimer();
      }
      if (window.App) {
        await window.App.loadInitialData();
      }
      this.runScenario('safe');
      alert("Demo state reset to pristine baseline.");
    } catch (e) {
      console.error('Error resetting demo:', e);
    }
  }
};
