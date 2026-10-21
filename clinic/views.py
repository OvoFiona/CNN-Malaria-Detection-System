from django.db import transaction
from django.db.models import Q
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import Role
from accounts.permissions import IsDoctor, IsLabStaffOrDoctor, IsLabTechnician, IsNurse, IsNurseOrAdmin

from .models import Diagnosis, LabReport, Patient, ReportImage, Visit, VisitStatus
from .serializers import (
    DiagnosisInputSerializer,
    DiagnosisSerializer,
    ImageUploadSerializer,
    LabReportSerializer,
    PatientSerializer,
    ReportImageSerializer,
    VisitCreateSerializer,
    VisitSerializer,
)
from .services import ml


# ---------------------------------------------------------------
# PATIENTS
# ---------------------------------------------------------------
class PatientViewSet(viewsets.ModelViewSet):
    serializer_class = PatientSerializer
    # No "delete": patient records are never removed
    http_method_names = ["get", "post", "patch", "put", "head", "options"]

    # Supports  /api/patients/?search=jane
    def get_queryset(self):
        patients = Patient.objects.all()
        term = self.request.query_params.get("search", "").strip()
        if term:
            match = Q(name__icontains=term)       # name contains the text
            if term.isdigit():
                match |= Q(pk=int(term))          # or the number matches
            patients = patients.filter(match)
        return patients

    # Anyone logged in may look. Only nurse or admin may add or change
    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        return [IsNurseOrAdmin()]


# ---------------------------------------------------------------
# VISITS
# ---------------------------------------------------------------
class VisitViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):

    # Use the "create" serializer when adding, the "show" serializer otherwise
    def get_serializer_class(self):
        return VisitCreateSerializer if self.action == "create" else VisitSerializer

    # Only a nurse creates a visit, only a doctor diagnoses. Anyone logged in may look
    def get_permissions(self):
        if self.action == "create":
            return [IsNurse()]
        if self.action == "diagnosis":
            return [IsDoctor()]
        return [IsAuthenticated()]

    def get_queryset(self):
        visits = Visit.objects.select_related("patient", "lab", "nurse")
        # A nurse only sees visits she registered herself
        if self.request.user.role == Role.NURSE:
            visits = visits.filter(nurse=self.request.user)
        # Optional filter:  /api/visits/?status=sent_to_lab
        wanted = self.request.query_params.get("status")
        if wanted:
            visits = visits.filter(status=wanted)
        return visits

    # The nurse is NOT sent by the user: we take it from the token
    def perform_create(self, serializer):
        serializer.save(nurse=self.request.user)

    # After saving, answer with the full "show" version of the visit
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(VisitSerializer(serializer.instance).data, status=status.HTTP_201_CREATED)

    # POST /api/visits/<id>/diagnosis/  : the doctor records her decision
    @action(detail=True, methods=["post"])
    @transaction.atomic     # both changes below succeed together or not at all
    def diagnosis(self, request, pk=None):
        visit = self.get_object()
        # Only visits the lab has sent to the doctor can be diagnosed
        if visit.status != VisitStatus.SENT_TO_DOCTOR:
            raise ValidationError("This visit is not waiting for a doctor's diagnosis.")

        # Check what the doctor sent (result, agrees_with_prediction, notes)
        data = DiagnosisInputSerializer(data=request.data)
        data.is_valid(raise_exception=True)

        # Save the diagnosis
        diagnosis = Diagnosis.objects.create(
            visit=visit,
            lab_report=visit.lab_report,
            doctor=request.user,          # the doctor comes from the token
            **data.validated_data,
        )
        # Close the case
        visit.status = VisitStatus.DIAGNOSED
        visit.save(update_fields=["status", "updated_at"])
        return Response(DiagnosisSerializer(diagnosis).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------
# LAB REPORTS
# ---------------------------------------------------------------
class LabReportViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = LabReportSerializer

    # Only a lab technician creates reports and uploads images. Lab staff and doctors may read them
    def get_permissions(self):
        if self.action in ("create", "images", "refer"):
            return [IsLabTechnician()]
        return [IsLabStaffOrDoctor()]

    def get_queryset(self):
        return LabReport.objects.select_related("visit", "technician").prefetch_related("images")

    # Technician and lab come from the token and the visit, not from what the user sends
    def perform_create(self, serializer):
        visit = serializer.validated_data["visit"]
        serializer.save(technician=self.request.user, lab=visit.lab)

    # POST /api/lab-reports/<id>/images/  : upload one image, run the CNN, save the result
    @action(detail=True, methods=["post"])
    def images(self, request, pk=None):
        report = self.get_object()
        # Once the report is sent to the doctor, it is closed
        if report.visit.status != VisitStatus.SENT_TO_LAB:
            raise ValidationError("This report has already been sent to the doctor.")

        upload = ImageUploadSerializer(data=request.data)
        upload.is_valid(raise_exception=True)
        file = upload.validated_data["image"]

        # Ask the CNN. If the model files are missing, answer 503 (service unavailable)
        try:
            result = ml.predict(file)
        except ml.ModelNotAvailable as exc:
            return Response({"detail": f"Prediction model is not available: {exc}"},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)

        # Save the image together with what the model said
        image = ReportImage.objects.create(
            report=report,
            image=file,
            predicted_label=result["label"],
            probability=result["probability"],
            threshold=result["threshold"],
            model_version=result["model_version"],
        )
        return Response(ReportImageSerializer(image, context={"request": request}).data,
                        status=status.HTTP_201_CREATED)

    # POST /api/lab-reports/<id>/refer/  : the technician sends the report to the doctor
    @action(detail=True, methods=["post"])
    def refer(self, request, pk=None):
        report = self.get_object()
        if report.visit.status != VisitStatus.SENT_TO_LAB:
            raise ValidationError("This report has already been sent to the doctor.")
        # A report with nothing to look at cannot go to the doctor
        if not report.images.exists():
            raise ValidationError("Upload at least one image before sending the report to the doctor.")
        # Move the visit to the next stage of the workflow
        report.visit.status = VisitStatus.SENT_TO_DOCTOR
        report.visit.save(update_fields=["status", "updated_at"])
        return Response(LabReportSerializer(report, context={"request": request}).data)