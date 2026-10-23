from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from clinic.audit import log_action

from .models import User
from .permissions import IsAdmin
from .serializers import LoginSerializer, UserSerializer


# Runs when someone sends their email and password to log in
class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if not serializer.is_valid():
            # Record the failed attempt (no password is ever written to the log)
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


# Lists all users. Only a system admin may see this
class UserListView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        users = User.objects.all()
        return Response(UserSerializer(users, many=True).data)