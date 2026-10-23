from rest_framework import status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from clinic.audit import log_action

from .models import User
from .permissions import IsAdmin
from .serializers import ChangePasswordSerializer, LoginSerializer, UserSerializer, UserWriteSerializer


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