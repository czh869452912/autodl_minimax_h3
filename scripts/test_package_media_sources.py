"""Regression tests for source completeness, fail-closed hashes and stable ZIPs."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("packager", Path(__file__).with_name("package-media-sources.py"))
packager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packager)


class SourcePackagingTest(unittest.TestCase):
    def test_gitlink_requires_opt_in_and_exports_submodule_contents(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            def git(repo, *args):
                return subprocess.check_output(["git", "-C", str(repo), *args], text=True).strip()
            def repo(name):
                path = base / name
                path.mkdir()
                git(path, "init", "-q")
                git(path, "config", "user.name", "Source QA")
                git(path, "config", "user.email", "source-qa@example.invalid")
                git(path, "config", "core.autocrlf", "false")
                return path
            child = repo("child")
            (child / "source.c").write_bytes(b"int child;\n")
            git(child, "add", ".")
            git(child, "commit", "-qm", "fixture")
            parent = repo("parent")
            git(parent, "-c", "protocol.file.allow=always", "submodule", "add", str(child), "subprojects/dlg")
            git(parent, "commit", "-qam", "fixture")
            entry = {"name": "fixture.tar.gz", "git": str(parent), "commit": git(parent, "rev-parse", "HEAD"), "directory": "fixture"}
            target = base / entry["name"]
            with self.assertRaisesRegex(RuntimeError, "gitlinks"):
                packager.package_git(entry, target)
            self.assertFalse(target.exists())
            entry["submodules"] = True
            with patch.dict(os.environ, {"GIT_ALLOW_PROTOCOL": "file"}):
                packager.package_git(entry, target)
            with tarfile.open(target) as archive:
                self.assertEqual(archive.extractfile("fixture/subprojects/dlg/source.c").read(), b"int child;\n")
                metadata = json.load(archive.extractfile("fixture/AUTODL-SOURCE-REVISION.json"))
                self.assertEqual(metadata["submodules"]["subprojects/dlg"], git(child, "rev-parse", "HEAD"))

    def test_hash_mismatch_never_retries_or_replaces_verified_target(self):
        import io
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "source"
            target.write_bytes(b"previous")
            with patch.object(packager.urllib.request, "urlopen", return_value=io.BytesIO(b"wrong")) as fetch:
                with self.assertRaises(packager.HashMismatchError):
                    packager.download_verified({"name": "source", "url": "https://example.invalid/source", "sha256": "0" * 64}, target)
            self.assertEqual(fetch.call_count, 1)
            self.assertEqual(target.read_bytes(), b"previous")
            self.assertFalse(target.with_name("source.part").exists())

    def test_zip_ignores_input_mtime_and_reads_back_crc(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)
            payload = output / "source.tar.gz"
            payload.write_bytes(b"fixed source bytes")
            with patch.object(packager, "entries", [{"name": payload.name}]):
                first = packager.build_bundle(output).read_bytes()
                os.utime(payload, (1234567890, 1234567890))
                second = packager.build_bundle(output).read_bytes()
                self.assertEqual(first, second)
                evidence = json.loads((output / "AutoDL-media-sources-verification.json").read_text())
                self.assertTrue(evidence["crcVerified"])
                with patch.object(packager.zipfile.ZipFile, "testzip", return_value=payload.name):
                    with self.assertRaisesRegex(RuntimeError, "CRC failure"):
                        packager.build_bundle(output)
                self.assertEqual((output / "AutoDL-media-sources.zip").read_bytes(), first)


if __name__ == "__main__":
    unittest.main()
