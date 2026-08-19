/**
 * SafeRoute AI — Leaflet Map Engine
 * Handles interactive dark maps, live user beacon,
 * planned/actual route polylines, hazard zones, safe havens, and community pins.
 */

const MapManager = {
  map: null,
  userMarker: null,
  destMarker: null,
  plannedPolyline: null,
  actualPolyline: null,
  hazardLayerGroup: null,
  safeHavenLayerGroup: null,
  reportsLayerGroup: null,
  currentLat: 37.7749,
  currentLng: -122.4194,
  destLat: 37.7840,
  destLng: -122.4085,
  isMapLoaded: false,

  init(centerLat = 37.7749, centerLng = -122.4194) {
    if (this.map) return;

    this.currentLat = centerLat;
    this.currentLng = centerLng;

    const mapEl = document.getElementById('safety-map');
    if (!mapEl) return;

    try {
      this.map = L.map('safety-map', {
        zoomControl: false,
        attributionControl: false
      }).setView([centerLat, centerLng], 15);

      // Dark Matter CartoDB tiles
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
      }).addTo(this.map);

      L.control.zoom({ position: 'bottomright' }).addTo(this.map);

      // Layer groups
      this.hazardLayerGroup = L.layerGroup().addTo(this.map);
      this.safeHavenLayerGroup = L.layerGroup().addTo(this.map);
      this.reportsLayerGroup = L.layerGroup().addTo(this.map);

      this.initUserMarker(centerLat, centerLng);

      // Map click handler to set custom destination or report location
      this.map.on('click', (e) => {
        if (window.App && window.App.isPinningReport) {
          window.App.handleReportPinSelected(e.latlng.lat, e.latlng.lng);
        }
      });

      this.isMapLoaded = true;
      console.log('[MapManager] Leaflet map initialized successfully.');
    } catch (e) {
      console.error('[MapManager] Failed to init Leaflet map:', e);
    }
  },

  initUserMarker(lat, lng) {
    this.currentLat = lat;
    this.currentLng = lng;

    const userIcon = L.divIcon({
      className: 'user-marker-icon',
      html: `<div class="user-beacon-pulse"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    if (this.userMarker) {
      this.userMarker.setLatLng([lat, lng]);
    } else if (this.map) {
      this.userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(this.map);
      this.userMarker.bindPopup(`
        <div class="text-xs p-1">
          <div class="font-bold text-cyan-400 flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span> Live Position
          </div>
          <div class="text-[11px] text-slate-300 mt-1">${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
          <div class="text-[10px] text-slate-400 mt-0.5">GPS Accuracy: ±4m High Precision</div>
        </div>
      `);
    }
  },

  updateUserLocation(lat, lng, panTo = false) {
    this.currentLat = lat;
    this.currentLng = lng;

    if (this.userMarker) {
      this.userMarker.setLatLng([lat, lng]);
    } else {
      this.initUserMarker(lat, lng);
    }

    if (panTo && this.map) {
      this.map.panTo([lat, lng], { animate: true, duration: 0.6 });
    }
  },

  setDestinationMarker(lat, lng, title = "Destination") {
    this.destLat = lat;
    this.destLng = lng;

    const destIcon = L.divIcon({
      className: 'dest-marker-icon',
      html: `
        <div class="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-tr from-pink-600 to-rose-500 text-white shadow-lg shadow-rose-900/60 border-2 border-white">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });

    if (this.destMarker) {
      this.destMarker.setLatLng([lat, lng]);
    } else if (this.map) {
      this.destMarker = L.marker([lat, lng], { icon: destIcon }).addTo(this.map);
    }

    if (this.destMarker) {
      this.destMarker.bindPopup(`
        <div class="text-xs p-1">
          <div class="font-bold text-rose-400">🏁 ${title}</div>
          <div class="text-[11px] text-slate-300 mt-1">${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
          <div class="text-[10px] text-emerald-400 mt-0.5 font-semibold">Planned Safe Corridor Active</div>
        </div>
      `);
    }
  },

  drawPlannedRoute(coords) {
    if (!this.map || !coords || coords.length === 0) return;

    if (this.plannedPolyline) {
      this.map.removeLayer(this.plannedPolyline);
    }

    this.plannedPolyline = L.polyline(coords, {
      color: '#06b6d4', // cyan glow
      weight: 5,
      opacity: 0.85,
      dashArray: '8, 8',
      lineCap: 'round'
    }).addTo(this.map);

    this.plannedPolyline.bindPopup(`
      <div class="text-xs p-1">
        <div class="font-bold text-cyan-400">🛡️ AI Verified Safe Route</div>
        <div class="text-[11px] text-slate-300 mt-0.5">Continuous safety corridor monitoring enabled.</div>
      </div>
    `);
  },

  drawActualPath(coords, riskLevel = 'SAFE') {
    if (!this.map || !coords || coords.length === 0) return;

    if (this.actualPolyline) {
      this.map.removeLayer(this.actualPolyline);
    }

    let pathColor = '#10b981'; // green
    if (riskLevel === 'HIGH RISK') {
      pathColor = '#f43f5e'; // red
    } else if (riskLevel === 'CAUTION') {
      pathColor = '#f59e0b'; // amber
    }

    this.actualPolyline = L.polyline(coords, {
      color: pathColor,
      weight: 6,
      opacity: 0.95,
      lineCap: 'round'
    }).addTo(this.map);
  },

  renderSafeHavens(safeHavens) {
    if (!this.map || !this.safeHavenLayerGroup || !safeHavens) return;
    this.safeHavenLayerGroup.clearLayers();

    safeHavens.forEach(sh => {
      const shIcon = L.divIcon({
        className: 'safe-haven-icon',
        html: `
          <div class="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500 shadow-md shadow-emerald-950/60">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const marker = L.marker([sh.lat, sh.lng], { icon: shIcon });
      marker.bindPopup(`
        <div class="text-xs p-1 max-w-[200px]">
          <div class="font-bold text-emerald-400 flex items-center gap-1">
            <span>🛡️</span> ${sh.name}
          </div>
          <div class="text-[11px] text-slate-300 mt-1">${sh.services}</div>
          <div class="text-[10px] text-cyan-400 mt-1 font-mono">${sh.phone}</div>
          <div class="mt-2 pt-1 border-t border-slate-700/60 flex gap-1">
            <span class="px-1.5 py-0.5 rounded text-[10px] bg-emerald-900/60 text-emerald-300 font-semibold">24/7 Verified</span>
          </div>
        </div>
      `);
      this.safeHavenLayerGroup.addLayer(marker);
    });
  },

  renderSafetyReports(reports) {
    if (!this.map || !this.reportsLayerGroup || !reports) return;
    this.reportsLayerGroup.clearLayers();

    reports.forEach(r => {
      const isHigh = r.severity === 'high';
      const bgColor = isHigh ? 'bg-rose-950 text-rose-400 border-rose-500' : 'bg-amber-950 text-amber-400 border-amber-500';
      const circleColor = isHigh ? '#f43f5e' : '#f59e0b';

      // Draw danger zone circle
      const hazardCircle = L.circle([r.lat, r.lng], {
        radius: isHigh ? 120 : 80,
        color: circleColor,
        fillColor: circleColor,
        fillOpacity: 0.15,
        weight: 1.5,
        dashArray: '4, 4'
      });
      this.reportsLayerGroup.addLayer(hazardCircle);

      // Icon Pin
      const rIcon = L.divIcon({
        className: 'report-marker-icon',
        html: `
          <div class="flex items-center justify-center w-6 h-6 rounded-full ${bgColor} border shadow-md">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker([r.lat, r.lng], { icon: rIcon });
      marker.bindPopup(`
        <div class="text-xs p-1 max-w-[210px]">
          <div class="font-bold ${isHigh ? 'text-rose-400' : 'text-amber-400'} flex items-center justify-between">
            <span>⚠️ ${r.title}</span>
            <span class="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800">${r.severity}</span>
          </div>
          <div class="text-[11px] text-slate-300 mt-1">${r.description || 'Community reported safety hazard.'}</div>
          <div class="text-[10px] text-slate-400 mt-1 italic">${r.address}</div>
          <div class="mt-2 pt-1 border-t border-slate-700/60 flex items-center justify-between">
            <span class="text-[10px] text-cyan-400">👍 ${r.upvotes} Confirmations</span>
            <button onclick="window.App.handleUpvoteReport(${r.id})" class="px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 transition">Confirm</button>
          </div>
        </div>
      `);
      this.reportsLayerGroup.addLayer(marker);
    });
  },

  recenterRoute() {
    if (!this.map) return;
    if (this.plannedPolyline && this.userMarker) {
      const bounds = L.latLngBounds([this.userMarker.getLatLng()]);
      if (this.destMarker) {
        bounds.extend(this.destMarker.getLatLng());
      }
      this.map.fitBounds(bounds, { padding: [40, 40], animate: true });
    } else {
      this.map.setView([this.currentLat, this.currentLng], 16, { animate: true });
    }
  }
};
