from django.db import transaction
from django.db.models import Q
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import Role
from accounts.permissions import IsAdmin, IsDoctor, IsLabStaffOrDoctor, IsLabTechnician, IsNurse, IsNurseOrAdmin

from .audit import log_action
from .models import Diagnosis, DiagnosisCorrection, LabReport, Patient, ReportImage, SystemLog, Visit, VisitStatus
from .serializers import (
    DiagnosisCorrectionInputSerializer,
    DiagnosisInputSerializer,
    DiagnosisSerializer,
    ImageUploadSerializer,
    LabReportSerializer,
    PatientSerializer,
    ReportImageSerializer,
    SystemLogSerializer,
    VisitCreateSerializer,
    VisitSerializer,
)
from .services import ml


# ---------------------------------------------------------------
# PATIENTS
# ---------------------------------------------------------------
class PatientViewSet(viewsets.ModelViewSet):
    serializer_class = PatientSerializer
    http_method_names = ["get", "post", "patch", "put", "head", "options"]

    def get_queryset(self):
        patients = Patient.objects.all()
        term = self.request.query_params.get("search", "").strip()
        if term:
            match = Q(name__icontains=term)
            if term.isdigit():
                match |= Q(pk=int(term))
            patients = patients.filter(match)
        return patients

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        return [IsNurseOrAdmin()]

    # Record who registered the patient
    def perform_create(self, serializer):
        patient = serializer.save()
        log_action(self.request.user, "CREATE_PATIENT", f"patient_id={patient.pk}")


# ---------------------------------------------------------------
# VISITS
# ---------------------------------------------------------------
class VisitViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):

    def get_serializer_class(self):
        return VisitCreateSerializer if self.action == "create" else VisitSerializer

    def get_permissions(self):
        if self.action == "create":
            return [IsNurse()]
        if self.action in ("diagnosis", "correct_diagnosis"):
            return [IsDoctor()]
        return [IsAuthenticated()]

    def get_queryset(self):
        visits = Visit.objects.select_related("patient", "lab", "nurse", "lab_report", "diagnosis").prefetch_related("diagnosis__corrections")
        if self.request.user.role == Role.NURSE:
            visits = visits.filter(nurse=self.request.user)
        wanted = self.request.query_params.get("status")
        if wanted:
            visits = visits.filter(status=wanted)
        return visits

    def perform_create(self, serializer):
        visit = serializer.save(nurse=self.request.user)
        log_action(self.request.user, "CREATE_VISIT", f"visit_id={visit.pk} patient_id={visit.patient_id}")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(VisitSerializer(serializer.instance).data, status=status.HTTP_201_CREATED)

    # POST /api/visits/<id>/diagnosis/  : the doctor records her decision
    @action(detail=True, methods=["post"])
    @transaction.atomic
    def diagnosis(self, request, pk=None):
        visit = self.get_object()
        if visit.status != VisitStatus.SENT_TO_DOCTOR:
            raise ValidationError("This visit is not waiting for a doctor's diagnosis.")

        data = DiagnosisInputSerializer(data=request.data)
        data.is_valid(raise_exception=True)

        diagnosis = Diagnosis.objects.create(
            visit=visit,
            lab_report=visit.lab_report,
            doctor=request.user,
            **data.validated_data,
        )
        visit.status = VisitStatus.DIAGNOSED
        visit.save(update_fields=["status", "updated_at"])
        log_action(request.user, "CREATE_DIAGNOSIS", f"visit_id={visit.pk} result={diagnosis.result}")
        return Response(DiagnosisSerializer(diagnosis).data, status=status.HTTP_201_CREATED)

    # POST /api/visits/<id>/correct-diagnosis/  : the doctor fixes a saved diagnosis.
    # The old values are kept in DiagnosisCorrection, so nothing is ever lost.
    @action(detail=True, methods=["post"], url_path="correct-diagnosis")
    @transaction.atomic
    def correct_diagnosis(self, request, pk=None):
        visit = self.get_object()
        diagnosis = getattr(visit, "diagnosis", None)
        if diagnosis is None:
            raise ValidationError("This visit has no diagnosis to correct yet.")

        data = DiagnosisCorrectionInputSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        new = data.validated_data

        if (new["result"], new["agrees_with_prediction"], new["notes"]) == (
            diagnosis.result, diagnosis.agrees_with_prediction, diagnosis.notes
        ):
            raise ValidationError("Nothing was changed. Change the result or the notes to make a correction.")

        # 1) keep the old values
        correction = DiagnosisCorrection.objects.create(
            diagnosis=diagnosis,
            corrected_by=request.user,
            previous_result=diagnosis.result,
            previous_agrees_with_prediction=diagnosis.agrees_with_prediction,
            previous_notes=diagnosis.notes,
            reason=new["reason"],
        )
        # 2) put the new values on the diagnosis
        diagnosis.result = new["result"]
        diagnosis.agrees_with_prediction = new["agrees_with_prediction"]
        diagnosis.notes = new["notes"]
        diagnosis.save()
        log_action(request.user, "CORRECT_DIAGNOSIS",
                   f"visit_id={visit.pk} {correction.previous_result} -> {diagnosis.result}")
        # load it fresh, so the history we send back includes the correction we just made
        fresh = Diagnosis.objects.prefetch_related("corrections").get(pk=diagnosis.pk)
        return Response(DiagnosisSerializer(fresh).data)


