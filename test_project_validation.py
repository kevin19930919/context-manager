#!/usr/bin/env python3
"""Unit tests for project validation and creation"""

import sys
import tempfile
import shutil
from pathlib import Path

# Add mcp-server to path
sys.path.insert(0, str(Path(__file__).parent / 'mcp-server'))

from context_manager import ContextManager, ProjectNotFoundError, ProjectAlreadyExistsError


def test_validate_project_name():
    """Test project name validation"""
    print("\n=== Testing _validate_project_name() ===")

    with tempfile.TemporaryDirectory() as tmpdir:
        manager = ContextManager(tmpdir)

        # Valid names
        valid_names = [
            "valid-project",
            "項目名稱",  # Unicode
            "123-project",
            "My Project",  # Space is okay
        ]

        print("\n✓ Valid names:")
        for name in valid_names:
            try:
                manager._validate_project_name(name)
                print(f"  ✓ '{name}' - accepted")
            except ValueError as e:
                print(f"  ✗ '{name}' - FAILED: {e}")
                raise

        # Invalid names
        invalid_cases = [
            ("", "empty string"),
            ("  ", "whitespace only"),
            ("../etc", "path traversal"),
            ("project/subdir", "path separator /"),
            ("project\\subdir", "path separator \\"),
            (".", "single dot"),
            ("..", "double dot"),
            ("_temp", "reserved name"),
            ("project\x00name", "null byte"),
            ("project\x01name", "control char"),
            (" leading", "leading space"),
            ("trailing ", "trailing space"),
        ]

        print("\n✓ Invalid names (should be rejected):")
        for name, desc in invalid_cases:
            try:
                manager._validate_project_name(name)
                print(f"  ✗ {desc}: '{name}' - FAILED (should be rejected)")
                raise AssertionError(f"Should reject {desc}: '{name}'")
            except ValueError as e:
                print(f"  ✓ {desc}: '{name}' - correctly rejected")


def test_create_project():
    """Test project creation"""
    print("\n=== Testing create_project() ===")

    with tempfile.TemporaryDirectory() as tmpdir:
        manager = ContextManager(tmpdir)

        # Create project
        print("\n✓ Creating new project...")
        result = manager.create_project("test-project", "Test description")
        assert result['success'] == True
        assert result['project'] == "test-project"
        print(f"  ✓ Project created: {result['project']}")
        print(f"  ✓ Message: {result['message']}")

        # Verify directories exist
        screenshots_dir = Path(tmpdir) / 'screenshots' / 'test-project'
        files_dir = Path(tmpdir) / 'files' / 'test-project'

        assert screenshots_dir.exists(), "screenshots/ directory should exist"
        assert files_dir.exists(), "files/ directory should exist"
        print("  ✓ Both directories created")

        # Verify contexts.json exists
        assert (screenshots_dir / 'contexts.json').exists(), "screenshots/contexts.json should exist"
        assert (files_dir / 'contexts.json').exists(), "files/contexts.json should exist"
        print("  ✓ contexts.json files created")

        # Verify project.json exists with metadata
        project_json = screenshots_dir / 'project.json'
        assert project_json.exists(), "project.json should exist"

        import json
        with open(project_json, 'r', encoding='utf-8') as f:
            metadata = json.load(f)

        assert metadata['name'] == "test-project"
        assert metadata['description'] == "Test description"
        assert 'created_at' in metadata
        assert metadata['version'] == '1.0'
        print(f"  ✓ project.json created with metadata")
        print(f"    - Name: {metadata['name']}")
        print(f"    - Description: {metadata['description']}")
        print(f"    - Created at: {metadata['created_at']}")

        # Try to create again - should fail
        print("\n✓ Testing duplicate creation...")
        try:
            manager.create_project("test-project")
            print("  ✗ FAILED - should reject duplicate project")
            raise AssertionError("Should reject duplicate project")
        except ProjectAlreadyExistsError as e:
            print(f"  ✓ Correctly rejected: {e}")


def test_project_exists():
    """Test project existence check"""
    print("\n=== Testing project_exists() ===")

    with tempfile.TemporaryDirectory() as tmpdir:
        manager = ContextManager(tmpdir)

        # Non-existent project
        print("\n✓ Checking non-existent project...")
        exists = manager.project_exists("nonexistent")
        assert exists == False, "Non-existent project should return False"
        print("  ✓ Correctly returned False")

        # Create project
        print("\n✓ Creating project...")
        manager.create_project("exists-test")

        # Check existence
        exists = manager.project_exists("exists-test")
        assert exists == True, "Existing project should return True"
        print("  ✓ Correctly returned True")

        # Test partial project (only screenshots, simulating old incomplete projects)
        print("\n✓ Testing partial project (only screenshots/)...")
        (Path(tmpdir) / 'screenshots' / 'partial').mkdir(parents=True)
        exists = manager.project_exists("partial")
        assert exists == True, "Partial project (OR logic) should return True"
        print("  ✓ Correctly returned True (OR logic working)")


def test_ensure_project_exists():
    """Test project existence enforcement"""
    print("\n=== Testing _ensure_project_exists() ===")

    with tempfile.TemporaryDirectory() as tmpdir:
        manager = ContextManager(tmpdir)

        # Test with non-existent project
        print("\n✓ Testing with non-existent project...")
        try:
            manager._ensure_project_exists("nonexistent")
            print("  ✗ FAILED - should raise ProjectNotFoundError")
            raise AssertionError("Should raise ProjectNotFoundError")
        except ProjectNotFoundError as e:
            assert "nonexistent" in str(e)
            assert "create_project" in str(e)
            print(f"  ✓ Correctly raised ProjectNotFoundError")
            print(f"    Message: {e}")

        # Test with existing project
        print("\n✓ Testing with existing project...")
        manager.create_project("existing")
        try:
            manager._ensure_project_exists("existing")
            print("  ✓ Validation passed for existing project")
        except ProjectNotFoundError:
            print("  ✗ FAILED - should not raise error for existing project")
            raise


def run_all_tests():
    """Run all tests"""
    print("=" * 60)
    print("Project Validation Tests")
    print("=" * 60)

    try:
        test_validate_project_name()
        test_create_project()
        test_project_exists()
        test_ensure_project_exists()

        print("\n" + "=" * 60)
        print("✅ All tests passed!")
        print("=" * 60)
        return True

    except Exception as e:
        print("\n" + "=" * 60)
        print(f"❌ Test failed: {e}")
        print("=" * 60)
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
