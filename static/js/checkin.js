/**
 * SafeRoute AI — Safety Check-in Engine
 * Manages periodic check-in countdown, missed check-in detection,
 * warning audio alerts, grace periods, and escalation.
 */

const CheckinManager = {
  intervalSeconds: 300, // 5 minutes default
  remainingSeconds: 300,
  timerId: null,
  isGracePeriod: false,
  graceRemainingSeconds: 30,
  graceTimerId: null,
  journeyId: null,

  init(intervalMins = 5, journeyId = null) {
    this.intervalSeconds = intervalMins * 60;
    this.remainingSeconds = this.intervalSeconds;
    this.journeyId = journeyId;
    this.isGracePeriod = false;
    this.graceRemainingSeconds = 30;

    this.stopTimer();
    this.startTimer();
    this.updateUI();
  },

  startTimer() {
    this.stopTimer();
    this.timerId = setInterval(() => {
      if (this.remainingSeconds > 0) {
        this.remainingSeconds--;
        this.updateUI();

        // 30-second gentle heads-up chime
        if (this.remainingSeconds === 30) {
          window.VoiceEngine && window.VoiceEngine.playHeartbeat();
        }
      } else {
        this.handleTimerExpired();
      }
    }, 1000);
  },

  stopTimer() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.graceTimerId) {
      clearInterval(this.graceTimerId);
      this.graceTimerId = null;
    }
  },

  handleTimerExpired() {
    this.stopTimer();
    this.isGracePeriod = true;
    this.graceRemainingSeconds = 30;

    // Play warning sound & voice
    if (window.VoiceEngine) {
      window.VoiceEngine.playWarningChime();
      window.VoiceEngine.speak("Safety check-in expired. Please tap I am Safe within 30 seconds.");
    }

    // Open Missed Check-in Warning Modal
    this.showMissedCheckinModal();

    // Start 30s Grace Countdown
    this.graceTimerId = setInterval(() => {
      this.graceRemainingSeconds--;
      const graceEl = document.getElementById('checkin-grace-countdown');
      if (graceEl) {
        graceEl.textContent = `${this.graceRemainingSeconds}s`;
      }

      if (this.graceRemainingSeconds <= 0) {
        this.handleGracePeriodExpired();
      }
    }, 1000);
  },

  async handleGracePeriodExpired() {
    clearInterval(this.graceTimerId);
    this.graceTimerId = null;
    this.hideMissedCheckinModal();

    console.warn('[CheckinManager] Grace period expired! Escalating to High Risk / SOS.');

    // Report missed check-in to backend
    if (window.App && window.App.activeJourney) {
      try {
        await API.reportMissedCheckin(window.App.activeJourney.id);
        // Force refresh location with missed check-in state
        await window.App.syncJourneyState();
      } catch (e) {
        console.error('Error reporting missed check-in:', e);
      }
    }

    if (window.VoiceEngine) {
      window.VoiceEngine.playEmergencySiren();
      window.VoiceEngine.speak("Critical Safety Warning: Check-in unacknowledged. Escalating risk and preparing emergency alert.");
    }
  },

  async confirmSafe() {
    this.stopTimer();
    this.isGracePeriod = false;
    this.hideMissedCheckinModal();

    if (window.VoiceEngine) {
      window.VoiceEngine.stopEmergencySiren();
      window.VoiceEngine.playSuccessChime();
      window.VoiceEngine.speak("Check-in confirmed. Safe route monitoring resumed.");
    }

    // Call backend API
    try {
      if (window.App && window.App.activeJourney) {
        await API.checkin(window.App.activeJourney.id, true);
        await window.App.syncJourneyState();
      }
    } catch (e) {
      console.error('Error recording checkin:', e);
    }

    // Reset countdown
    this.remainingSeconds = this.intervalSeconds;
    this.startTimer();
    this.updateUI();
  },

  updateUI() {
    const timerDisplay = document.getElementById('checkin-timer-display');
    const timerProgress = document.getElementById('checkin-timer-bar');
    const statusText = document.getElementById('checkin-status-text');

    if (!timerDisplay) return;

    const mins = Math.floor(this.remainingSeconds / 60);
    const secs = this.remainingSeconds % 60;
    const formatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    timerDisplay.textContent = formatted;

    if (timerProgress) {
      const pct = (this.remainingSeconds / this.intervalSeconds) * 100;
      timerProgress.style.width = `${pct}%`;
      if (pct > 50) {
        timerProgress.className = 'h-full bg-emerald-500 rounded-full transition-all duration-300';
      } else if (pct > 20) {
        timerProgress.className = 'h-full bg-amber-500 rounded-full transition-all duration-300';
      } else {
        timerProgress.className = 'h-full bg-rose-500 rounded-full transition-all duration-300 animate-pulse';
      }
    }

    if (statusText) {
      if (this.remainingSeconds > 60) {
        statusText.textContent = 'Active Monitoring';
        statusText.className = 'text-[11px] text-emerald-400 font-semibold flex items-center gap-1';
      } else {
        statusText.textContent = 'Check-in due soon';
        statusText.className = 'text-[11px] text-amber-400 font-semibold flex items-center gap-1 animate-pulse';
      }
    }
  },

  showMissedCheckinModal() {
    const modal = document.getElementById('missed-checkin-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  },

  hideMissedCheckinModal() {
    const modal = document.getElementById('missed-checkin-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }
};
