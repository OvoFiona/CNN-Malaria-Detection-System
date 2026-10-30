# Who may see which patients, visits and reports.
# One rule for every screen: staff only see what happens in THE LAB THEY WORK IN.
# Admins see everything. Someone with no lab assigned sees nothing (the admin must set their lab).
from accounts.models import Role
from django.db.models import Q

from .models import Patient

# Roles that belong to one lab
LAB_BOUND_ROLES = (Role.NURSE, Role.LAB_TECHNICIAN, Role.DOCTOR)


def is_lab_bound(user):
    return user.role in LAB_BOUND_ROLES


def patients_for(user):
    patients = Patient.objects.all()
    if not is_lab_bound(user):
        return patients                                   # admin: everyone
    if not user.lab_id:
        return patients.none()
    if user.role == Role.NURSE:
        # patients she (or a colleague) registered at her lab, plus anyone who has a visit there
        return patients.filter(Q(lab_id=user.lab_id) | Q(visits__lab_id=user.lab_id)).distinct()
    # technician / doctor: patients who have a visit at their lab
    return patients.filter(visits__lab_id=user.lab_id).distinct()