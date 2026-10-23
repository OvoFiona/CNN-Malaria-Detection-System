from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from clinic.audit import log_action

from .models import User
from .permissions import IsAdmin
from .serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    UserSerializer,
    UserWriteSerializer,
)

# Runs when someone sends their email and password to log in
class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if not serializer.is_valid():
            log_action(None, "LOGIN_FAILED", f"email={str(request.data.get('email', ''))[:150]}")
            return Response({"detail": "Invalid email or password."}, status=status.HTTP_400_BAD_REQUEST)
        user = serializer.validated_data["user"]
        token, _ = Token.objects.get_or_create(user=user)
        log_action(user, "LOGIN")
        return Response({"token": token.key, "user": UserSerializer(user).data})


# Returns the logged-in user's details
class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)


# Admin-only account management: list, view, create, edit
class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    permission_classes = [IsAdmin]
    # No "delete": accounts are deactivated instead, so history keeps its links
    http_method_names = ["get", "post", "patch", "put", "head", "options"]

    # Show with UserSerializer, create/edit with UserWriteSerializer
    def get_serializer_class(self):
        return UserSerializer if self.action in ("list", "retrieve") else UserWriteSerializer

    def perform_create(self, serializer):
        user = serializer.save()
        log_action(self.request.user, "CREATE_USER", f"user_id={user.pk} role={user.role}")

    def perform_update(self, serializer):
        user = serializer.save()
        # A deactivated user is logged out immediately: their token is removed
        if not user.is_active:
            Token.objects.filter(user=user).delete()
        log_action(self.request.user, "UPDATE_USER", f"user_id={user.pk} active={user.is_active} role={user.role}")

# Logs the user out by removing their token
class LogoutView(APIView):
    def post(self, request):
        log_action(request.user, "LOGOUT")
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)   # 204 = done, nothing to send back


# Lets a logged-in user change their own password
class ChangePasswordView(APIView):
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])   # hashes it
        request.user.save()
        # Remove the token so every old login stops working
        Token.objects.filter(user=request.user).delete()
        log_action(request.user, "CHANGE_PASSWORD")
        return Response({"detail": "Password changed. Please log in again."})

# Step 1: the user asks for a reset link
class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(email__iexact=serializer.validated_data["email"], is_active=True).first()
        if user:
            uid = urlsafe_base64_encode(force_bytes(user.pk))          # the user's id, encoded
            token = default_token_generator.make_token(user)          # a one-time code
            link = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"
            send_mail(
                "Reset your Malaria Diagnosis System password",
                f"Hello {user.name},\n\nUse this link to reset your password:\n{link}\n\n"
                "If you did not request this, you can ignore this email.",
                settings.DEFAULT_FROM_EMAIL,
                [user.email],
            )
            log_action(user, "PASSWORD_RESET_REQUESTED")
        # The SAME answer whether or not the email exists
        return Response({"detail": "If that email is registered, a reset link has been sent."})


# Step 2: the user submits the code from the email together with a new password
class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        # Find the user from the encoded id
        try:
            user = User.objects.get(pk=force_str(urlsafe_base64_decode(data["uid"])))
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            user = None
        # The code must be valid and not used or expired
        if user is None or not default_token_generator.check_token(user, data["token"]):
            return Response({"detail": "This reset link is invalid or has expired."},
                            status=status.HTTP_400_BAD_REQUEST)
        # The new password must follow the password rules
        try:
            validate_password(data["new_password"], user)
        except DjangoValidationError as exc:
            return Response({"new_password": list(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(data["new_password"])
        user.save()
        Token.objects.filter(user=user).delete()      # log out any old sessions
        log_action(user, "PASSWORD_RESET_COMPLETED")
        return Response({"detail": "Password has been reset. You can now log in."})