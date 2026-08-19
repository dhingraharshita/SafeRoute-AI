import urllib.request
import json

BASE_URL = "http://127.0.0.1:5000"

def test_live_suite():
    print("[1] Checking static asset downloads...")
    assets = [
        "/static/css/styles.css",
        "/static/js/api.js",
        "/static/js/app.js",
        "/static/js/risk_gauge.js",
        "/static/js/map.js",
        "/static/js/checkin.js",
        "/static/js/sos.js",
        "/static/js/demo.js",
        "/static/js/voice.js"
    ]
    for asset in assets:
        resp = urllib.request.urlopen(BASE_URL + asset)
        assert resp.status == 200, f"Asset {asset} failed with {resp.status}"
    print("   -> All 9 static asset files downloaded successfully (HTTP 200).")

    print("[2] Testing Profile Endpoint...")
    req = urllib.request.Request(BASE_URL + "/api/profile")
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read().decode('utf-8'))
    assert data['status'] == 'success'
    print(f"   -> Profile fetched: {data['profile']['name']}, Contacts: {len(data['profile']['contacts'])}")

    print("[3] Testing Journey Start...")
    payload = json.dumps({
        "start_lat": 37.7749,
        "start_lng": -122.4194,
        "dest_lat": 37.7840,
        "dest_lng": -122.4085,
        "dest_address": "North Campus Dormitory",
        "planned_route": [[37.7749, -122.4194], [37.7840, -122.4085]]
    }).encode('utf-8')
    req = urllib.request.Request(BASE_URL + "/api/journey/start", data=payload, headers={'Content-Type': 'application/json'})
    resp = urllib.request.urlopen(req)
    jdata = json.loads(resp.read().decode('utf-8'))
    assert resp.status == 201
    journey_id = jdata['journey']['id']
    print(f"   -> Journey started: #{journey_id}, Risk: {jdata['journey']['risk_score']} ({jdata['journey']['risk_level']})")

    print("[4] Testing Live Location Update & AI Risk Evaluation...")
    upd_payload = json.dumps({
        "journey_id": journey_id,
        "lat": 37.7795,
        "lng": -122.4135,
        "route_deviation_meters": 95,
        "stopped_duration_seconds": 120,
        "is_night": True
    }).encode('utf-8')
    req = urllib.request.Request(BASE_URL + "/api/journey/update-location", data=upd_payload, headers={'Content-Type': 'application/json'})
    resp = urllib.request.urlopen(req)
    eval_data = json.loads(resp.read().decode('utf-8'))
    assert eval_data['assessment']['risk_score'] > 30
    print(f"   -> Risk evaluated: {eval_data['assessment']['risk_score']} ({eval_data['assessment']['risk_level']})")
    print(f"   -> Explanation: {eval_data['assessment']['explanation']}")
    print(f"   -> Recommended Action: {eval_data['assessment']['recommended_action']}")

    print("[5] Testing Check-in Heartbeat...")
    chk_payload = json.dumps({"journey_id": journey_id}).encode('utf-8')
    req = urllib.request.Request(BASE_URL + "/api/journey/checkin", data=chk_payload, headers={'Content-Type': 'application/json'})
    resp = urllib.request.urlopen(req)
    chk_data = json.loads(resp.read().decode('utf-8'))
    assert chk_data['status'] == 'success'
    print("   -> Check-in successful.")

    print("[6] Testing Community Hazard Report Submission...")
    rep_payload = json.dumps({
        "category": "poor_lighting",
        "title": "Alley Streetlight Blown Out",
        "description": "Pitch black corridor after 8 PM",
        "severity": "medium",
        "lat": 37.7770,
        "lng": -122.4150,
        "address": "4th & Harrison"
    }).encode('utf-8')
    req = urllib.request.Request(BASE_URL + "/api/reports", data=rep_payload, headers={'Content-Type': 'application/json'})
    resp = urllib.request.urlopen(req)
    rep_data = json.loads(resp.read().decode('utf-8'))
    assert resp.status == 201
    print(f"   -> Report submitted: #{rep_data['report']['id']} - {rep_data['report']['title']}")

    print("[7] Testing Emergency SOS Flow & SMS/WhatsApp payload generation...")
    sos_payload = json.dumps({"lat": 37.7780, "lng": -122.4160, "trigger_source": "manual_sos"}).encode('utf-8')
    req = urllib.request.Request(BASE_URL + "/api/sos", data=sos_payload, headers={'Content-Type': 'application/json'})
    resp = urllib.request.urlopen(req)
    sos_data = json.loads(resp.read().decode('utf-8'))
    assert resp.status == 200
    assert len(sos_data['contacts_notified']) > 0
    print(f"   -> Emergency SOS event #{sos_data['emergency_event_id']} recorded.")
    print(f"   -> Dispatched payload to {len(sos_data['contacts_notified'])} contacts. Maps URL: {sos_data['maps_url']}")

    print("[8] Testing PIN Disarm...")
    disarm_payload = json.dumps({"pin": "1234"}).encode('utf-8')
    req = urllib.request.Request(BASE_URL + "/api/sos/resolve", data=disarm_payload, headers={'Content-Type': 'application/json'})
    resp = urllib.request.urlopen(req)
    disarm_data = json.loads(resp.read().decode('utf-8'))
    assert disarm_data['status'] == 'success'
    print("   -> Emergency SOS disarmed successfully with PIN.")

    print("\n========================================================")
    print("  ALL LIVE SERVER SUITE TESTS PASSED WITH 100% SUCCESS!")
    print("========================================================\n")

if __name__ == '__main__':
    test_live_suite()
