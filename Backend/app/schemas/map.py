from typing import Optional
from pydantic import BaseModel, model_validator


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
    logo_url: Optional[str] = None
    notes: Optional[str] = None

    @model_validator(mode="after")
    def check_logo_url_when_required(self) -> "AttributionResponse":
        if self.requires_logo and self.logo_url is None:
            raise ValueError("logo_url must be provided when requires_logo is True")
        return self
