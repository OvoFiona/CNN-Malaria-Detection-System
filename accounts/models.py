from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models


# The four roles. Left side = value saved in the database, right side = label shown on screen
class Role(models.TextChoices):
    NURSE = "nurse", "Nurse"
    LAB_TECHNICIAN = "lab_technician", "Lab technician"
    DOCTOR = "doctor", "Doctor"
    ADMIN = "admin", "System admin"


# The manager knows HOW to create users (Django calls these when we add a user)
class UserManager(BaseUserManager):
    use_in_migrations = True

    # Shared helper that does the actual creating
    def _create(self, email, password, **extra):
        if not email:
            raise ValueError("An email address is required.")
        # Clean the email (lowercase) and build the user object
        user = self.model(email=self.normalize_email(email).lower(), **extra)
        user.set_password(password)  # saves a scrambled hash, never the real password
        user.save(using=self._db)
        return user

    # A normal staff member: nurse by default, no admin powers
    def create_user(self, email, password=None, **extra):
        extra.setdefault("role", Role.NURSE)
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create(email, password, **extra)

    # The super admin (used by the createsuperuser command)
    def create_superuser(self, email, password=None, **extra):
        extra.setdefault("role", Role.ADMIN)
        extra["is_staff"] = True
        extra["is_superuser"] = True
        return self._create(email, password, **extra)


# One login table for everyone. The "role" column replaces separate Nurse/Lab/Doctor tables
class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True, max_length=150)  # unique = no two users share an email
    name = models.CharField(max_length=100)
    # Only the four roles above are allowed in this column
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.NURSE)
    # Which lab this person works in. Optional; if the lab is deleted we keep the user
    lab = models.ForeignKey("clinic.Lab", null=True, blank=True, on_delete=models.SET_NULL, related_name="staff")
    is_active = models.BooleanField(default=True)   # False = account switched off
    is_staff = models.BooleanField(default=False)   # True = may open Django's admin site
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "email"      # people log in with their email, not a username
    REQUIRED_FIELDS = ["name"]    # asked for when creating a superuser

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.get_role_display()})"
    