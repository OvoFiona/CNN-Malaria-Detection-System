from django.contrib.auth import authenticate
from rest_framework import serializers

from .models import User


# Shows a user as JSON. Note: the password is NOT included
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "name", "role", "lab"]


# Checks the email + password that someone sends when logging in
class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()

    def validate(self, data):
        # Django scrambles the typed password and compares it with the stored hash
        user = authenticate(username=data["email"].lower(), password=data["password"])
        # Same message whether the email or the password is wrong, so attackers learn nothing
        if user is None or not user.is_active:
            raise serializers.ValidationError("Invalid email or password.")
        data["user"] = user
        return data