from django.db.models import Q
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import IsNurseOrAdmin

from .models import Patient
from .serializers import PatientSerializer


# One class gives us: list, create, view one, and edit patients
class PatientViewSet(viewsets.ModelViewSet):
    serializer_class = PatientSerializer
    # No "delete": patient records are never removed
    http_method_names = ["get", "post", "patch", "put", "head", "options"]

    # Which patients to show. Supports  /api/patients/?search=jane
    def get_queryset(self):
        patients = Patient.objects.all()
        term = self.request.query_params.get("search", "").strip()
        if term:
            match = Q(name__icontains=term)     # name contains the text
            if term.isdigit():
                match |= Q(pk=int(term))        # or the number matches
            patients = patients.filter(match)
        return patients

    # Anyone logged in may look. Only nurse or admin may add or change
    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        return [IsNurseOrAdmin()]