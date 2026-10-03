"""Export the backend contracts used by frontend code generation."""

import json
from pathlib import Path

from app.graphql.schema import schema
from app.main import app

frontend_src = Path(__file__).resolve().parents[2] / "Frontend/libs/data-access/src"
(frontend_src / "admin/graphql/schema.graphql").write_text(schema.as_str() + "\n", encoding="utf-8")
(frontend_src / "rest/openapi.json").write_text(
    json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
