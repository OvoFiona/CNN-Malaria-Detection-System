from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

# The router builds all the patient URLs for us
router = DefaultRouter()
router.register("patients", views.PatientViewSet, basename="patient")

urlpatterns = [
    path("", include(router.urls)),
]