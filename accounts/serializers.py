from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import Role, User


# Shows a user as JSON. Note: the password is NOT included
class UserSerializer(serializers.ModelSerializer):
    # "Nurse", "Lab technician"... the readable version of the role
    role_display = serializers.CharField(source="get_role_display", read_only=True)

    # the name of the lab this person works in ("" when none)
    lab_name = serializers.CharField(source="lab.name", read_only=True, default="")

    class Meta:
        model = User
        fields = ["id", "email", "name", "role", "role_display", "lab", "lab_name", "is_active"]


# Checks the email + password that someone sends when logging in
class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()

    def validate(self, data):
        user = authenticate(username=data["email"].lower(), password=data["password"])
        # Same message whether the email or the password is wrong, so attackers learn nothing
        if user is None or not user.is_active:
            raise serializers.ValidationError("Invalid email or password.")
        data["user"] = user
        return data


# Used by the admin to CREATE and EDIT accounts
class UserWriteSerializer(serializers.ModelSerializer):
    # write_only = accepted when sent in, never shown back
    password = serializers.CharField(write_only=True, required=False, style={"input_type": "password"})

    class Meta:
        model = User
        fields = ["id", "email", "name", "role", "lab", "is_active", "password"]

    # Emails are stored in lowercase and must be unique
    def validate_email(self, value):
        value = value.lower()
        taken = User.objects.filter(email__iexact=value)
        if self.instance:
            taken = taken.exclude(pk=self.instance.pk)   # editing yourself is fine
        if taken.exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate(self, attrs):
        # A new account must come with a password
        if self.instance is None and not attrs.get("password"):
            raise serializers.ValidationError({"password": "A password is required for a new account."})
        # Apply Django's password rules (length, not too common, not all digits...)
        if attrs.get("password"):
            validate_password(attrs["password"])
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        # Only admins may open Django's own admin site
        validated_data["is_staff"] = validated_data.get("role") == Role.ADMIN
        return User.objects.create_user(password=password, **validated_data)

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        user = super().update(instance, validated_data)
        if password:
            user.set_password(password)    # hashes it
            user.save()
        return user

# Used when a logged-in user changes their own password
class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField()
    new_password = serializers.CharField()

    # The old password must be correct
    def validate_old_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    # The new password must pass Django's password rules
    def validate_new_password(self, value):
        validate_password(value, self.context["request"].user)
        return value

# Step 1 of a reset: the user enters their email
class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


# Step 2: the user comes back from the email link with the code in it, and chooses a new password
class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()            # which user (encoded)
    token = serializers.CharField()          # one-time proof that the email was received
    new_password = serializers.CharField()