from rest_framework.permissions import BasePermission

from .models import Role


# Builds a permission that lets in only the roles we list
def role_required(*roles):
    class RolePermission(BasePermission):
        message = "Your role is not allowed to do this."

        def has_permission(self, request, view):
            # Allowed only if logged in AND their role is in the list
            return bool(request.user and request.user.is_authenticated and request.user.role in roles)

    return RolePermission


# Ready-made permissions we can attach to any endpoint
IsNurse = role_required(Role.NURSE)
IsLabTechnician = role_required(Role.LAB_TECHNICIAN)
IsDoctor = role_required(Role.DOCTOR)
IsAdmin = role_required(Role.ADMIN)