"""Package hash-pinned media sources for the same GitHub release as the APK."""
import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request
import zipfile


root = Path(__file__).resolve().parents[1]
manifest = root / "scripts/media-source-manifest.json"
entries = json.loads(manifest.read_text(encoding="utf-8"))


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class HashMismatchError(RuntimeError):
    pass


def download_verified(entry, destination):
    expected = entry["sha256"]
    if destination.exists() and sha256(destination) == expected:
        return
    temporary = destination.with_name(destination.name + ".part")
    temporary.unlink(missing_ok=True)
    request = urllib.request.Request(entry["url"], headers={"User-Agent": "AutoDL-source-packager/1"})
    last_error = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=180) as response, temporary.open("wb") as target:
                shutil.copyfileobj(response, target, length=1024 * 1024)
            actual = sha256(temporary)
            if actual != expected:
                raise HashMismatchError(
                    f"Source archive hash mismatch for {entry['name']}: expected {expected}, got {actual}"
                )
            os.replace(temporary, destination)
            return
        except HashMismatchError:
            temporary.unlink(missing_ok=True)
            raise
        except Exception as error:
            last_error = error
            temporary.unlink(missing_ok=True)
            if attempt < 2:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"Unable to download verified source {entry['name']}") from last_error


def run(*args, cwd=None):
    subprocess.run(list(args), cwd=cwd, check=True)


def run_network(*args, cwd=None):
    last_error = None
    for attempt in range(3):
        try:
            run(*args, cwd=cwd)
            return
        except subprocess.CalledProcessError as error:
            last_error = error
            if attempt < 2:
                time.sleep(2 ** attempt)
    raise RuntimeError("Source git operation failed after three attempts") from last_error


def git_output(*args, cwd=None):
    return subprocess.check_output(list(args), cwd=cwd, text=True).rstrip()


def append_tar(destination, source):
    with tarfile.open(destination, "a") as combined, tarfile.open(source, "r") as addition:
        for member in addition:
            content = addition.extractfile(member) if member.isfile() else None
            combined.addfile(member, content)


def archive_git_checkout(checkout, destination, prefix, commit, submodule_commits, temporary):
    uncompressed = temporary / "source.tar"
    run(
        "git", "-c", "core.autocrlf=false", "archive", "--format=tar", f"--prefix={prefix}/", f"--output={uncompressed}", commit,
        cwd=checkout,
    )
    for index, (submodule_path, submodule_commit) in enumerate(sorted(submodule_commits.items())):
        submodule_archive = temporary / f"submodule-{index}.tar"
        run(
            "git", "-c", "core.autocrlf=false", "archive", "--format=tar", f"--prefix={prefix}/{submodule_path}/",
            f"--output={submodule_archive}", submodule_commit, cwd=checkout / submodule_path,
        )
        append_tar(uncompressed, submodule_archive)

    metadata = json.dumps(
        {"repository": git_output("git", "remote", "get-url", "origin", cwd=checkout),
         "commit": commit, "submodules": submodule_commits},
        indent=2,
        sort_keys=True,
    ).encode("utf-8") + b"\n"
    with tarfile.open(uncompressed, "a") as archive:
        info = tarfile.TarInfo(f"{prefix}/AUTODL-SOURCE-REVISION.json")
        info.size = len(metadata)
        info.mode = 0o644
        info.mtime = 0
        archive.addfile(info, io.BytesIO(metadata))

    with uncompressed.open("rb") as source, destination.open("wb") as raw:
        with gzip.GzipFile(filename="", fileobj=raw, mode="wb", mtime=0) as compressed:
            shutil.copyfileobj(source, compressed, length=1024 * 1024)


def package_git(entry, destination):
    with tempfile.TemporaryDirectory() as temporary:
        checkout = Path(temporary) / "checkout"
        staged_archive = Path(temporary) / "source.tar.gz"
        run("git", "init", "-q", str(checkout))
        run("git", "-C", str(checkout), "remote", "add", "origin", entry["git"])
        run_network("git", "-C", str(checkout), "fetch", "--depth=1", "origin", entry["commit"])
        run("git", "-C", str(checkout), "checkout", "--detach", "--quiet", "FETCH_HEAD")
        commit = git_output("git", "rev-parse", "HEAD", cwd=checkout)
        if commit != entry["commit"]:
            raise RuntimeError("Source commit mismatch: " + entry["name"])

        gitlinks = [line for line in git_output("git", "ls-tree", "-r", commit, cwd=checkout).splitlines()
                    if line.startswith("160000 ")]
        if gitlinks and not entry.get("submodules"):
            raise RuntimeError("Source contains gitlinks but recursive submodules are not enabled: " + entry["name"])
        submodule_commits = {}
        if entry.get("submodules"):
            run_network("git", "submodule", "update", "--init", "--recursive", "--depth=1", cwd=checkout)
            status = git_output("git", "submodule", "status", "--recursive", cwd=checkout)
            for line in status.splitlines():
                if not line or line[0] != " ":
                    raise RuntimeError("Unresolved source submodule: " + line)
                fields = line[1:].split()
                submodule_commits[fields[1]] = fields[0]

        archive_git_checkout(
            checkout, staged_archive, entry["directory"], commit, submodule_commits, Path(temporary)
        )
        os.replace(staged_archive, destination)


def build_bundle(output):
    payloads = [(output / entry["name"], entry["name"]) for entry in entries]
    payloads += [(manifest, "source-manifest.json"),
        (root / "mobile/android/VIDEO_COMPATIBILITY.md", "VIDEO-COMPATIBILITY.md"),
        (root / "mobile/android/LIBMPV.md", "LIBMPV-BUILD-AND-PROVENANCE.md"),
        (root / "mobile/android/gradle/libmpv.gradle", "build/libmpv.gradle"),
        (root / "mobile/android/app/build.gradle", "build/app-build.gradle"),
        (root / "scripts/package-media-sources.py", "build/package-media-sources.py")]
    payloads += [(file, "licenses/" + file.name)
                 for file in sorted((root / "mobile/android/app/src/main/assets/licenses").iterdir())]
    bundle = output / "AutoDL-media-sources.zip"
    staged = output / "AutoDL-media-sources.zip.part"
    # Payloads are already compressed. STORED also avoids ZIP zlib-version differences.
    with zipfile.ZipFile(staged, "w", zipfile.ZIP_STORED) as archive:
        for path, name in sorted(payloads, key=lambda pair: pair[1]):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            with path.open("rb") as source, archive.open(info, "w", force_zip64=True) as target:
                shutil.copyfileobj(source, target, length=1024 * 1024)
    with zipfile.ZipFile(staged) as archive:
        bad = archive.testzip()
        if bad is not None:
            raise RuntimeError("Source ZIP CRC failure: " + bad)
        for path, name in payloads:
            if hashlib.sha256(archive.read(name)).hexdigest() != sha256(path):
                raise RuntimeError("Source ZIP payload mismatch: " + name)
    os.replace(staged, bundle)
    evidence = {"bundle": bundle.name, "sha256": sha256(bundle), "crcVerified": True,
                "payloads": {name: sha256(path) for path, name in sorted(payloads, key=lambda pair: pair[1])}}
    (output / "AutoDL-media-sources-verification.json").write_text(
        json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return bundle


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="Directory for verified sources, ZIP and verification manifest")
    output = parser.parse_args().output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    for entry in entries:
        destination = output / entry["name"]
        if "git" in entry:
            package_git(entry, destination)
        else:
            download_verified(entry, destination)
    print(build_bundle(output))


if __name__ == "__main__":
    main()
