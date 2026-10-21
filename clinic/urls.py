from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

# The router builds all the URLs for us
router = DefaultRouter()
router.register("patients", views.PatientViewSet, basename="patient")
router.register("visits", views.VisitViewSet, basename="visit")
router.register("lab-reports", views.LabReportViewSet, basename="lab-report")

urlpatterns = [
    path("", include(router.urls)),
]