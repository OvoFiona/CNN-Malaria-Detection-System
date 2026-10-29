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
from .models import Diagnosis, DiagnosisCorrection, Lab, LabReport, Patient, ReportImage, SystemLog, Visit, VisitStatus
from .serializers import (
    DiagnosisCorrectionInputSerializer,
    DiagnosisInputSerializer,
    DiagnosisSerializer,
    ImageUploadSerializer,
    LabSerializer,
    LabReportSerializer,
    PatientSerializer,
    ReportImageSerializer,
    SystemLogSerializer,
    VisitCreateSerializer,
    VisitSerializer,
)
from .exports import excel_response, filter_by_range, local_naive, read_date_range
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

    # Record who corrected a patient's name or age
    def perform_update(self, serializer):
        patient = serializer.save()
        log_action(self.request.user, "UPDATE_PATIENT", f"patient_id={patient.pk}")


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
        if self.action == "export":
            return [IsAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        visits = Visit.objects.select_related("patient", "lab", "nurse", "lab_report", "diagnosis").prefetch_related("diagnosis__corrections")
        if self.request.user.role == Role.NURSE:
            visits = visits.filter(nurse=self.request.user)
        params = self.request.query_params
        if params.get("status"):
            visits = visits.filter(status=params["status"])
        # /api/visits/?patient=3   one patient's history
        if params.get("patient", "").isdigit():
            visits = visits.filter(patient_id=int(params["patient"]))
        # /api/visits/?search=jane   patient name or number
        term = params.get("search", "").strip()
        if term:
            match = Q(patient__name__icontains=term)
            if term.isdigit():
                match |= Q(patient_id=int(term))
            visits = visits.filter(match)
        # /api/visits/?result=positive   the doctor's answer     /api/visits/?overruled=1   scan overruled
        if params.get("result") in ("positive", "negative"):
            visits = visits.filter(diagnosis__result=params["result"])
        if params.get("overruled") == "1":
            visits = visits.filter(diagnosis__agrees_with_prediction=False)
        # /api/visits/?date_from=2026-10-01&date_to=2026-10-28   by visit date
        date_from, date_to = read_date_range(self.request)
        return filter_by_range(visits, "visit_date", date_from, date_to, has_time=False)

    def perform_create(self, serializer):
        visit = serializer.save(nurse=self.request.user)
        log_action(self.request.user, "CREATE_VISIT", f"visit_id={visit.pk} patient_id={visit.patient_id}")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(VisitSerializer(serializer.instance).data, status=status.HTTP_201_CREATED)

    # GET /api/visits/export/  : admin only. The same filters, as an Excel file (not paged)
    @action(detail=False, methods=["get"], url_path="export", pagination_class=None)
    def export(self, request):
        visits = self.get_queryset().prefetch_related("lab_report__images")
        date_from, date_to = read_date_range(request)
        stages = dict(VisitStatus.choices)

        def rows():
            for v in visits.iterator(chunk_size=500):
                images = list(v.lab_report.images.all()) if hasattr(v, "lab_report") else []
                flagged = sum(1 for im in images if im.predicted_label == "parasitized")
                d = getattr(v, "diagnosis", None)
                yield [
                    v.visit_date, v.patient.patient_number, v.patient.name, v.patient.age,
                    v.nurse.name, v.lab.name,
                    float(v.temperature) if v.temperature is not None else None, v.heart_rate,
                    v.blood_pressure, v.symptoms, stages.get(v.status, v.status),
                    len(images), flagged, ("positive" if flagged else "negative") if images else "",
                    d.result if d else "", ("Yes" if not d.agrees_with_prediction else "No") if d else "",
                    d.doctor.name if d else "", d.notes if d else "",
                    d.corrections.count() if d else None, local_naive(d.created_at) if d else None,
                ]

        response = excel_response(
            "Records",
            ["Visit date", "Patient no.", "Patient", "Age", "Nurse", "Lab", "Temperature (C)", "Heart rate",
             "Blood pressure", "Symptoms", "Stage", "Images scanned", "Images flagged parasitized", "Scan says",
             "Diagnosis", "Overruled scan", "Doctor", "Doctor's notes", "Times corrected", "Diagnosed on"],
            rows(),
            "clinic-records.xlsx",
            info=[("Search", request.query_params.get("search") or "none"),
                  ("Stage", request.query_params.get("status") or "All stages"),
                  ("Diagnosis", request.query_params.get("result") or "Any"),
                  ("Overruled scans only", "Yes" if request.query_params.get("overruled") == "1" else "No"),
                  ("Visits from", str(date_from or "the beginning")), ("Visits to", str(date_to or "today"))],
        )
        log_action(request.user, "EXPORT_RECORDS", f"from={date_from} to={date_to}")
        return response

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
# LABS (admin only): the list fills the "Lab" drop-down when creating staff
# ---------------------------------------------------------------
class LabViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    queryset = Lab.objects.order_by("name")
    serializer_class = LabSerializer
    permission_classes = [IsAdmin]
    pagination_class = None          # there are only a few labs, send them all at once

    def perform_create(self, serializer):
        lab = serializer.save()
        log_action(self.request.user, "CREATE_LAB", f"lab_id={lab.pk} name={lab.name}")


# ---------------------------------------------------------------
# AUDIT LOG (admin only, read only)
# ---------------------------------------------------------------
class SystemLogViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = SystemLog.objects.select_related("actor")
    serializer_class = SystemLogSerializer
    permission_classes = [IsAdmin]

    # Optional filters:  /api/logs/?action=LOGIN_FAILED&date_from=2026-10-01&date_to=2026-10-28
    def get_queryset(self):
        rows = super().get_queryset()
        wanted = self.request.query_params.get("action")
        if wanted:
            rows = rows.filter(action=wanted)
        date_from, date_to = read_date_range(self.request)
        return filter_by_range(rows, "logged_at", date_from, date_to)

    # GET /api/logs/export/  : the same filters, as an Excel file (not paged)
    @action(detail=False, methods=["get"], url_path="export", pagination_class=None)
    def export(self, request):
        rows = self.get_queryset()
        date_from, date_to = read_date_range(request)
        roles = dict(Role.choices)
        response = excel_response(
            "Activity logs",
            ["When", "Who", "Role", "Action", "Details"],
            ([local_naive(r.logged_at), r.actor.name if r.actor else "Not signed in",
              roles.get(r.actor_role, r.actor_role), r.action, r.description] for r in rows.iterator()),
            "activity-logs.xlsx",
            info=[("Action filter", request.query_params.get("action") or "All actions"),
                  ("From", str(date_from or "the beginning")), ("To", str(date_to or "today"))],
        )
        log_action(request.user, "EXPORT_LOGS", f"from={date_from} to={date_to}")   # logged AFTER the file is built
        return response