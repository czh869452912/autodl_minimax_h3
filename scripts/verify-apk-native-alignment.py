"""Check native ELF/ZIP alignment: 16KB for 64-bit, 4KB for 32-bit ABIs.

Android's 16KB requirement covers arm64-v8a and x86_64:
https://developer.android.com/guide/practices/page-sizes#elf-alignment
"""
import struct
import sys
import zipfile
from pathlib import Path


def verify(path):
    failures, names = [], set()
    compressed = 0
    with zipfile.ZipFile(path) as archive, Path(path).open('rb') as apk:
        for entry in archive.infolist():
            if not entry.filename.startswith('lib/') or not entry.filename.endswith('.so'):
                continue
            if entry.filename in names:
                failures.append(f'{entry.filename}: duplicate native path')
            names.add(entry.filename)
            abi = entry.filename.split('/')[1]
            if abi not in ('arm64-v8a', 'x86_64', 'armeabi-v7a', 'x86'):
                raise ValueError(f'{entry.filename}: unsupported ABI')
            required_alignment = 16384 if abi in ('arm64-v8a', 'x86_64') else 4096
            data = archive.read(entry)
            if len(data) < 64 or data[:4] != b'\x7fELF' or data[4] not in (1, 2) or data[5] not in (1, 2):
                raise ValueError(f'{entry.filename}: invalid ELF')
            endian = '<' if data[5] == 1 else '>'
            wide = data[4] == 2
            if wide != (required_alignment == 16384):
                raise ValueError(f'{entry.filename}: ELF class does not match ABI')
            offset = struct.unpack_from(endian + ('Q' if wide else 'I'), data, 32 if wide else 28)[0]
            size, count = struct.unpack_from(endian + 'HH', data, 54 if wide else 42)
            loads = 0
            for index in range(count):
                start = offset + index * size
                if struct.unpack_from(endian + 'I', data, start)[0] != 1:
                    continue
                loads += 1
                alignment = struct.unpack_from(endian + ('Q' if wide else 'I'), data, start + (48 if wide else 28))[0]
                if alignment < required_alignment or alignment & (alignment - 1):
                    failures.append(f'{entry.filename}: PT_LOAD alignment {alignment}')
            if not loads:
                failures.append(f'{entry.filename}: no load segments')
            apk.seek(entry.header_offset + 26)
            name_size, extra_size = struct.unpack('<HH', apk.read(4))
            data_offset = entry.header_offset + 30 + name_size + extra_size
            if entry.compress_type != zipfile.ZIP_STORED:
                compressed += 1
            if entry.compress_type == zipfile.ZIP_STORED and data_offset % required_alignment:
                failures.append(f'{entry.filename}: ZIP data is not {required_alignment // 1024}KB aligned')
    if not names or failures:
        raise ValueError('\n'.join(failures) or 'APK contains no native libraries')
    if compressed:
        print(f'NOTE: {compressed} compressed native entries: ELF checked; ZIP offsets not applicable. Installation must extract them before loading; direct mmap loading was not verified.')
    print(f'Verified {len(names)} unique native libraries: ELF and uncompressed ZIP alignment (64-bit: 16KB; 32-bit: 4KB)')


if __name__ == '__main__':
    verify(sys.argv[1])
