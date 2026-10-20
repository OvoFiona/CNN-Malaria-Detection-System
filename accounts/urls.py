from django.urls import path

from . import views

# Each line connects a web address to a view
urlpatterns = [
    path("auth/login/", views.LoginView.as_view(), name="login"),
    path("auth/me/", views.MeView.as_view(), name="me"),
    path("users/", views.UserListView.as_view(), name="user-list"),
]