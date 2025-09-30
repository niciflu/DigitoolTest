CORS preflight must be adapted from version used on the localhost.

Line 26
- app = FastAPI(title="Digitool GRB API")
+ app = FastAPI(title="Digitool GRB API", redirect_slashes=False)

Line 29 - 34
- app.add_middleware(
-     CORSMiddleware,
-     allow_origins=["*"],  # tighten later
-     allow_methods=["*"],
-     allow_headers=["*"],
- )
+ app.add_middleware(
+     CORSMiddleware,
+     allow_origins=[
+         "https://digitool.onrender.com",  # prod frontend
+         "http://localhost:5173",          # dev (vite) optional
+         "http://localhost:3000",          # dev (next) optional
+     ],
+     allow_methods=["POST", "OPTIONS"],
+     allow_headers=["Content-Type", "Authorization"],
+     allow_credentials=False,  # set True only if you use cookies/auth
+ )

Before @app.post("/api/grb/run")
+ from fastapi import Response
+
+ @app.options("/api/grb/run")
+ def cors_preflight_run() -> Response:
+     # CORSMiddleware will attach the proper CORS headers.
+     return Response(status_code=204)
