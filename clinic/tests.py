import io
import shutil
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework.test import APITestCase

from accounts.models import Role, User
from clinic.models import Lab, SystemLog

# Uploaded test images go into a temporary folder, not into your real media/ folder
TEMP_MEDIA = tempfile.mkdtemp()

# A made-up CNN answer, so the tests do not need TensorFlow or the real model
FAKE_PREDICTION = {
    "label": "parasitized",
    "probability": 0.93,
    "threshold": 0.19,
    "model_version": "test",
    "warning": "",
}


# Makes a small PNG image in memory
def make_png(size=(130, 130)):
    buf = io.BytesIO()
    Image.new("RGB", size, (150, 60, 120)).save(buf, format="PNG")
    buf.seek(0)
    buf.name = "cell.png"
    return buf


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class SystemTests(APITestCase):

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEMP_MEDIA, ignore_errors=True)

    # Runs before EACH test: a fresh lab and one user per role
    def setUp(self):
        self.lab = Lab.objects.create(name="Test Lab", location="Kisumu")
        self.nurse = self.make_user("nurse@test.org", Role.NURSE)
        self.tech = self.make_user("tech@test.org", Role.LAB_TECHNICIAN)
        self.doctor = self.make_user("doctor@test.org", Role.DOCTOR)
        self.admin = self.make_user("admin@test.org", Role.ADMIN)

    def make_user(self, email, role):
        return User.objects.create_user(
            email=email, password="StrongPass#123", name=role, role=role, lab=self.lab
        )

    # Pretend to be this user from now on
    def act_as(self, user):
        self.client.force_authenticate(user=user)

    # The nurse registers a patient and a visit. Returns the visit id
    def new_visit(self):
        self.act_as(self.nurse)
        patient = self.client.post("/api/patients/", {"name": "Jane Achieng", "age": 30}, format="json")
        self.assertEqual(patient.status_code, 201)
        visit = self.client.post("/api/visits/", {
            "patient": patient.json()["id"], "lab": self.lab.pk,
            "temperature": "38.5", "heart_rate": 90, "blood_pressure": "120/80", "symptoms": "fever",
        }, format="json")
        self.assertEqual(visit.status_code, 201)
        self.assertEqual(visit.json()["status"], "sent_to_lab")
        return visit.json()["id"]

    # The technician opens a report for the visit. Returns the report id
    def new_report(self, visit_id):
        self.act_as(self.tech)
        report = self.client.post("/api/lab-reports/", {"visit": visit_id, "notes": "smear"}, format="json")
        self.assertEqual(report.status_code, 201)
        return report.json()["id"]

    # ---------- 1. The whole nurse -> lab -> doctor flow ----------
    @patch("clinic.services.ml.predict", return_value=FAKE_PREDICTION)
    def test_full_workflow(self, _fake):
        visit_id = self.new_visit()
        report_id = self.new_report(visit_id)

        # Technician uploads an image and the (fake) CNN answers
        upload = self.client.post(f"/api/lab-reports/{report_id}/images/", {"image": make_png()}, format="multipart")
        self.assertEqual(upload.status_code, 201)
        self.assertEqual(upload.json()["predicted_label"], "parasitized")

        # Technician sends the report to the doctor
        self.assertEqual(self.client.post(f"/api/lab-reports/{report_id}/refer/").status_code, 200)

        # Doctor records the diagnosis
        self.act_as(self.doctor)
        diagnosis = self.client.post(
            f"/api/visits/{visit_id}/diagnosis/",
            {"result": "positive", "agrees_with_prediction": True}, format="json",
        )
        self.assertEqual(diagnosis.status_code, 201)
        self.assertEqual(self.client.get(f"/api/visits/{visit_id}/").json()["status"], "diagnosed")

        # A second diagnosis for the same visit is refused
        again = self.client.post(
            f"/api/visits/{visit_id}/diagnosis/",
            {"result": "negative", "agrees_with_prediction": False}, format="json",
        )
        self.assertEqual(again.status_code, 400)

        # The audit log recorded the diagnosis
        self.assertTrue(SystemLog.objects.filter(action="CREATE_DIAGNOSIS").exists())

    # ---------- 2. A report with no images cannot be sent ----------
    def test_cannot_refer_without_images(self):
        report_id = self.new_report(self.new_visit())
        self.assertEqual(self.client.post(f"/api/lab-reports/{report_id}/refer/").status_code, 400)

    # ---------- 3. The doctor cannot diagnose before the lab has sent the case ----------
    def test_doctor_cannot_diagnose_too_early(self):
        visit_id = self.new_visit()
        self.act_as(self.doctor)
        response = self.client.post(
            f"/api/visits/{visit_id}/diagnosis/",
            {"result": "positive", "agrees_with_prediction": True}, format="json",
        )
        self.assertEqual(response.status_code, 400)

    # ---------- 4. Roles are enforced ----------
    def test_roles_are_enforced(self):
        self.act_as(self.tech)
        self.assertEqual(self.client.post("/api/visits/", {}, format="json").status_code, 403)
        self.act_as(self.doctor)
        self.assertEqual(self.client.post("/api/patients/", {"name": "X", "age": 5}, format="json").status_code, 403)
        self.act_as(self.nurse)
        self.assertEqual(self.client.get("/api/logs/").status_code, 403)
        self.assertEqual(self.client.get("/api/users/").status_code, 403)

    # ---------- 5. Not logged in = no access ----------
    def test_login_required(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get("/api/patients/").status_code, 401)

    # ---------- 6. A nurse sees only her own visits ----------
    def test_nurse_sees_only_own_visits(self):
        self.new_visit()
        self.act_as(self.nurse)
        self.assertEqual(self.client.get("/api/visits/").json()["count"], 1)
        other_nurse = self.make_user("nurse2@test.org", Role.NURSE)
        self.act_as(other_nurse)
        self.assertEqual(self.client.get("/api/visits/").json()["count"], 0)

    # ---------- 7. Bad uploads are rejected ----------
    @patch("clinic.services.ml.predict", return_value=FAKE_PREDICTION)
    def test_bad_uploads_rejected(self, _fake):
        report_id = self.new_report(self.new_visit())
        url = f"/api/lab-reports/{report_id}/images/"
        not_an_image = SimpleUploadedFile("a.png", b"not an image", content_type="image/png")
        self.assertEqual(self.client.post(url, {"image": not_an_image}, format="multipart").status_code, 400)
        too_small = make_png(size=(10, 10))
        self.assertEqual(self.client.post(url, {"image": too_small}, format="multipart").status_code, 400)

    # ---------- 8. If the model file is missing the answer is 503, not a crash ----------
    def test_missing_model_gives_503(self):
        report_id = self.new_report(self.new_visit())
        with self.settings(MODEL_PATH=Path(TEMP_MEDIA) / "missing.h5"):
            response = self.client.post(
                f"/api/lab-reports/{report_id}/images/", {"image": make_png()}, format="multipart"
            )
        self.assertEqual(response.status_code, 503)

    # ---------- 9. Login rules ----------
    def test_login_and_deactivation(self):
        self.client.force_authenticate(user=None)
        good = {"email": "nurse@test.org", "password": "StrongPass#123"}
        bad = {"email": "nurse@test.org", "password": "wrong"}
        self.assertEqual(self.client.post("/api/auth/login/", good, format="json").status_code, 200)
        self.assertEqual(self.client.post("/api/auth/login/", bad, format="json").status_code, 400)
        self.assertTrue(SystemLog.objects.filter(action="LOGIN_FAILED").exists())   # failed attempt recorded
        # A deactivated account cannot log in even with the right password
        self.nurse.is_active = False
        self.nurse.save()
        self.assertEqual(self.client.post("/api/auth/login/", good, format="json").status_code, 400)