import math
import os
import json
from datetime import datetime, timezone

# Optional Gemini import
try:
    import google.generativeai as genai
    HAS_GEMINI = True
except ImportError:
    HAS_GEMINI = False


def haversine_distance_meters(lat1, lon1, lat2, lon2):
    """Calculate the great-circle distance between two points in meters."""
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


def min_distance_to_route_meters(current_lat, current_lng, planned_route):
    """
    Find minimum perpendicular or vertex distance from current position
    to any segment in planned route coordinates [[lat, lng], ...].
    """
    if not planned_route or len(planned_route) == 0:
        return 0.0

    min_dist = float('inf')
    for pt in planned_route:
        plat, plng = pt[0], pt[1]
        dist = haversine_distance_meters(current_lat, current_lng, plat, plng)
        if dist < min_dist:
            min_dist = dist
    return min_dist


class RiskEngine:
    """
    Modular AI Risk Assessment & Explainability Engine for SafeRoute AI.
    Combines real-time trajectory metrics, environmental context,
    community safety reports, and check-in compliance into a transparent,
    explainable safety index (0 - 100).
    """

    def __init__(self, gemini_api_key=None):
        self.gemini_api_key = gemini_api_key or os.environ.get("GEMINI_API_KEY")
        self.gemini_client = None
        if HAS_GEMINI and self.gemini_api_key:
            try:
                genai.configure(api_key=self.gemini_api_key)
                self.gemini_client = genai.GenerativeModel("gemini-1.5-flash")
            except Exception as e:
                print(f"[RiskEngine] Gemini init warning: {e}")
                self.gemini_client = None

    def evaluate_risk(self, inputs):
        """
        Evaluate full risk profile from sensor & contextual inputs.

        Expected inputs dict:
        {
            "current_lat": float,
            "current_lng": float,
            "route_deviation_meters": float (optional, calculated if planned_route given),
            "planned_route": list of [lat, lng],
            "stopped_duration_seconds": float,
            "is_night": bool (optional, calculated from timestamp if omitted),
            "missed_checkins_count": int,
            "nearby_hazards": list of dicts [{"title": ..., "severity": "low"|"medium"|"high", "distance_meters": ...}],
            "battery_level": int (0-100),
            "is_sos_active": bool,
            "use_llm_enhancement": bool (optional)
        }
        """
        if inputs.get("is_sos_active", False):
            return {
                "risk_score": 100,
                "risk_level": "HIGH RISK",
                "status_code": "SOS_ACTIVE",
                "factors": [
                    {
                        "category": "sos",
                        "title": "EMERGENCY SOS ACTIVATED",
                        "description": "User or safety supervisor manually triggered emergency escalation.",
                        "severity": "critical",
                        "points": 100,
                        "icon": "shield-alert"
                    }
                ],
                "explanation": "EMERGENCY: SOS protocol active. Coordinates shared with trusted contacts and emergency response center.",
                "recommended_action": "Stay in a well-lit public area and await trusted contact or emergency services.",
                "action_type": "sos_active",
                "is_llm_generated": False
            }

        # 1. Base ambient score
        base_score = 10
        factors = []
        score_accumulator = base_score

        # 2. Route Deviation
        route_deviation = inputs.get("route_deviation_meters")
        if route_deviation is None and inputs.get("planned_route"):
            cur_lat = inputs.get("current_lat")
            cur_lng = inputs.get("current_lng")
            if cur_lat is not None and cur_lng is not None:
                route_deviation = min_distance_to_route_meters(cur_lat, cur_lng, inputs["planned_route"])
            else:
                route_deviation = 0.0
        elif route_deviation is None:
            route_deviation = 0.0

        if route_deviation > 200:
            pts = 45
            score_accumulator += pts
            factors.append({
                "category": "deviation",
                "title": f"Major Route Deviation ({int(route_deviation)}m off-path)",
                "description": f"You have moved {int(route_deviation)} meters away from your planned path into an unverified corridor.",
                "severity": "critical" if route_deviation > 350 else "high",
                "points": pts,
                "icon": "corner-up-right"
            })
        elif route_deviation > 80:
            pts = 28
            score_accumulator += pts
            factors.append({
                "category": "deviation",
                "title": f"Moderate Route Deviation ({int(route_deviation)}m off-path)",
                "description": f"Current path has deviated {int(route_deviation)} meters from designated safe route.",
                "severity": "medium",
                "points": pts,
                "icon": "corner-up-right"
            })
        elif route_deviation > 35:
            pts = 14
            score_accumulator += pts
            factors.append({
                "category": "deviation",
                "title": f"Slight Path Variation ({int(route_deviation)}m)",
                "description": "Minor drift from standard transit corridor detected.",
                "severity": "low",
                "points": pts,
                "icon": "navigation"
            })

        # 3. Inactivity / Unusual Stop
        stopped_sec = inputs.get("stopped_duration_seconds", 0)
        if stopped_sec > 180: # > 3 minutes
            pts = 26
            score_accumulator += pts
            factors.append({
                "category": "stopped",
                "title": f"Prolonged Inactivity ({int(stopped_sec // 60)} min stationary)",
                "description": "Unscheduled stationary halt detected outside designated hubs.",
                "severity": "high",
                "points": pts,
                "icon": "clock-alert"
            })
        elif stopped_sec > 60: # > 1 minute
            pts = 12
            score_accumulator += pts
            factors.append({
                "category": "stopped",
                "title": f"Unusual Stopping ({int(stopped_sec)}s stationary)",
                "description": "User has remained in place longer than typical transit waiting times.",
                "severity": "medium",
                "points": pts,
                "icon": "clock"
            })

        # 4. Night Time / Low Visibility Context
        is_night = inputs.get("is_night")
        if is_night is None:
            # Check local hour
            current_hour = datetime.now().hour
            is_night = (current_hour >= 21 or current_hour < 6)

        if is_night:
            pts = 16
            score_accumulator += pts
            factors.append({
                "category": "environment",
                "title": "Late Night / Reduced Visibility",
                "description": "Higher environmental risk profile active during late-night hours (9 PM – 6 AM).",
                "severity": "medium",
                "points": pts,
                "icon": "moon"
            })

        # 5. Missed Safety Check-in
        missed_count = inputs.get("missed_checkins_count", 0)
        if missed_count >= 2:
            pts = 42
            score_accumulator += pts
            factors.append({
                "category": "checkin",
                "title": f"Multiple Missed Check-ins ({missed_count} missed)",
                "description": "Failed to acknowledge consecutive automated safety pings. High escalation triggered.",
                "severity": "critical",
                "points": pts,
                "icon": "bell-ring"
            })
        elif missed_count == 1:
            pts = 24
            score_accumulator += pts
            factors.append({
                "category": "checkin",
                "title": "Missed Safety Check-in",
                "description": "Check-in timer expired without response. Awaiting 'I am Safe' verification.",
                "severity": "high",
                "points": pts,
                "icon": "bell-off"
            })

        # 6. Nearby Community Safety Reports / Hazard Zones
        hazards = inputs.get("nearby_hazards", [])
        hazard_points = 0
        high_sev_count = 0
        for h in hazards:
            sev = h.get("severity", "medium").lower()
            dist = h.get("distance_meters", 100)
            title = h.get("title", "Safety Hazard")

            if sev == "high" or "harassment" in title.lower() or "suspicious" in title.lower():
                h_pts = 22 if dist < 150 else 15
                high_sev_count += 1
            elif sev == "medium" or "lighting" in title.lower() or "isolated" in title.lower():
                h_pts = 14 if dist < 150 else 8
            else:
                h_pts = 6

            hazard_points += h_pts
            factors.append({
                "category": "hazard",
                "title": f"Nearby Hazard: {title}",
                "description": f"Reported {int(dist)}m away. Severity: {sev.upper()}.",
                "severity": "critical" if sev == "high" else ("high" if sev == "medium" else "medium"),
                "points": h_pts,
                "icon": "alert-triangle"
            })

        # Cap hazard contribution to avoid unbounded explosion
        hazard_points = min(hazard_points, 40)
        score_accumulator += hazard_points

        # 7. Battery Depletion Factor
        battery = inputs.get("battery_level", 100)
        if battery is not None and battery <= 15:
            pts = 12
            score_accumulator += pts
            factors.append({
                "category": "device",
                "title": f"Critically Low Battery ({battery}%)",
                "description": "Device battery low. Increased vulnerability if communication is disrupted.",
                "severity": "medium",
                "points": pts,
                "icon": "battery-warning"
            })

        # 8. Compound Risk Synergy Multiplier
        # If 3 or more distinct risk signals coincide, apply a synergistic multiplier
        if len(factors) >= 3:
            multiplier = 1.22
            score_accumulator = int(score_accumulator * multiplier)

        # Final clamp: 0 to 100
        final_score = max(5, min(100, int(score_accumulator)))

        # Determine level
        if final_score < 31:
            risk_level = "SAFE"
        elif final_score < 70:
            risk_level = "CAUTION"
        else:
            risk_level = "HIGH RISK"

        # Generate Explainability & Action
        explanation, recommended_action, action_type = self._generate_explanation_and_action(
            final_score, risk_level, factors, route_deviation, stopped_sec, missed_count, hazards, is_night
        )

        # Optional Gemini enhancement
        is_llm = False
        if inputs.get("use_llm_enhancement", False) and self.gemini_client and risk_level != "SAFE":
            llm_exp = self._try_gemini_enhancement(final_score, risk_level, factors, explanation)
            if llm_exp:
                explanation = llm_exp
                is_llm = True

        return {
            "risk_score": final_score,
            "risk_level": risk_level,
            "factors": factors,
            "explanation": explanation,
            "recommended_action": recommended_action,
            "action_type": action_type,
            "is_llm_generated": is_llm,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    def _generate_explanation_and_action(self, score, level, factors, deviation, stopped_sec, missed, hazards, is_night):
        """Build transparent, structured explanation and tactical recommendation."""
        if level == "SAFE":
            explanation = "Journey proceeding smoothly along the planned safe corridor. All safety signals and check-ins are verified normal."
            action = "Continue following your current route."
            action_type = "continue"
            return explanation, action, action_type

        # Build dynamic explanation from prominent factors
        reasons = []
        if deviation > 80:
            reasons.append(f"you deviated {int(deviation)}m from your planned route")
        elif deviation > 35:
            reasons.append("you drifted slightly off-path")

        if stopped_sec > 60:
            reasons.append(f"you have remained stationary for {int(stopped_sec // 60)} min")

        if missed > 0:
            reasons.append("a scheduled safety check-in was missed")

        if hazards:
            h_names = [h.get("title", "hazard") for h in hazards[:2]]
            reasons.append(f"you are near reported safety hazards ({', '.join(h_names)})")

        if is_night and (deviation > 35 or stopped_sec > 60 or missed > 0 or hazards):
            reasons.append("in low-visibility night conditions")

        if reasons:
            if len(reasons) == 1:
                explanation = f"Risk increased to {level} ({score}) because {reasons[0]}."
            elif len(reasons) == 2:
                explanation = f"Risk increased to {level} ({score}) because {reasons[0]} and {reasons[1]}."
            else:
                explanation = f"Risk escalated to {level} ({score}) due to compound factors: {', '.join(reasons[:-1])}, and {reasons[-1]}."
        else:
            explanation = f"Risk is at {level} ({score}) due to environmental conditions and active monitoring parameters."

        # Tactical recommendation
        if level == "HIGH RISK":
            if missed > 0:
                action = "Press 'I'm Safe' to reset alarm, or alert trusted contacts immediately."
                action_type = "checkin_or_sos"
            elif deviation > 150:
                action = "Return to well-lit main transit avenue or seek nearest verified Safe Haven."
                action_type = "return_route"
            else:
                action = "Move to a crowded, well-lit location or prepare to trigger emergency SOS."
                action_type = "prepare_sos"
        else: # CAUTION
            if missed > 0:
                action = "Verify safety by completing your check-in, or notify your contact."
                action_type = "checkin"
            elif deviation > 60:
                action = "Head back toward your planned route or stay on main well-lit roads."
                action_type = "return_route"
            elif stopped_sec > 60:
                action = "Resume travel or tap 'I'm Safe' if waiting for transit/ride."
                action_type = "checkin"
            elif hazards:
                action = "Exercise caution and stay alert while bypassing nearby hazard zones."
                action_type = "stay_alert"
            else:
                action = "Check in with a trusted contact and maintain situational awareness."
                action_type = "checkin"

        return explanation, action, action_type

    def _try_gemini_enhancement(self, score, level, factors, fallback_explanation):
        """Call Gemini for nuanced natural language tactical briefing."""
        try:
            prompt = f"""
            You are the SafeRoute AI tactical safety assistant.
            A commuter is walking alone.
            Current Status: {level} (Score: {score}/100)
            Factors detected:
            {json.dumps(factors, indent=2)}

            Provide a 2-sentence concise, clear, and reassuring AI safety assessment explaining why the risk score changed and what specific tactical micro-step the user should take right now.
            Do not use generic fluff or markdown formatting. Keep under 40 words.
            """
            response = self.gemini_client.generate_content(prompt)
            if response and response.text:
                return response.text.strip()
        except Exception as e:
            print(f"[RiskEngine] Gemini call failed: {e}")
        return fallback_explanation
