import logging
from app.genai.config import settings

log_level = getattr(logging, settings.app.log_level.upper(), logging.INFO)

logger = logging.getLogger("genai")
logger.setLevel(log_level)
