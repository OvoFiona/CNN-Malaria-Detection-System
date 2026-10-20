from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import User
from .permissions import IsAdmin

from .serializers import LoginSerializer, UserSerializer


# Runs when someone sends their email and password to log in
class LoginView(APIView):
    # Login must be open to people who are not logged in yet
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"detail": "Invalid email or password."}, status=status.HTTP_400_BAD_REQUEST)
        user = serializer.validated_data["user"]
        # Get this user's token, or create one the first time they log in
        token, _ = Token.objects.get_or_create(user=user)
        # Send back the token and who the user is
        return Response({"token": token.key, "user": UserSerializer(user).data})

# Returns the logged-in user's details. No login needed here: the token IS the login
class MeView(APIView):
    # No permission_classes line, so the default applies: IsAuthenticated
    def get(self, request):
        # request.user is the person Django found from their token
        return Response(UserSerializer(request.user).data) 

# Lists all users. Only a system admin may see this
class UserListView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        users = User.objects.all()
        return Response(UserSerializer(users, many=True).data)       