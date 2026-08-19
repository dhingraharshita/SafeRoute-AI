import unittest
import json
import os
from app import app, db, risk_engine
from models import UserProfile, EmergencyContact, Journey, SafetyReport, EmergencyEvent

class SafeRouteAITestCase(unittest.TestCase):
    def setUp(self):
        app.config['TESTING'] = True
        app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
        self.client = app.test_client()
        with app.app_context():
            db.create_all()
            # Seed base profile
            p = UserProfile(name="Tester", email="test@test.com", phone="+15550001", checkin_interval_mins=5)
            db.session.add(p)
            db.session.commit()

            c = EmergencyContact(user_id=p.id, name="Test Contact", phone="+15559999", is_primary=True)
            db.session.add(c)
            db.session.commit()

    def tearDown(self):
        with app.app_context():
            db.session.remove()
            db.drop_all()

    # -------------------------------------------------------------
    # 1. AI Risk Engine Unit Tests
    # -------------------------------------------------------------
    def test_risk_engine_baseline_safe(self):
        """A normal on-route journey during daytime with full battery should be SAFE."""
        assessment = risk_engine.evaluate_risk({
            "current_lat": 37.7749,
            "current_lng": -122.4194,
            "planned_route": [[37.7749, -122.4194], [37.7780, -122.4150]],
            "stopped_duration_seconds": 0,
            "is_night": False,
            "missed_checkins_count": 0,
            "battery_level": 90
        })
        self.assertEqual(assessment['risk_level'], 'SAFE')
        self.assertLess(assessment['risk_score'], 31)
        self.assertIn("smoothly", assessment['explanation'])
        self.assertEqual(assessment['action_type'], 'continue')

    def test_risk_engine_route_deviation(self):
        """Significant deviation should elevate risk to CAUTION or HIGH RISK."""
        assessment = risk_engine.evaluate_risk({
            "current_lat": 37.7749,
            "current_lng": -122.4194,
            "route_deviation_meters": 150,
            "stopped_duration_seconds": 0,
            "is_night": False,
            "missed_checkins_count": 0
        })
        self.assertIn(assessment['risk_level'], ['CAUTION', 'HIGH RISK'])
        self.assertGreater(assessment['risk_score'], 30)
        self.assertTrue(any(f['category'] == 'deviation' for f in assessment['factors']))
        self.assertIn("deviated", assessment['explanation'])

    def test_risk_engine_compound_risk(self):
        """Multiple concurrent risk signals should trigger compound multiplier."""
        assessment = risk_engine.evaluate_risk({
            "current_lat": 37.7749,
            "current_lng": -122.4194,
            "route_deviation_meters": 120,
            "stopped_duration_seconds": 200,
            "is_night": True,
            "missed_checkins_count": 1,
            "nearby_hazards": [{"title": "Dark Alley", "severity": "high", "distance_meters": 50}]
        })
        self.assertEqual(assessment['risk_level'], 'HIGH RISK')
        self.assertGreaterEqual(assessment['risk_score'], 70)
        self.assertGreaterEqual(len(assessment['factors']), 3)

    def test_risk_engine_emergency_sos(self):
        """Active SOS must set risk to 100 and HIGH RISK."""
        assessment = risk_engine.evaluate_risk({
            "is_sos_active": True
        })
        self.assertEqual(assessment['risk_score'], 100)
        self.assertEqual(assessment['risk_level'], 'HIGH RISK')
        self.assertEqual(assessment['status_code'], 'SOS_ACTIVE')

    # -------------------------------------------------------------
    # 2. REST API Integration Tests
    # -------------------------------------------------------------
    def test_api_config(self):
        resp = self.client.get('/api/config')
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data['status'], 'success')
        self.assertIn('preset_destinations', data)
        self.assertIn('safe_havens', data)

    def test_profile_and_contacts_crud(self):
        # GET profile
        resp = self.client.get('/api/profile')
        self.assertEqual(resp.status_code, 200)
        p_data = resp.get_json()['profile']
        self.assertEqual(p_data['name'], 'Tester')
        self.assertEqual(len(p_data['contacts']), 1)

        # Update profile
        resp = self.client.put('/api/profile', json={'name': 'Jane Doe', 'battery_level': 75})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json()['profile']['name'], 'Jane Doe')

        # Add contact
        resp = self.client.post('/api/contacts', json={
            'name': 'Bob Smith',
            'relationship': 'Brother',
            'phone': '+15554321',
            'is_primary': False
        })
        self.assertEqual(resp.status_code, 201)
        contact_id = resp.get_json()['contact']['id']

        # Delete contact
        del_resp = self.client.delete(f'/api/contacts/{contact_id}')
        self.assertEqual(del_resp.status_code, 200)

    def test_journey_lifecycle_and_checkin(self):
        # Start journey
        start_payload = {
            "start_lat": 37.7749,
            "start_lng": -122.4194,
            "dest_lat": 37.7840,
            "dest_lng": -122.4085,
            "dest_address": "Campus Dorm",
            "planned_route": [[37.7749, -122.4194], [37.7840, -122.4085]]
        }
        resp = self.client.post('/api/journey/start', json=start_payload)
        self.assertEqual(resp.status_code, 201)
        journey = resp.get_json()['journey']
        journey_id = journey['id']
        self.assertEqual(journey['status'], 'active')

        # Update location with deviation
        upd_resp = self.client.post('/api/journey/update-location', json={
            "journey_id": journey_id,
            "lat": 37.7790,
            "lng": -122.4110,
            "route_deviation_meters": 100
        })
        self.assertEqual(upd_resp.status_code, 200)
        upd_data = upd_resp.get_json()
        self.assertGreater(upd_data['assessment']['risk_score'], 30)

        # Checkin "I'm Safe"
        chk_resp = self.client.post('/api/journey/checkin', json={"journey_id": journey_id})
        self.assertEqual(chk_resp.status_code, 200)

        # End journey
        end_resp = self.client.post('/api/journey/end', json={"journey_id": journey_id, "status": "completed"})
        self.assertEqual(end_resp.status_code, 200)
        self.assertEqual(end_resp.get_json()['journey']['status'], 'completed')

    def test_emergency_sos_flow(self):
        # Trigger SOS
        resp = self.client.post('/api/sos', json={"lat": 37.7750, "lng": -122.4190, "trigger_source": "manual_sos"})
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIn("maps_url", data)
        self.assertTrue(len(data['contacts_notified']) > 0)
        self.assertIn("whatsapp_link", data['contacts_notified'][0])

        # Resolve SOS with valid PIN
        res_resp = self.client.post('/api/sos/resolve', json={"pin": "1234"})
        self.assertEqual(res_resp.status_code, 200)

    def test_community_safety_reports(self):
        # Create report
        resp = self.client.post('/api/reports', json={
            "category": "poor_lighting",
            "title": "Dark Street Underpass",
            "description": "Lights broken under the bridge",
            "severity": "high",
            "lat": 37.7780,
            "lng": -122.4160
        })
        self.assertEqual(resp.status_code, 201)
        rep_id = resp.get_json()['report']['id']

        # Upvote report
        up_resp = self.client.post(f'/api/reports/{rep_id}/upvote')
        self.assertEqual(up_resp.status_code, 200)
        self.assertEqual(up_resp.get_json()['report']['upvotes'], 2)

        # List reports
        list_resp = self.client.get('/api/reports')
        self.assertEqual(list_resp.status_code, 200)
        self.assertGreaterEqual(list_resp.get_json()['count'], 1)

if __name__ == '__main__':
    unittest.main()
