"""Tests for scripts/check_alembic_heads.py: more than one Alembic head fails and names the files."""

from pathlib import Path

import pytest

from scripts.check_alembic_heads import main


def _migration(versions: Path, revision: str, down: str) -> None:
    (versions / f"{revision}.py").write_text(f'revision = "{revision}"\ndown_revision = {down}\n')


def test_one_head_passes(tmp_path):
    """A straight chain has one head."""
    _migration(tmp_path, "r", "None")
    _migration(tmp_path, "a", '"r"')
    assert main(["", str(tmp_path)]) == 0


def test_a_merge_migration_leaves_one_head(tmp_path):
    """Two branches joined by a tuple down_revision pass."""
    _migration(tmp_path, "r", "None")
    _migration(tmp_path, "a", '"r"')
    _migration(tmp_path, "b", '"r"')
    _migration(tmp_path, "m", '("a", "b")')
    assert main(["", str(tmp_path)]) == 0


def test_two_heads_fail_and_name_both_files(tmp_path, capsys):
    """Two migrations on the same parent fail and the output names both files."""
    _migration(tmp_path, "r", "None")
    _migration(tmp_path, "a", '"r"')
    _migration(tmp_path, "b", '"r"')
    assert main(["", str(tmp_path)]) == 1
    out = capsys.readouterr().out
    assert "a.py" in out and "b.py" in out


def test_unknown_down_revision_is_an_error(tmp_path):
    """A parent no file declares is reported as such, not as an extra head."""
    _migration(tmp_path, "r", "None")
    _migration(tmp_path, "a", '"missing"')
    with pytest.raises(ValueError, match="unknown revision: missing"):
        main(["", str(tmp_path)])


def test_empty_folder_is_an_error(tmp_path):
    """A folder with no migrations is not "0 heads"."""
    with pytest.raises(ValueError, match="no migrations"):
        main(["", str(tmp_path)])


def test_init_py_is_skipped(tmp_path):
    """Alembic ignores __init__.py, so it needs no revision ids."""
    _migration(tmp_path, "r", "None")
    (tmp_path / "__init__.py").write_text("")
    assert main(["", str(tmp_path)]) == 0


def test_non_literal_value_names_the_file(tmp_path):
    """A down_revision that is not a literal fails with the file name."""
    _migration(tmp_path, "r", "PREV")
    with pytest.raises(ValueError, match=r"r\.py: `down_revision` is not a plain"):
        main(["", str(tmp_path)])
