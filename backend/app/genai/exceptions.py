from typing import Optional, List, Dict
class ApplicationError(Exception):
    """Base exception for application errors."""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}

class ConfigurationError(ApplicationError): pass
class ValidationError(ApplicationError): pass
class LLMError(ApplicationError): pass
class RateLimitError(ApplicationError): pass
class TimeoutError(ApplicationError): pass
class RetrievalError(ApplicationError): pass
class ToolExecutionError(ApplicationError): pass
class FallbackError(ApplicationError): pass
