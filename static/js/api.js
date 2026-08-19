/**
 * SafeRoute AI — API Client Layer
 * Handles communication with Flask REST Backend
 */

const API = {
  async get(endpoint) {
    try {
      const response = await fetch(endpoint);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (err) {
      console.error(`[API GET ${endpoint}] Error:`, err);
      throw err;
    }
  },

  async post(endpoint, body = {}) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (err) {
      console.error(`[API POST ${endpoint}] Error:`, err);
      throw err;
    }
  },

  async put(endpoint, body = {}) {
    try {
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (err) {
      console.error(`[API PUT ${endpoint}] Error:`, err);
      throw err;
    }
  },

  async delete(endpoint) {
    try {
      const response = await fetch(endpoint, { method: 'DELETE' });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (err) {
      console.error(`[API DELETE ${endpoint}] Error:`, err);
      throw err;
    }
  },

  // Configuration
  getConfig() {
    return this.get('/api/config');
  },

  // Profile & Contacts
  getProfile() {
    return this.get('/api/profile');
  },

  updateProfile(data) {
    return this.put('/api/profile', data);
  },

  addContact(contact) {
    return this.post('/api/contacts', contact);
  },

  updateContact(id, contact) {
    return this.put(`/api/contacts/${id}`, contact);
  },

  deleteContact(id) {
    return this.delete(`/api/contacts/${id}`);
  },

  // Journey
  getActiveJourney() {
    return this.get('/api/journey/active');
  },

  startJourney(journeyData) {
    return this.post('/api/journey/start', journeyData);
  },

  updateLocation(updateData) {
    return this.post('/api/journey/update-location', updateData);
  },

  checkin(journeyId, clearEmergency = false) {
    return this.post('/api/journey/checkin', { journey_id: journeyId, clear_emergency: clearEmergency });
  },

  reportMissedCheckin(journeyId) {
    return this.post('/api/journey/missed-checkin', { journey_id: journeyId });
  },

  endJourney(journeyId, status = 'completed') {
    return this.post('/api/journey/end', { journey_id: journeyId, status });
  },

  // SOS Emergency
  triggerSOS(lat, lng, source = 'manual_sos') {
    return this.post('/api/sos', { lat, lng, trigger_source: source });
  },

  resolveSOS(pin) {
    return this.post('/api/sos/resolve', { pin });
  },

  // Safety Reports
  getReports() {
    return this.get('/api/reports');
  },

  createReport(reportData) {
    return this.post('/api/reports', reportData);
  },

  upvoteReport(id) {
    return this.post(`/api/reports/${id}/upvote`);
  },

  // Standalone Risk Engine
  evaluateRisk(evalPayload) {
    return this.post('/api/risk/evaluate', evalPayload);
  },

  // Demo Reset
  resetDemo() {
    return this.post('/api/demo/reset');
  }
};
