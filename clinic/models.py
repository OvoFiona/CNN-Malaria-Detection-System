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