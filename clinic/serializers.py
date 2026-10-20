from rest_framework import serializers

from .models import Patient


# Converts a Patient to JSON and checks the data when one is created
class PatientSerializer(serializers.ModelSerializer):
    patient_number = serializers.CharField(read_only=True)   # calculated, so it cannot be sent in

    class Meta:
        model = Patient
        fields = ["id", "patient_number", "name", "age", "created_at"]
        read_only_fields = ["id", "patient_number", "created_at"]

    # Reject ages that cannot be real
    def validate_age(self, value):
        if value > 120:
            raise serializers.ValidationError("Enter a realistic age.")
        return value