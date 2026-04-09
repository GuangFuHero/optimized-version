from typing import Optional
from pydantic import BaseModel


class AttributionResponse(BaseModel):
    source: str
    type: str
    name: str
    license: str
    attribution_text: str
    attribution_url: str
    image_format: str
    commercial_use: bool
    requires_logo: bool
    logo_url: Optional[str]
    notes: Optional[str]
