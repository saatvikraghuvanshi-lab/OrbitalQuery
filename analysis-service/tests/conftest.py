"""
Shared test fixtures — initializes a MockProvider for all tests
so they don't depend on network access or Planetary Computer.
"""

import pytest
from app.services.eo_provider import MockProvider, register_provider, _providers


@pytest.fixture(autouse=True)
def _init_mock_provider():
    """Register a MockProvider before each test, clear after."""
    _providers.clear()
    provider = MockProvider(name="test_mock")
    register_provider(provider, default=True)
    yield provider
    _providers.clear()
