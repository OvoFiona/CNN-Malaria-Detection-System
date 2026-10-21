from rest_framework import serializers
from django.conf import settings
from PIL import Image, UnidentifiedImageError

from .models import Diagnosis, LabReport, Patient, ReportImage, Visit, VisitStatus


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

# How one uploaded image + its CNN prediction looks as JSON
class ReportImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportImage
        fields = ["id", "image", "predicted_label", "probability", "threshold", "model_version", "uploaded_at"]
        read_only_fields = fields   # images are never edited by hand


# How a lab report looks, and the rules for creating one
class LabReportSerializer(serializers.ModelSerializer):
    images = ReportImageSerializer(many=True, read_only=True)
    technician_name = serializers.CharField(source="technician.name", read_only=True)
    image_count = serializers.SerializerMethodField()
    parasitized_count = serializers.SerializerMethodField()

    class Meta:
        model = LabReport
        fields = [
            "id", "visit", "lab", "technician", "technician_name", "notes",
            "image_count", "parasitized_count", "images", "created_at",
        ]
        # The user only sends "visit" and "notes". The rest is filled in by the server
        read_only_fields = ["id", "lab", "technician", "technician_name", "images", "created_at"]

    def get_image_count(self, obj):
        return obj.images.count()

    # How many images the CNN flagged as parasitized
    def get_parasitized_count(self, obj):
        return obj.images.filter(predicted_label="parasitized").count()

    # A report can only be made for a visit that is waiting for the lab and has no report yet
    def validate_visit(self, visit):
        if visit.status != VisitStatus.SENT_TO_LAB:
            raise serializers.ValidationError("This visit is not waiting for the lab.")
        if hasattr(visit, "lab_report"):
            raise serializers.ValidationError("This visit already has a lab report.")
        return visit

# Checks an uploaded file really is a usable image
def validate_uploaded_image(upload):
    # 1) Not too big
    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    if upload.size > max_bytes:
        raise serializers.ValidationError(f"Image is larger than {settings.MAX_UPLOAD_MB} MB.")
    # 2) Must open as a real image (a renamed text file fails here)
    try:
        with Image.open(upload) as img:
            img.verify()
        upload.seek(0)
        with Image.open(upload) as img:
            fmt, (w, h) = img.format, img.size
    except (UnidentifiedImageError, OSError, SyntaxError):
        raise serializers.ValidationError("File is not a valid image.")
    finally:
        upload.seek(0)
    # 3) Only PNG or JPEG
    if fmt not in settings.ALLOWED_IMAGE_FORMATS:
        raise serializers.ValidationError("Only PNG or JPEG images are accepted.")
    # 4) Not so small that it is useless
    if min(w, h) < settings.MIN_IMAGE_SIDE:
        raise serializers.ValidationError(f"Image is too small (minimum {settings.MIN_IMAGE_SIDE} px per side).")
    return upload


# The data the technician sends when uploading: just one image
class ImageUploadSerializer(serializers.Serializer):
    image = serializers.ImageField()

    def validate_image(self, value):
        return validate_uploaded_image(value)
# How a diagnosis looks when we show it
class DiagnosisSerializer(serializers.ModelSerializer):
    doctor_name = serializers.CharField(source="doctor.name", read_only=True)

    class Meta:
        model = Diagnosis
        fields = ["id", "visit", "lab_report", "doctor", "doctor_name", "result",
                  "agrees_with_prediction", "notes", "created_at"]
        read_only_fields = fields


# What the doctor sends: only these three things
class DiagnosisInputSerializer(serializers.Serializer):
    result = serializers.ChoiceField(choices=["positive", "negative"])
    agrees_with_prediction = serializers.BooleanField()
    notes = serializers.CharField(required=False, allow_blank=True, default="")