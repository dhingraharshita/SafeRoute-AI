from datetime import datetime, timezone
import json
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class UserProfile(db.Model):
    __tablename__ = 'user_profiles'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, default='Alex Morgan')
    email = db.Column(db.String(120), default='alex.morgan@university.edu')
    phone = db.Column(db.String(30), default='+1 (555) 234-8901')
    role_description = db.Column(db.String(120), default='Night Commuter / Graduate Student')
    medical_notes = db.Column(db.String(255), default='Blood Type: O+, Mild Asthma (Inhaler in backpack)')
    emergency_pin = db.Column(db.String(10), default='1234')
    checkin_interval_mins = db.Column(db.Integer, default=5)
    battery_level = db.Column(db.Integer, default=85)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    contacts = db.relationship('EmergencyContact', backref='user', cascade='all, delete-orphan', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'phone': self.phone,
            'role_description': self.role_description,
            'medical_notes': self.medical_notes,
            'emergency_pin': self.emergency_pin,
            'checkin_interval_mins': self.checkin_interval_mins,
            'battery_level': self.battery_level,
            'contacts': [c.to_dict() for c in self.contacts]
        }

class EmergencyContact(db.Model):
    __tablename__ = 'emergency_contacts'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user_profiles.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    relationship = db.Column(db.String(50), default='Friend')
    phone = db.Column(db.String(30), nullable=False)
    email = db.Column(db.String(120), nullable=True)
    is_primary = db.Column(db.Boolean, default=False)
    notify_sms = db.Column(db.Boolean, default=True)
    notify_whatsapp = db.Column(db.Boolean, default=True)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'name': self.name,
            'relationship': self.relationship,
            'phone': self.phone,
            'email': self.email,
            'is_primary': self.is_primary,
            'notify_sms': self.notify_sms,
            'notify_whatsapp': self.notify_whatsapp
        }

class Journey(db.Model):
    __tablename__ = 'journeys'
    
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(150), default='Evening Commute')
    start_lat = db.Column(db.Float, nullable=False)
    start_lng = db.Column(db.Float, nullable=False)
    start_address = db.Column(db.String(255), default='Current Location')
    dest_lat = db.Column(db.Float, nullable=False)
    dest_lng = db.Column(db.Float, nullable=False)
    dest_address = db.Column(db.String(255), nullable=False)
    current_lat = db.Column(db.Float, nullable=True)
    current_lng = db.Column(db.Float, nullable=True)
    status = db.Column(db.String(30), default='active')  # 'active', 'completed', 'cancelled', 'emergency'
    risk_score = db.Column(db.Integer, default=12)
    risk_level = db.Column(db.String(20), default='SAFE')  # 'SAFE', 'CAUTION', 'HIGH RISK'
    planned_route_json = db.Column(db.Text, default='[]')
    actual_path_json = db.Column(db.Text, default='[]')
    start_time = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    end_time = db.Column(db.DateTime, nullable=True)
    last_checkin_time = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    next_checkin_time = db.Column(db.DateTime, nullable=True)
    missed_checkins_count = db.Column(db.Integer, default=0)

    risk_logs = db.relationship('RiskLog', backref='journey', cascade='all, delete-orphan', lazy=True)
    emergency_events = db.relationship('EmergencyEvent', backref='journey', cascade='all, delete-orphan', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'start_lat': self.start_lat,
            'start_lng': self.start_lng,
            'start_address': self.start_address,
            'dest_lat': self.dest_lat,
            'dest_lng': self.dest_lng,
            'dest_address': self.dest_address,
            'current_lat': self.current_lat if self.current_lat is not None else self.start_lat,
            'current_lng': self.current_lng if self.current_lng is not None else self.start_lng,
            'status': self.status,
            'risk_score': self.risk_score,
            'risk_level': self.risk_level,
            'planned_route': json.loads(self.planned_route_json) if self.planned_route_json else [],
            'actual_path': json.loads(self.actual_path_json) if self.actual_path_json else [],
            'start_time': self.start_time.isoformat() if self.start_time else None,
            'end_time': self.end_time.isoformat() if self.end_time else None,
            'last_checkin_time': self.last_checkin_time.isoformat() if self.last_checkin_time else None,
            'next_checkin_time': self.next_checkin_time.isoformat() if self.next_checkin_time else None,
            'missed_checkins_count': self.missed_checkins_count
        }

class RiskLog(db.Model):
    __tablename__ = 'risk_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    journey_id = db.Column(db.Integer, db.ForeignKey('journeys.id'), nullable=False)
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    risk_score = db.Column(db.Integer, nullable=False)
    risk_level = db.Column(db.String(20), nullable=False)
    factors_json = db.Column(db.Text, default='[]')
    explanation = db.Column(db.Text, nullable=False)
    recommended_action = db.Column(db.String(255), nullable=False)
    lat = db.Column(db.Float, nullable=True)
    lng = db.Column(db.Float, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'journey_id': self.journey_id,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'risk_score': self.risk_score,
            'risk_level': self.risk_level,
            'factors': json.loads(self.factors_json) if self.factors_json else [],
            'explanation': self.explanation,
            'recommended_action': self.recommended_action,
            'lat': self.lat,
            'lng': self.lng
        }

class SafetyReport(db.Model):
    __tablename__ = 'safety_reports'
    
    id = db.Column(db.Integer, primary_key=True)
    category = db.Column(db.String(50), nullable=False)
    title = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text, nullable=True)
    severity = db.Column(db.String(20), default='medium')
    lat = db.Column(db.Float, nullable=False)
    lng = db.Column(db.Float, nullable=False)
    address = db.Column(db.String(255), default='Nearby Location')
    upvotes = db.Column(db.Integer, default=1)
    status = db.Column(db.String(20), default='active')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'category': self.category,
            'title': self.title,
            'description': self.description,
            'severity': self.severity,
            'lat': self.lat,
            'lng': self.lng,
            'address': self.address,
            'upvotes': self.upvotes,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class EmergencyEvent(db.Model):
    __tablename__ = 'emergency_events'
    
    id = db.Column(db.Integer, primary_key=True)
    journey_id = db.Column(db.Integer, db.ForeignKey('journeys.id'), nullable=True)
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    lat = db.Column(db.Float, nullable=False)
    lng = db.Column(db.Float, nullable=False)
    trigger_source = db.Column(db.String(50), default='manual_sos')
    contacts_notified_json = db.Column(db.Text, default='[]')
    status = db.Column(db.String(30), default='active')
    resolved_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'journey_id': self.journey_id,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'lat': self.lat,
            'lng': self.lng,
            'trigger_source': self.trigger_source,
            'contacts_notified': json.loads(self.contacts_notified_json) if self.contacts_notified_json else [],
            'status': self.status,
            'resolved_at': self.resolved_at.isoformat() if self.resolved_at else None
        }
