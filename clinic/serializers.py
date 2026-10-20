from rest_framework import serializers

from .models import Patient, Visit


# Converts a Patient to JSON and checks the data when one is created
class PatientSerializer(serializers.ModelSerializer):
    patient_number = serializers.CharField(read_only=True)

    class Meta:
        model = Patient
        fields = ["id", "patient_number", "name", "age", "created_at"]
        read_only_fields = ["id", "patient_number", "created_at"]

    def validate_age(self, value):
        if value > 120:
            raise serializers.ValidationError("Enter a realistic age.")
        return value


# How a visit looks when we SHOW it (patient details included, nothing editable)
class VisitSerializer(serializers.ModelSerializer):
    patient = PatientSerializer(read_only=True)
    lab_name = serializers.CharField(source="lab.name", read_only=True)
    nurse_name = serializers.CharField(source="nurse.name", read_only=True)

    class Meta:
        model = Visit
        fields = [
            "id", "patient", "lab", "lab_name", "nurse", "nurse_name", "visit_date",
            "temperature", "heart_rate", "blood_pressure", "symptoms", "status", "created_at",
        ]
        read_only_fields = fields


# How a visit looks when the nurse CREATES one (only the fields she is allowed to send)
class VisitCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Visit
        fields = ["id", "patient", "lab", "visit_date", "temperature", "heart_rate", "blood_pressure", "symptoms"]
        read_only_fields = ["id"]

    # Reject values that cannot be real
    def validate_temperature(self, value):
        if value is not None and not (30 <= value <= 45):
            raise serializers.ValidationError("Temperature must be between 30 and 45 degrees Celsius.")
        return value

    def validate_heart_rate(self, value):
        if value is not None and not (20 <= value <= 250):
            raise serializers.ValidationError("Heart rate must be between 20 and 250 bpm.")
        return value