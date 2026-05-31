"""Pydantic schemas for map tile attribution responses."""

from pydantic import BaseModel, model_validator


class AttributionResponse(BaseModel):
    """Schema for map tile source attribution metadata."""

    source: str
    type: str
    name: str
    license: str
    attribution_text: str
    attribution_url: str
    image_format: str
    commercial_use: bool
    requires_logo: bool
    logo_url: str | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def check_logo_url_when_required(self) -> "AttributionResponse":
        """Raise if requires_logo is True but logo_url is not provided."""
        if self.requires_logo and self.logo_url is None:
            raise ValueError("logo_url must be provided when requires_logo is True")
        return self
