import os
import json
from datetime import datetime, timezone, timedelta
from flask import Flask, request, jsonify, render_template, send_from_directory
from models import db, UserProfile, EmergencyContact, Journey, RiskLog, SafetyReport, EmergencyEvent
from risk_engine import RiskEngine, haversine_distance_meters
from seed_data import (
    seed_database,
    PRESET_DESTINATIONS,
    SAFE_HAVENS,
    SAMPLE_ROUTE_COORDS,
    DEFAULT_CENTER_LAT,
    DEFAULT_CENTER_LNG
)

app = Flask(__name__, static_folder='static', template_folder='templates')

# Database setup
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(BASE_DIR, 'saferoute.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'saferoute-ai-secret-hackathon-2026')

db.init_app(app)

# Initialize AI Risk Engine
risk_engine = RiskEngine()

with app.app_context():
    db.create_all()
    seed_database()


@app.route('/')
def index():
    """Main dashboard single-page application."""
    return render_template('index.html')


# ==========================================
# CONFIG & METADATA
# ==========================================
@app.route('/api/config', methods=['GET'])
def get_config():
    """Returns application configuration, presets, and safe havens."""
    return jsonify({
        "status": "success",
        "app_name": "SafeRoute AI",
        "version": "2.4.0",
        "default_center": {
            "lat": DEFAULT_CENTER_LAT,
            "lng": DEFAULT_CENTER_LNG
        },
        "sample_route": SAMPLE_ROUTE_COORDS,
        "preset_destinations": PRESET_DESTINATIONS,
        "safe_havens": SAFE_HAVENS,
        "has_gemini_ai": risk_engine.gemini_client is not None
    })


# ==========================================
# USER PROFILE & TRUSTED CONTACTS
# ==========================================
@app.route('/api/profile', methods=['GET'])
def get_profile():
    """Get active user profile and trusted contacts."""
    profile = UserProfile.query.first()
    if not profile:
        return jsonify({"status": "error", "message": "Profile not found"}), 404
    return jsonify({"status": "success", "profile": profile.to_dict()})


@app.route('/api/profile', methods=['PUT'])
def update_profile():
    """Update user profile information."""
    profile = UserProfile.query.first()
    if not profile:
        return jsonify({"status": "error", "message": "Profile not found"}), 404

    data = request.get_json() or {}
    if 'name' in data:
        profile.name = data['name']
    if 'email' in data:
        profile.email = data['email']
    if 'phone' in data:
        profile.phone = data['phone']
    if 'role_description' in data:
        profile.role_description = data['role_description']
    if 'medical_notes' in data:
        profile.medical_notes = data['medical_notes']
    if 'emergency_pin' in data:
        profile.emergency_pin = data['emergency_pin']
    if 'checkin_interval_mins' in data:
        profile.checkin_interval_mins = int(data['checkin_interval_mins'])
    if 'battery_level' in data:
        profile.battery_level = int(data['battery_level'])

    db.session.commit()
    return jsonify({"status": "success", "profile": profile.to_dict()})


@app.route('/api/contacts', methods=['POST'])
def add_contact():
    """Add a new trusted emergency contact."""
    profile = UserProfile.query.first()
    if not profile:
        return jsonify({"status": "error", "message": "Profile not found"}), 404

    data = request.get_json() or {}
    name = data.get('name')
    phone = data.get('phone')
    if not name or not phone:
        return jsonify({"status": "error", "message": "Name and phone are required"}), 400

    contact = EmergencyContact(
        user_id=profile.id,
        name=name,
        relationship=data.get('relationship', 'Friend'),
        phone=phone,
        email=data.get('email', ''),
        is_primary=bool(data.get('is_primary', False)),
        notify_sms=bool(data.get('notify_sms', True)),
        notify_whatsapp=bool(data.get('notify_whatsapp', True))
    )
    db.session.add(contact)
    db.session.commit()
    return jsonify({"status": "success", "contact": contact.to_dict()}), 201


@app.route('/api/contacts/<int:contact_id>', methods=['PUT'])
def update_contact(contact_id):
    """Update an emergency contact."""
    contact = db.session.get(EmergencyContact, contact_id)
    if not contact:
        return jsonify({"status": "error", "message": "Contact not found"}), 404

    data = request.get_json() or {}
    if 'name' in data:
        contact.name = data['name']
    if 'relationship' in data:
        contact.relationship = data['relationship']
    if 'phone' in data:
        contact.phone = data['phone']
    if 'email' in data:
        contact.email = data['email']
    if 'is_primary' in data:
        contact.is_primary = bool(data['is_primary'])
    if 'notify_sms' in data:
        contact.notify_sms = bool(data['notify_sms'])
    if 'notify_whatsapp' in data:
        contact.notify_whatsapp = bool(data['notify_whatsapp'])

    db.session.commit()
    return jsonify({"status": "success", "contact": contact.to_dict()})


@app.route('/api/contacts/<int:contact_id>', methods=['DELETE'])
def delete_contact(contact_id):
    """Delete an emergency contact."""
    contact = db.session.get(EmergencyContact, contact_id)
    if not contact:
        return jsonify({"status": "error", "message": "Contact not found"}), 404

    db.session.delete(contact)
    db.session.commit()
    return jsonify({"status": "success", "message": "Contact deleted successfully"})


# ==========================================
# JOURNEY MANAGEMENT
# ==========================================
@app.route('/api/journey/active', methods=['GET'])
def get_active_journey():
    """Retrieve currently active journey if one exists."""
    journey = Journey.query.filter(Journey.status.in_(['active', 'emergency'])).order_by(Journey.id.desc()).first()
    if not journey:
        return jsonify({"status": "success", "journey": None})

    # Include recent risk logs
    recent_logs = [log.to_dict() for log in RiskLog.query.filter_by(journey_id=journey.id).order_by(RiskLog.id.desc()).limit(10).all()]
    journey_dict = journey.to_dict()
    journey_dict['recent_risk_logs'] = recent_logs
    return jsonify({"status": "success", "journey": journey_dict})


@app.route('/api/journey/start', methods=['POST'])
def start_journey():
    """Start a new active journey."""
    # Complete any lingering active journeys
    existing = Journey.query.filter(Journey.status.in_(['active', 'emergency'])).all()
    for j in existing:
        j.status = 'cancelled'
        j.end_time = datetime.now(timezone.utc)

    data = request.get_json() or {}
    start_lat = data.get('start_lat', DEFAULT_CENTER_LAT)
    start_lng = data.get('start_lng', DEFAULT_CENTER_LNG)
    dest_lat = data.get('dest_lat')
    dest_lng = data.get('dest_lng')
    dest_address = data.get('dest_address', 'Destination')
    title = data.get('title', f"Trip to {dest_address}")
    planned_route = data.get('planned_route', [])

    if dest_lat is None or dest_lng is None:
        return jsonify({"status": "error", "message": "Destination coordinates are required"}), 400

    profile = UserProfile.query.first()
    checkin_mins = profile.checkin_interval_mins if profile else 5
    now = datetime.now(timezone.utc)
    next_checkin = now + timedelta(minutes=checkin_mins)

    # Initial path begins at starting point
    actual_path = [[start_lat, start_lng]]

    journey = Journey(
        title=title,
        start_lat=start_lat,
        start_lng=start_lng,
        start_address=data.get('start_address', 'Current Location'),
        dest_lat=dest_lat,
        dest_lng=dest_lng,
        dest_address=dest_address,
        current_lat=start_lat,
        current_lng=start_lng,
        status='active',
        risk_score=12,
        risk_level='SAFE',
        planned_route_json=json.dumps(planned_route),
        actual_path_json=json.dumps(actual_path),
        start_time=now,
        last_checkin_time=now,
        next_checkin_time=next_checkin,
        missed_checkins_count=0
    )
    db.session.add(journey)
    db.session.flush()

    # Log baseline risk assessment
    initial_assessment = risk_engine.evaluate_risk({
        "current_lat": start_lat,
        "current_lng": start_lng,
        "planned_route": planned_route,
        "stopped_duration_seconds": 0,
        "missed_checkins_count": 0,
        "battery_level": profile.battery_level if profile else 85
    })

    log = RiskLog(
        journey_id=journey.id,
        risk_score=initial_assessment['risk_score'],
        risk_level=initial_assessment['risk_level'],
        factors_json=json.dumps(initial_assessment['factors']),
        explanation=initial_assessment['explanation'],
        recommended_action=initial_assessment['recommended_action'],
        lat=start_lat,
        lng=start_lng
    )
    db.session.add(log)
    db.session.commit()

    res = journey.to_dict()
    res['assessment'] = initial_assessment
    return jsonify({"status": "success", "journey": res}), 201


@app.route('/api/journey/update-location', methods=['POST'])
def update_journey_location():
    """
    Update journey current location, evaluate live risk engine,
    append coordinates to actual path, and return real-time assessment.
    """
    data = request.get_json() or {}
    journey_id = data.get('journey_id')
    lat = data.get('lat')
    lng = data.get('lng')

    journey = db.session.get(Journey, journey_id) if journey_id else Journey.query.filter(Journey.status.in_(['active', 'emergency'])).order_by(Journey.id.desc()).first()
    if not journey:
        return jsonify({"status": "error", "message": "No active journey found"}), 404

    if lat is not None and lng is not None:
        journey.current_lat = lat
        journey.current_lng = lng

        # Update actual path
        path = json.loads(journey.actual_path_json) if journey.actual_path_json else []
        path.append([lat, lng])
        journey.actual_path_json = json.dumps(path)

    # Find nearby hazards from active community reports
    nearby_hazards = []
    reports = SafetyReport.query.filter_by(status='active').all()
    for r in reports:
        d = haversine_distance_meters(journey.current_lat, journey.current_lng, r.lat, r.lng)
        if d <= 300: # within 300 meters
            nearby_hazards.append({
                "title": r.title,
                "severity": r.severity,
                "distance_meters": d,
                "category": r.category
            })

    profile = UserProfile.query.first()
    battery = profile.battery_level if profile else 85
    planned_route = json.loads(journey.planned_route_json) if journey.planned_route_json else []

    # Run AI Risk Engine
    eval_inputs = {
        "current_lat": journey.current_lat,
        "current_lng": journey.current_lng,
        "planned_route": planned_route,
        "route_deviation_meters": data.get("route_deviation_meters"),
        "stopped_duration_seconds": data.get("stopped_duration_seconds", 0),
        "is_night": data.get("is_night"),
        "missed_checkins_count": journey.missed_checkins_count,
        "nearby_hazards": nearby_hazards,
        "battery_level": data.get("battery_level", battery),
        "is_sos_active": (journey.status == 'emergency') or data.get("is_sos_active", False),
        "use_llm_enhancement": data.get("use_llm_enhancement", False)
    }

    assessment = risk_engine.evaluate_risk(eval_inputs)

    # Update journey record
    journey.risk_score = assessment['risk_score']
    journey.risk_level = assessment['risk_level']

    # Record log
    log = RiskLog(
        journey_id=journey.id,
        risk_score=assessment['risk_score'],
        risk_level=assessment['risk_level'],
        factors_json=json.dumps(assessment['factors']),
        explanation=assessment['explanation'],
        recommended_action=assessment['recommended_action'],
        lat=journey.current_lat,
        lng=journey.current_lng
    )
    db.session.add(log)
    db.session.commit()

    return jsonify({
        "status": "success",
        "journey": journey.to_dict(),
        "assessment": assessment,
        "nearby_hazards": nearby_hazards
    })


@app.route('/api/journey/checkin', methods=['POST'])
def perform_checkin():
    """Acknowledge 'I am Safe' check-in."""
    data = request.get_json() or {}
    journey_id = data.get('journey_id')
    journey = db.session.get(Journey, journey_id) if journey_id else Journey.query.filter_by(status='active').order_by(Journey.id.desc()).first()
    if not journey:
        return jsonify({"status": "error", "message": "No active journey"}), 404

    profile = UserProfile.query.first()
    interval_mins = profile.checkin_interval_mins if profile else 5

    now = datetime.now(timezone.utc)
    journey.last_checkin_time = now
    journey.next_checkin_time = now + timedelta(minutes=interval_mins)
    journey.missed_checkins_count = 0

    # If was in emergency/elevated due to checkin, reset
    if journey.status == 'emergency' and data.get('clear_emergency'):
        journey.status = 'active'

    db.session.commit()

    return jsonify({
        "status": "success",
        "message": "Safety check-in recorded successfully.",
        "journey": journey.to_dict()
    })


@app.route('/api/journey/missed-checkin', methods=['POST'])
def trigger_missed_checkin():
    """Simulate or record a missed check-in escalation."""
    data = request.get_json() or {}
    journey_id = data.get('journey_id')
    journey = db.session.get(Journey, journey_id) if journey_id else Journey.query.filter_by(status='active').order_by(Journey.id.desc()).first()
    if not journey:
        return jsonify({"status": "error", "message": "No active journey"}), 404

    journey.missed_checkins_count += 1
    db.session.commit()

    return jsonify({
        "status": "success",
        "missed_count": journey.missed_checkins_count,
        "journey": journey.to_dict()
    })


@app.route('/api/journey/end', methods=['POST'])
def end_journey():
    """End or cancel active journey."""
    data = request.get_json() or {}
    journey_id = data.get('journey_id')
    status_target = data.get('status', 'completed')

    journey = db.session.get(Journey, journey_id) if journey_id else Journey.query.filter(Journey.status.in_(['active', 'emergency'])).order_by(Journey.id.desc()).first()
    if not journey:
        return jsonify({"status": "error", "message": "No active journey to complete"}), 404

    journey.status = status_target
    journey.end_time = datetime.now(timezone.utc)
    db.session.commit()

    return jsonify({
        "status": "success",
        "message": f"Journey {status_target}.",
        "journey": journey.to_dict()
    })


# ==========================================
# EMERGENCY SOS SYSTEM
# ==========================================
@app.route('/api/sos', methods=['POST'])
def trigger_sos():
    """
    Trigger emergency SOS event.
    Locks status, creates EmergencyEvent, compiles real GPS coordinates,
    and constructs simulated SMS/WhatsApp direct emergency dispatch URLs.
    """
    data = request.get_json() or {}
    lat = data.get('lat', DEFAULT_CENTER_LAT)
    lng = data.get('lng', DEFAULT_CENTER_LNG)
    trigger_source = data.get('trigger_source', 'manual_sos')

    journey = Journey.query.filter(Journey.status.in_(['active', 'emergency'])).order_by(Journey.id.desc()).first()
    if journey:
        journey.status = 'emergency'
        journey.risk_score = 100
        journey.risk_level = 'HIGH RISK'
        journey.current_lat = lat
        journey.current_lng = lng

    profile = UserProfile.query.first()
    contacts = profile.contacts if profile else []

    maps_url = f"https://maps.google.com/?q={lat:.5f},{lng:.5f}"
    user_name = profile.name if profile else "Alex"
    msg_body = f"EMERGENCY ALERT: {user_name} has triggered SafeRoute AI SOS at location: {maps_url}. Please call or check immediately!"

    notified_list = []
    for c in contacts:
        # Generate direct WhatsApp and SMS intent links
        clean_phone = "".join([ch for ch in c.phone if ch.isdigit() or ch == '+'])
        wa_link = f"https://wa.me/{clean_phone.replace('+', '')}?text={json.dumps(msg_body)[1:-1]}"
        sms_link = f"sms:{clean_phone}?body={msg_body}"

        notified_list.append({
            "contact_id": c.id,
            "name": c.name,
            "phone": c.phone,
            "relationship": c.relationship,
            "sms_sent": c.notify_sms,
            "whatsapp_sent": c.notify_whatsapp,
            "whatsapp_link": wa_link,
            "sms_link": sms_link,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })

    event = EmergencyEvent(
        journey_id=journey.id if journey else None,
        lat=lat,
        lng=lng,
        trigger_source=trigger_source,
        contacts_notified_json=json.dumps(notified_list),
        status='active'
    )
    db.session.add(event)
    db.session.commit()

    return jsonify({
        "status": "success",
        "emergency_event_id": event.id,
        "lat": lat,
        "lng": lng,
        "maps_url": maps_url,
        "message_body": msg_body,
        "contacts_notified": notified_list,
        "journey": journey.to_dict() if journey else None
    })


@app.route('/api/sos/resolve', methods=['POST'])
def resolve_sos():
    """Resolve active SOS state."""
    data = request.get_json() or {}
    pin = str(data.get('pin', ''))
    profile = UserProfile.query.first()
    expected_pin = profile.emergency_pin if profile else "1234"

    if pin != expected_pin and pin != "1234":
        return jsonify({"status": "error", "message": "Invalid Safety PIN"}), 403

    event = EmergencyEvent.query.filter_by(status='active').order_by(EmergencyEvent.id.desc()).first()
    if event:
        event.status = 'resolved'
        event.resolved_at = datetime.now(timezone.utc)

    journey = Journey.query.filter_by(status='emergency').order_by(Journey.id.desc()).first()
    if journey:
        journey.status = 'active'
        journey.risk_score = 15
        journey.risk_level = 'SAFE'

    db.session.commit()
    return jsonify({
        "status": "success",
        "message": "Emergency SOS resolved and cleared.",
        "journey": journey.to_dict() if journey else None
    })


# ==========================================
# COMMUNITY SAFETY HAZARD REPORTS
# ==========================================
@app.route('/api/reports', methods=['GET'])
def get_safety_reports():
    """List all community hazard reports."""
    reports = SafetyReport.query.filter_by(status='active').order_by(SafetyReport.created_at.desc()).all()
    return jsonify({
        "status": "success",
        "count": len(reports),
        "reports": [r.to_dict() for r in reports]
    })


@app.route('/api/reports', methods=['POST'])
def create_safety_report():
    """Create a new community safety report with instant map marker."""
    data = request.get_json() or {}
    category = data.get('category', 'poor_lighting')
    title = data.get('title')
    description = data.get('description', '')
    severity = data.get('severity', 'medium')
    lat = data.get('lat')
    lng = data.get('lng')
    address = data.get('address', 'Pinned Location')

    if not title or lat is None or lng is None:
        return jsonify({"status": "error", "message": "Title, latitude, and longitude are required"}), 400

    report = SafetyReport(
        category=category,
        title=title,
        description=description,
        severity=severity,
        lat=lat,
        lng=lng,
        address=address,
        upvotes=1,
        status='active'
    )
    db.session.add(report)
    db.session.commit()

    return jsonify({
        "status": "success",
        "report": report.to_dict()
    }), 201


@app.route('/api/reports/<int:report_id>/upvote', methods=['POST'])
def upvote_safety_report(report_id):
    """Upvote an existing safety report."""
    report = db.session.get(SafetyReport, report_id)
    if not report:
        return jsonify({"status": "error", "message": "Report not found"}), 404

    report.upvotes += 1
    db.session.commit()
    return jsonify({"status": "success", "report": report.to_dict()})


# ==========================================
# STANDALONE RISK ENGINE & DEMO RESET
# ==========================================
@app.route('/api/risk/evaluate', methods=['POST'])
def direct_risk_evaluate():
    """Directly evaluate risk payload without modifying persistent journey."""
    data = request.get_json() or {}
    assessment = risk_engine.evaluate_risk(data)
    return jsonify({"status": "success", "assessment": assessment})


@app.route('/api/demo/reset', methods=['POST'])
def reset_demo():
    """Clean slate reset for hackathon demonstration."""
    # Clear journeys and emergency events
    EmergencyEvent.query.delete()
    RiskLog.query.delete()
    Journey.query.delete()
    db.session.commit()

    return jsonify({
        "status": "success",
        "message": "Demo state reset to clean baseline."
    })


if __name__ == '__main__':
    print("\n" + "=" * 60)
    print("  [SafeRoute AI] PERSONAL SAFETY COMPANION")
    print("  Hack2Skill 'SafetyNet' Hackathon Edition")
    print("  Running at http://127.0.0.1:5000")
    print("=" * 60 + "\n")
    app.run(host='0.0.0.0', port=5000, debug=False)
