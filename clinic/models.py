from django.conf import settings
from django.db import models
from django.utils import timezone

# One class = one database table. This table stores the labs (e.g. "Kisumu Central Lab")
class Lab(models.Model):
    # Short text columns, limited in length
    name = models.CharField(max_length=100)
    location = models.CharField(max_length=150)

    # Filled in automatically when the row is first created
    created_at = models.DateTimeField(auto_now_add=True)
    # Updated automatically every time the row is saved
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # When we list labs, sort them by name
        ordering = ["name"]

    # How a lab is shown on screen: just its name
    def __str__(self):
        return self.name

# One row per person who comes to the clinic
class Patient(models.Model):
    name = models.CharField(max_length=100)
    age = models.PositiveSmallIntegerField()   # whole number, never negative
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Newest patients first
        ordering = ["-created_at"]

    # A patient number like 00001, made from the row id (not stored, just calculated)
    @property
    def patient_number(self):
        return f"{self.pk:05d}"

    def __str__(self):
        return f"{self.patient_number} {self.name}"

# The three stages a visit moves through. Left = saved in database, right = shown on screen
class VisitStatus(models.TextChoices):
    SENT_TO_LAB = "sent_to_lab", "Sent to lab"
    SENT_TO_DOCTOR = "sent_to_doctor", "Sent to doctor"
    DIAGNOSED = "diagnosed", "Diagnosed"


# One row per trip to the clinic
class Visit(models.Model):
    # Links to other tables. PROTECT = you cannot delete a patient/lab/nurse who has visits
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="visits")
    lab = models.ForeignKey(Lab, on_delete=models.PROTECT, related_name="visits")
    nurse = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="visits_attended")

    visit_date = models.DateField(default=timezone.localdate)   # today's date unless told otherwise

    # Vitals recorded by the nurse (optional, so they may be left empty)
    temperature = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)  # degrees Celsius
    heart_rate = models.PositiveSmallIntegerField(null=True, blank=True)                       # beats per minute
    blood_pressure = models.CharField(max_length=20, blank=True)                               # e.g. "120/80"
    symptoms = models.TextField(blank=True)

    # Where this visit is in the workflow. A new visit always starts as "sent to lab"
    status = models.CharField(max_length=20, choices=VisitStatus.choices, default=VisitStatus.SENT_TO_LAB)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        # Makes searching by status fast (the lab and doctor screens filter by it)
        indexes = [models.Index(fields=["status"])]

    def __str__(self):
        return f"Visit {self.pk} - {self.patient.name} ({self.status})"

    
# One report per visit, written by the lab technician
class LabReport(models.Model):
    # OneToOne = a visit can have only ONE lab report (and a report belongs to one visit)
    visit = models.OneToOneField(Visit, on_delete=models.CASCADE, related_name="lab_report")
    lab = models.ForeignKey(Lab, on_delete=models.PROTECT, related_name="lab_reports")
    # The lab technician who made the report
    technician = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="lab_reports")
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Lab report {self.pk} for visit {self.visit_id}"

    # The two answers the CNN can give
class PredictionLabel(models.TextChoices):
    PARASITIZED = "parasitized", "Parasitized"
    UNINFECTED = "uninfected", "Uninfected"


# Decides where an uploaded image is saved. We build our own file name,
# so a user-chosen name can never cause trouble
def report_image_path(instance, filename):
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "png"
    return f"smears/{timezone.now():%Y/%m}/report_{instance.report_id}_{timezone.now():%H%M%S%f}.{ext}"


# One uploaded image + the CNN's prediction for it
class ReportImage(models.Model):
    # CASCADE = if a report is deleted, its images go with it
    report = models.ForeignKey(LabReport, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to=report_image_path)

    predicted_label = models.CharField(max_length=12, choices=PredictionLabel.choices)
    probability = models.FloatField(help_text="Model probability that the cell is parasitized (0-1).")
    threshold = models.FloatField(help_text="Decision threshold used for this prediction.")
    model_version = models.CharField(max_length=64)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["uploaded_at"]

# The two possible final results
class DiagnosisResult(models.TextChoices):
    POSITIVE = "positive", "Malaria positive"
    NEGATIVE = "negative", "Malaria negative"


# The doctor's final decision for a visit
class Diagnosis(models.Model):
    # One diagnosis per visit and per lab report
    visit = models.OneToOneField(Visit, on_delete=models.CASCADE, related_name="diagnosis")
    lab_report = models.OneToOneField(LabReport, on_delete=models.PROTECT, related_name="diagnosis")
    # A normal link (NOT one-to-one): one doctor can diagnose many visits
    doctor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="diagnoses")
    result = models.CharField(max_length=10, choices=DiagnosisResult.choices)
    # True = the doctor confirmed the CNN's finding; False = the doctor overruled it
    agrees_with_prediction = models.BooleanField()
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

# One row every time a doctor CORRECTS a diagnosis.
# It keeps what the diagnosis said BEFORE the correction, so the history is never lost.
class DiagnosisCorrection(models.Model):
    diagnosis = models.ForeignKey(Diagnosis, on_delete=models.CASCADE, related_name="corrections")
    corrected_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="diagnosis_corrections")
    # the old values (the new values live on the Diagnosis itself)
    previous_result = models.CharField(max_length=10, choices=DiagnosisResult.choices)
    previous_agrees_with_prediction = models.BooleanField()
    previous_notes = models.TextField(blank=True)
    reason = models.TextField()                      # why the doctor changed it (required)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

# One row for every important action in the system (the audit trail)
class SystemLog(models.Model):
    # Who did it. Kept even if the user is later removed (SET_NULL)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="log_entries")
    actor_role = models.CharField(max_length=20, blank=True)   # their role at that moment
    action = models.CharField(max_length=100)                  # e.g. LOGIN, CREATE_VISIT
    description = models.TextField(blank=True)                 # extra detail, e.g. visit_id=3
    logged_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-logged_at"]    # newest first
        indexes = [models.Index(fields=["action"])]