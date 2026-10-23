from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

# The router builds the /users/ URLs (list, create, view one, edit)
router = DefaultRouter()
router.register("users", views.UserViewSet, basename="user")

urlpatterns = [
    path("auth/login/", views.LoginView.as_view(), name="login"),
    path("auth/me/", views.MeView.as_view(), name="me"),
    path("", include(router.urls)),
    path("auth/logout/", views.LogoutView.as_view(), name="logout"),
    path("auth/change-password/", views.ChangePasswordView.as_view(), name="change-password"),
    path("auth/password-reset/", views.PasswordResetRequestView.as_view(), name="password-reset"),
    path("auth/password-reset/confirm/", views.PasswordResetConfirmView.as_view(), name="password-reset-confirm"),
]