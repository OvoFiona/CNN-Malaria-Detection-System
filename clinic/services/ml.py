import hashlib
import json
import threading

import numpy as np
from django.conf import settings
from PIL import Image

IMG_SIZE = 128        # the model was trained on 128 x 128 images
_model = None         # the loaded model is kept here, so we load it only once
_lock = threading.Lock()


# Raised when the model file cannot be found or loaded
class ModelNotAvailable(Exception):
    pass


# Reads model_config.json (it holds the 0.19 threshold)
def load_config():
    with open(settings.MODEL_CONFIG_PATH) as f:
        return json.load(f)


# Loads the model the first time it is needed, then reuses it
def get_model():
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                if not settings.MODEL_PATH.exists():
                    raise ModelNotAvailable("Model file not found.")
                import tensorflow as tf   # imported here so the site still starts without TensorFlow
                _model = tf.keras.models.load_model(settings.MODEL_PATH)
    return _model


# A short fingerprint of the model file, saved with each prediction
def model_version():
    with open(settings.MODEL_PATH, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()[:12]


# Prepares an image EXACTLY like the training notebook did
def preprocess(fileobj):
    fileobj.seek(0)
    img = Image.open(fileobj).convert("RGB")             # make sure it has 3 colour channels
    img = img.resize((IMG_SIZE, IMG_SIZE), Image.NEAREST)  # resize to 128 x 128 (nearest, like Keras)
    arr = np.asarray(img, dtype="float32") / 255.0        # scale pixel values from 0-255 to 0-1
    return arr[None, ...]                                  # add a batch dimension: shape (1, 128, 128, 3)


# Runs the model on one image and returns the answer
def predict(fileobj):
    threshold = float(load_config()["threshold"])          # 0.19 from your notebook
    batch = preprocess(fileobj)
    probability = float(get_model().predict(batch, verbose=0).ravel()[0])   # a number between 0 and 1
    # At or above the threshold = parasitized
    label = "parasitized" if probability >= threshold else "uninfected"
    return {
        "label": label,
        "probability": probability,
        "threshold": threshold,
        "model_version": model_version(),
    }