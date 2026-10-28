from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

# The router builds all the URLs for us
router = DefaultRouter()
router.register("patients", views.PatientViewSet, basename="patient")
router.register("visits", views.VisitViewSet, basename="visit")
router.register("lab-reports", views.LabReportViewSet, basename="lab-report")
router.register("labs", views.LabViewSet, basename="lab")
router.register("logs", views.SystemLogViewSet, basename="log")

urlpatterns = [
    path("", include(router.urls)),
]