# ---------------------------------------------------------------
# LAB REPORTS
# ---------------------------------------------------------------
class LabReportViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = LabReportSerializer

    def get_permissions(self):
        if self.action in ("create", "images", "refer"):
            return [IsLabTechnician()]
        return [IsLabStaffOrDoctor()]

    def get_queryset(self):
        return LabReport.objects.select_related("visit", "technician").prefetch_related("images")

    def perform_create(self, serializer):
        visit = serializer.validated_data["visit"]
        report = serializer.save(technician=self.request.user, lab=visit.lab)
        log_action(self.request.user, "CREATE_LAB_REPORT", f"report_id={report.pk} visit_id={visit.pk}")

    # POST /api/lab-reports/<id>/images/  : upload one image, run the CNN, save the result
    @action(detail=True, methods=["post"])
    def images(self, request, pk=None):
        report = self.get_object()
        if report.visit.status != VisitStatus.SENT_TO_LAB:
            raise ValidationError("This report has already been sent to the doctor.")

        upload = ImageUploadSerializer(data=request.data)
        upload.is_valid(raise_exception=True)
        file = upload.validated_data["image"]

        try:
            result = ml.predict(file)
        except ml.ModelNotAvailable as exc:
            return Response({"detail": f"Prediction model is not available: {exc}"},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)

        image = ReportImage.objects.create(
            report=report,
            image=file,
            predicted_label=result["label"],
            probability=result["probability"],
            threshold=result["threshold"],
            model_version=result["model_version"],
        )
        log_action(request.user, "UPLOAD_AND_PREDICT",
                   f"report_id={report.pk} image_id={image.pk} label={image.predicted_label}")
        return Response(ReportImageSerializer(image, context={"request": request}).data,
                        status=status.HTTP_201_CREATED)

    # POST /api/lab-reports/<id>/refer/  : the technician sends the report to the doctor
    @action(detail=True, methods=["post"])
    def refer(self, request, pk=None):
        report = self.get_object()
        if report.visit.status != VisitStatus.SENT_TO_LAB:
            raise ValidationError("This report has already been sent to the doctor.")
        if not report.images.exists():
            raise ValidationError("Upload at least one image before sending the report to the doctor.")
        report.visit.status = VisitStatus.SENT_TO_DOCTOR
        report.visit.save(update_fields=["status", "updated_at"])
        log_action(request.user, "SEND_TO_DOCTOR", f"report_id={report.pk} visit_id={report.visit_id}")
        return Response(LabReportSerializer(report, context={"request": request}).data)


# ---------------------------------------------------------------
# AUDIT LOG (admin only, read only)
# ---------------------------------------------------------------
class SystemLogViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = SystemLog.objects.select_related("actor")
    serializer_class = SystemLogSerializer
    permission_classes = [IsAdmin]

    # Optional filter:  /api/logs/?action=LOGIN_FAILED
    def get_queryset(self):
        rows = super().get_queryset()
        wanted = self.request.query_params.get("action")
        return rows.filter(action=wanted) if wanted else rows