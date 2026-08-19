import json
from datetime import datetime, timezone
from models import db, UserProfile, EmergencyContact, SafetyReport, Journey

# Standard Default Coordinates (Tech Campus & Downtown Corridor)
DEFAULT_CENTER_LAT = 37.7749
DEFAULT_CENTER_LNG = -122.4194

# Pre-calculated realistic walkable route (Campus Library -> Downtown Transit Center -> West Dorms)
SAMPLE_ROUTE_COORDS = [
    [37.7749, -122.4194],
    [37.7758, -122.4182],
    [37.7769, -122.4168],
    [37.7782, -122.4150],
    [37.7795, -122.4135],
    [37.7810, -122.4118],
    [37.7825, -122.4102],
    [37.7840, -122.4085]
]

# Preset destination destinations for instant 1-click selection
PRESET_DESTINATIONS = [
    {
        "id": "dest-1",
        "name": "North Campus Dormitory (Hall B)",
        "address": "450 University Way, Campus District",
        "lat": 37.7840,
        "lng": -122.4085,
        "category": "residence",
        "est_walking_mins": 14
    },
    {
        "id": "dest-2",
        "name": "Central Metro & Transit Terminal",
        "address": "800 Market Boulevard",
        "lat": 37.7815,
        "lng": -122.4060,
        "category": "transit",
        "est_walking_mins": 10
    },
    {
        "id": "dest-3",
        "name": "Graduate Research Library",
        "address": "120 College Avenue",
        "lat": 37.7725,
        "lng": -122.4220,
        "category": "academic",
        "est_walking_mins": 8
    },
    {
        "id": "dest-4",
        "name": "St. Jude 24/7 Medical Clinic",
        "address": "950 Health Sciences Parkway",
        "lat": 37.7870,
        "lng": -122.4150,
        "category": "safe_haven",
        "est_walking_mins": 18
    }
]

# 24/7 Verified Safe Havens
SAFE_HAVENS = [
    {
        "id": "sh-1",
        "name": "Campus Security & Escort Booth",
        "lat": 37.7765,
        "lng": -122.4170,
        "type": "police_booth",
        "services": "24/7 Security Officers, Panic Alarm, Phone Charger",
        "phone": "+1 (555) 999-0011"
    },
    {
        "id": "sh-2",
        "name": "Central 24-Hour Pharmacy & Well-Lit Hub",
        "lat": 37.7798,
        "lng": -122.4130,
        "type": "safe_store",
        "services": "24/7 Staffed, CCTV Monitored, Public Lobby",
        "phone": "+1 (555) 999-0022"
    },
    {
        "id": "sh-3",
        "name": "Metro Transit Police Substation",
        "lat": 37.7820,
        "lng": -122.4095,
        "type": "transit_police",
        "services": "Direct Emergency Intercom, Armed Patrols",
        "phone": "+1 (555) 999-0033"
    }
]

def seed_database():
    """Seed the database with high-quality demo data if empty."""
    # 1. Profile
    profile = UserProfile.query.first()
    if not profile:
        profile = UserProfile(
            name="Alex Morgan",
            email="alex.morgan@university.edu",
            phone="+1 (555) 234-8901",
            role_description="Graduate Student / Late-Night Commuter",
            medical_notes="Blood Type: O+, Mild Asthma (Inhaler in pack)",
            emergency_pin="1234",
            checkin_interval_mins=5,
            battery_level=88
        )
        db.session.add(profile)
        db.session.flush()

        # 2. Trusted Contacts
        c1 = EmergencyContact(
            user_id=profile.id,
            name="Sarah Morgan (Sister)",
            relationship="Sister",
            phone="+1 (555) 901-4422",
            email="sarah.m@gmail.com",
            is_primary=True,
            notify_sms=True,
            notify_whatsapp=True
        )
        c2 = EmergencyContact(
            user_id=profile.id,
            name="David Miller (Roommate)",
            relationship="Roommate",
            phone="+1 (555) 773-8910",
            email="david.m@university.edu",
            is_primary=False,
            notify_sms=True,
            notify_whatsapp=True
        )
        c3 = EmergencyContact(
            user_id=profile.id,
            name="Campus Escort & Safety Patrol",
            relationship="Security",
            phone="+1 (555) 321-9900",
            email="campus.safety@university.edu",
            is_primary=False,
            notify_sms=True,
            notify_whatsapp=False
        )
        db.session.add_all([c1, c2, c3])

    # 3. Community Safety Reports
    if SafetyReport.query.count() == 0:
        reports = [
            SafetyReport(
                category="poor_lighting",
                title="Broken Street Lamps & Dark Corridor",
                description="Entire alley between 4th and 5th street has malfunctioning sodium lights. Very dark after 9 PM.",
                severity="medium",
                lat=37.7775,
                lng=-122.4145,
                address="Near 4th & Mission Cross",
                upvotes=7
            ),
            SafetyReport(
                category="harassment",
                title="Recent Verbal Harassment Hotspot",
                description="Two independent reports of aggressive catcalling and loitering near the abandoned storefront.",
                severity="high",
                lat=37.7802,
                lng=-122.4158,
                address="Corner of 7th & Howard",
                upvotes=14
            ),
            SafetyReport(
                category="isolated_area",
                title="Construction Barrier Blindspot",
                description="Heavy construction fencing creates an isolated tunnel with no pedestrian visibility from main street.",
                severity="medium",
                lat=37.7760,
                lng=-122.4200,
                address="West Park Walkway",
                upvotes=4
            ),
            SafetyReport(
                category="suspicious_activity",
                title="Unregistered Loitering Vehicle",
                description="Dark sedan idling with lights off near pedestrian crossing for extended duration.",
                severity="high",
                lat=37.7830,
                lng=-122.4070,
                address="8th & Clementina Passage",
                upvotes=9
            )
        ]
        db.session.add_all(reports)

    db.session.commit()
    print("[SafeRoute AI] Database initialized & seeded successfully.")
