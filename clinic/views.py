from django.db.models import Q
from rest_framework import mixins, status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import Role
from accounts.permissions import IsNurse, IsNurseOrAdmin

from .models import Patient, Visit
from .serializers import PatientSerializer, VisitCreateSerializer, VisitSerializer


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


# Visits: create, list, view one. No edit or delete here, the status changes through the workflow
class VisitViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):

    # Use the "create" serializer when adding, the "show" serializer otherwise
    def get_serializer_class(self):
        return VisitCreateSerializer if self.action == "create" else VisitSerializer

    # Only a nurse may create a visit. Anyone logged in may look
    def get_permissions(self):
        if self.action == "create":
            return [IsNurse()]
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