"""Ensure obsolete-player scans remain fail-closed under python -O."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile


class OptimizedVerifierTest(unittest.TestCase):
    def verify(self, entries):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            apk, aar, report = folder / "fixture.apk", folder / "fixture.aar", folder / "report.json"
            with zipfile.ZipFile(apk, "w") as archive:
                for name, data in entries.items():
                    archive.writestr(name, data)
            aar.write_bytes(b"fixture AAR")
            script = Path(__file__).with_name("verify-mpv-migration.py").resolve()
            # Isolate the class/entry scan; actual ELF/ZIP alignment is tested on the real APK.
            harness = "import runpy,sys; from unittest.mock import patch; " + \
                "script=sys.argv.pop(1); " + \
                "guard=patch('subprocess.check_output',return_value='fixture alignment'); guard.start(); " + \
                "runpy.run_path(script,run_name='__main__')"
            result = subprocess.run([sys.executable, "-O", "-c", harness, str(script), str(apk), str(aar),
                                     "--output", str(report)], capture_output=True, text=True)
            return result, json.loads(report.read_text()) if report.exists() else None

    def test_optimized_execution_rejects_vlc_entries(self):
        result, report = self.verify({"assets/libvlc-legacy": b"obsolete"})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Obsolete VLC archive entries", result.stderr)
        self.assertIsNone(report)

    def test_optimized_execution_rejects_removed_classes(self):
        result, report = self.verify({"classes.dex": b"prefix Lexpo/modules/video/Player suffix"})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Obsolete classes", result.stderr)
        self.assertIsNone(report)

    def test_optimized_execution_emits_report_for_clean_fixture(self):
        result, report = self.verify({"classes.dex": b"current player"})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(report["obsoleteClassesAbsent"])


if __name__ == "__main__":
    unittest.main()
