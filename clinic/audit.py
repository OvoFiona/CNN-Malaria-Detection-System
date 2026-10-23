from .models import SystemLog


# Writes one row in the audit log. "user" can be None (for example a failed login)
def log_action(user, action, description=""):
    logged_in = user is not None and getattr(user, "is_authenticated", False)
    SystemLog.objects.create(
        actor=user if logged_in else None,
        actor_role=user.role if logged_in else "",
        action=action,
        description=description,
    )