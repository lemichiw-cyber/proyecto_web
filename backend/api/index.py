"""Handler de serverless para Vercel (Python runtime).
Expone la app FastAPI de main.py como función serverless vía Mangum.
"""
from mangum import Mangum
from main import app

handler = Mangum(app, lifespan="off")
