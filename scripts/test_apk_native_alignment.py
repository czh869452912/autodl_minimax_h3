"""Regression tests for universal APK release validation; no Android SDK needed."""
import importlib.util
import struct
import tempfile
import unittest
import warnings
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location('alignment', Path(__file__).with_name('verify-apk-native-alignment.py'))
alignment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(alignment)


def elf(wide, page, loads=1):
    data = bytearray(128)
    data[:6] = b'\x7fELF' + bytes((2 if wide else 1, 1))
    struct.pack_into('<Q' if wide else '<I', data, 32 if wide else 28, 64)
    struct.pack_into('<HH', data, 54 if wide else 42, 56 if wide else 32, loads)
    struct.pack_into('<I', data, 64, 1)
    struct.pack_into('<Q' if wide else '<I', data, 112 if wide else 92, page)
    return data


class AlignmentTests(unittest.TestCase):
    def check(self, entries, error=None):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'sample.apk'
            with zipfile.ZipFile(path, 'w') as archive, warnings.catch_warnings():
                warnings.simplefilter('ignore', UserWarning)
                for name, data, page, compressed in entries:
                    entry = zipfile.ZipInfo(name)
                    entry.compress_type = zipfile.ZIP_DEFLATED if compressed else zipfile.ZIP_STORED
                    padding = (-(archive.fp.tell() + 30 + len(name) + 4)) % page
                    entry.extra = struct.pack('<HH', 0xCAFE, padding) + bytes(padding)
                    archive.writestr(entry, data)
            if error:
                with self.assertRaisesRegex(ValueError, error):
                    alignment.verify(path)
            else:
                alignment.verify(path)

    def test_universal_apk_accepts_4kb_32bit_and_16kb_64bit(self):
        self.check([(f'lib/{abi}/libtest.so', elf(wide, page), page, False)
                    for abi, wide, page in [('armeabi-v7a', False, 4096), ('x86', False, 4096),
                                            ('arm64-v8a', True, 16384), ('x86_64', True, 16384)]])

    def test_64bit_4kb_elf_still_rejected(self):
        for abi in ('arm64-v8a', 'x86_64'):
            with self.subTest(abi=abi):
                self.check([(f'lib/{abi}/libtest.so', elf(True, 4096), 16384, False)], 'PT_LOAD')

    def test_unaligned_64bit_zip_rejected(self):
        self.check([('lib/arm64-v8a/libtest.so', elf(True, 16384), 4096, False)], 'ZIP data')

    def test_compressed_zip_does_not_need_page_alignment(self):
        self.check([('lib/arm64-v8a/libtest.so', elf(True, 16384), 1, True)])

    def test_duplicate_native_path_rejected(self):
        entry = ('lib/x86/libtest.so', elf(False, 4096), 4096, False)
        self.check([entry, entry], 'duplicate')

    def test_empty_apk_rejected(self):
        self.check([], 'no native libraries')

    def test_missing_load_segments_rejected(self):
        self.check([('lib/x86/libtest.so', elf(False, 4096, loads=0), 4096, False)], 'no load segments')

    def test_abi_class_mismatch_rejected(self):
        self.check([('lib/arm64-v8a/libtest.so', elf(False, 4096), 16384, False)], 'class')

    def test_truncated_elf_rejected(self):
        self.check([('lib/x86/libtest.so', b'\x7fELF', 4096, False)], 'invalid ELF')


if __name__ == '__main__':
    unittest.main()
