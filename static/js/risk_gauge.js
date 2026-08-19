/**
 * SafeRoute AI — Radial Risk Gauge & AI Visualization
 * Renders animated 0-100 safety score, contributing factors,
 * and AI-generated explanations.
 */

const RiskGauge = {
  currentScore: 12,
  targetScore: 12,
  animationFrameId: null,
  history: [12],

  init() {
    this.renderGauge(12, 'SAFE');
  },

  update(assessment) {
    if (!assessment) return;

    const newScore = assessment.risk_score;
    const level = assessment.risk_level;
    const factors = assessment.factors || [];
    const explanation = assessment.explanation || '';
    const recommendedAction = assessment.recommended_action || '';
    const actionType = assessment.action_type || 'continue';

    this.animateScore(newScore, level);
    this.renderFactors(factors);
    this.renderAIExplanation(level, newScore, explanation, recommendedAction, actionType, assessment.is_llm_generated);
    this.recordHistory(newScore);
  },

  animateScore(target, level) {
    this.targetScore = target;
    const startScore = this.currentScore;
    const startTime = performance.now();
    const duration = 650; // ms

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const interpolated = Math.round(startScore + (target - startScore) * ease);

      this.currentScore = interpolated;
      this.renderGauge(this.currentScore, level);

      if (progress < 1) {
        this.animationFrameId = requestAnimationFrame(animate);
      } else {
        this.currentScore = target;
        this.renderGauge(target, level);
      }
    };

    this.animationFrameId = requestAnimationFrame(animate);
  },

  renderGauge(score, level) {
    const scoreEl = document.getElementById('risk-score-display');
    const levelBadge = document.getElementById('risk-level-badge');
    const circleProgress = document.getElementById('gauge-progress-circle');
    const gaugeContainer = document.getElementById('risk-gauge-container');

    if (!scoreEl || !circleProgress) return;

    scoreEl.textContent = score;

    // Radius = 68, circumference = 2 * PI * 68 ≈ 427.25
    const circumference = 427.25;
    const offset = circumference - (score / 100) * circumference;
    circleProgress.style.strokeDashoffset = offset;

    // Color theme based on level
    let strokeColor = '#10b981'; // green
    let glowClass = 'glow-safe';
    let badgeBg = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
    let ringGlow = 'rgba(16, 185, 129, 0.4)';

    if (level === 'HIGH RISK' || score >= 70) {
      strokeColor = '#f43f5e';
      glowClass = 'glow-danger';
      badgeBg = 'bg-rose-500/20 text-rose-400 border-rose-500/50 animate-pulse';
      ringGlow = 'rgba(244, 63, 94, 0.55)';
    } else if (level === 'CAUTION' || score >= 31) {
      strokeColor = '#f59e0b';
      glowClass = 'glow-caution';
      badgeBg = 'bg-amber-500/20 text-amber-400 border-amber-500/40';
      ringGlow = 'rgba(245, 158, 11, 0.4)';
    }

    circleProgress.style.stroke = strokeColor;
    circleProgress.style.filter = `drop-shadow(0 0 8px ${ringGlow})`;

    if (levelBadge) {
      levelBadge.textContent = level;
      levelBadge.className = `px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase border transition-all duration-300 ${badgeBg}`;
    }

    if (gaugeContainer) {
      gaugeContainer.className = `relative flex flex-col items-center justify-center p-6 rounded-2xl glass-panel transition-all duration-500 ${glowClass}`;
    }
  },

  renderFactors(factors) {
    const listEl = document.getElementById('risk-factors-list');
    const emptyEl = document.getElementById('risk-factors-empty');
    if (!listEl) return;

    if (!factors || factors.length === 0) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');

    listEl.innerHTML = factors.map(f => {
      let badgeColor = 'bg-slate-800/80 text-slate-300 border-slate-700';
      let iconColor = 'text-cyan-400';

      if (f.severity === 'critical') {
        badgeColor = 'bg-rose-950/60 text-rose-300 border-rose-700/60';
        iconColor = 'text-rose-400';
      } else if (f.severity === 'high') {
        badgeColor = 'bg-amber-950/60 text-amber-300 border-amber-700/60';
        iconColor = 'text-amber-400';
      } else if (f.severity === 'medium') {
        badgeColor = 'bg-yellow-950/40 text-yellow-300 border-yellow-700/40';
        iconColor = 'text-yellow-400';
      }

      return `
        <div class="factor-chip flex items-start justify-between gap-3 p-3 rounded-xl border ${badgeColor} backdrop-blur-md">
          <div class="flex items-start gap-2.5">
            <div class="p-1.5 rounded-lg bg-slate-900/60 ${iconColor} mt-0.5">
              <i data-lucide="${f.icon || 'alert-triangle'}" class="w-4 h-4"></i>
            </div>
            <div>
              <div class="text-xs font-bold text-slate-200">${f.title}</div>
              <div class="text-[11px] text-slate-400 mt-0.5 leading-snug">${f.description}</div>
            </div>
          </div>
          <div class="shrink-0 text-right">
            <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-900/80 ${iconColor} border border-slate-700">
              +${f.points}
            </span>
          </div>
        </div>
      `;
    }).join('');

    // Re-initialize Lucide icons in newly rendered chips
    if (window.lucide) {
      window.lucide.createIcons();
    }
  },

  renderAIExplanation(level, score, explanation, action, actionType, isLLM) {
    const explText = document.getElementById('ai-explanation-text');
    const actText = document.getElementById('ai-recommended-action-text');
    const llmBadge = document.getElementById('ai-llm-badge');
    const actionBtn = document.getElementById('ai-action-button');

    if (explText) {
      explText.textContent = explanation;
    }

    if (actText) {
      actText.textContent = action;
    }

    if (llmBadge) {
      if (isLLM) {
        llmBadge.classList.remove('hidden');
      } else {
        llmBadge.classList.add('hidden');
      }
    }

    if (actionBtn) {
      if (actionType === 'continue') {
        actionBtn.textContent = 'Route Nominal';
        actionBtn.className = 'w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 cursor-default flex items-center justify-center gap-2';
        actionBtn.onclick = null;
      } else if (actionType === 'checkin' || actionType === 'checkin_or_sos') {
        actionBtn.innerHTML = '<i data-lucide="shield-check" class="w-4 h-4"></i> Tap to Check In (I\'m Safe)';
        actionBtn.className = 'w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-900/40 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer';
        actionBtn.onclick = () => window.App && window.App.handleCheckin();
      } else if (actionType === 'return_route') {
        actionBtn.innerHTML = '<i data-lucide="navigation" class="w-4 h-4"></i> Re-Center on Planned Path';
        actionBtn.className = 'w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg shadow-amber-900/40 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer';
        actionBtn.onclick = () => window.MapManager && window.MapManager.recenterRoute();
      } else if (actionType === 'prepare_sos') {
        actionBtn.innerHTML = '<i data-lucide="alert-octagon" class="w-4 h-4"></i> Open Emergency SOS Console';
        actionBtn.className = 'w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-lg shadow-rose-900/40 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer';
        actionBtn.onclick = () => window.SOSManager && window.SOSManager.openSOSModal();
      } else {
        actionBtn.innerHTML = '<i data-lucide="shield" class="w-4 h-4"></i> Acknowledge Guidance';
        actionBtn.className = 'w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 transition-all flex items-center justify-center gap-2 cursor-pointer';
        actionBtn.onclick = null;
      }
    }

    if (window.lucide) {
      window.lucide.createIcons();
    }
  },

  recordHistory(score) {
    this.history.push(score);
    if (this.history.length > 25) {
      this.history.shift();
    }
    this.drawSparkline();
  },

  drawSparkline() {
    const canvas = document.getElementById('risk-sparkline-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;

    ctx.clearRect(0, 0, width, height);

    if (this.history.length < 2) return;

    const step = width / (this.history.length - 1);
    ctx.beginPath();
    ctx.lineWidth = 2.5;

    // Color gradient
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    const lastScore = this.history[this.history.length - 1];
    if (lastScore >= 70) {
      ctx.strokeStyle = '#f43f5e';
    } else if (lastScore >= 31) {
      ctx.strokeStyle = '#f59e0b';
    } else {
      ctx.strokeStyle = '#10b981';
    }

    this.history.forEach((val, i) => {
      const x = i * step;
      // 0 at bottom, 100 at top
      const y = height - (val / 100) * (height - 8) - 4;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Fill area under curve
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    const fillGrad = ctx.createLinearGradient(0, 0, 0, height);
    fillGrad.addColorStop(0, lastScore >= 70 ? 'rgba(244,63,94,0.3)' : (lastScore >= 31 ? 'rgba(245,158,11,0.25)' : 'rgba(16,185,129,0.25)'));
    fillGrad.addColorStop(1, 'rgba(15,23,42,0)');
    ctx.fillStyle = fillGrad;
    ctx.fill();
  }
};
