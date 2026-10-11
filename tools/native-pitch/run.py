#!/usr/bin/env python3
"""Run the real pure-Kotlin detector tests/benchmark without Android or Gradle.

Requires Python 3.9+ and JDK 17+. By default uses pinned jars already in
GRADLE_USER_HOME/caches (or --jars-dir). --download-deps explicitly permits
checksum-pinned Maven Central downloads into tools/native-pitch/.deps.
Does not invoke Gradle/prebuild or need an Android SDK or installed kotlinc.
"""
import argparse
import hashlib
import os
from pathlib import Path
import platform
import subprocess
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "modules/tunera-pitch/android/src"

# Pinned compiler/test dependencies; verify downloaded AND cached jars.
SHA256 = {
    "kotlin-compiler-embeddable": "c54a00718c8c0e3ee858bf42771c7f401c5e3c1738861e18e9536371042fa1b3",
    "kotlin-stdlib": "1bcc74e8ce84e2c25eaafde10f1248349cce3062b6e36978cbeec610db1e930a",
    "annotations": "ace2a10dc8e2d5fd34925ecac03e4988b2c0f851650c94b8cef49ba1bd111478",
    "kotlin-script-runtime": "ae4397fbb3aa2a1ada09290e753bba99a4114548977c3115526b9958f4cb1a04",
    "kotlin-reflect": "419778f2b7a826bad6ee2ca1e4bdebe639ab306d2904fa3ef2a308ecfaab3811",
    "trove4j": "c5fd725bffab51846bf3c77db1383c60aaaebfe1b7fe2f00d23fe1b7df0a439d",
    "kotlinx-coroutines-core-jvm": "9860906a1937490bf5f3b06d2f0e10ef451e65b95b269f22daf68a3d1f5065c5",
    "junit": "8e495b634469d64fb8acfa3495a065cbacc8a0fff55ce1e31007be4c16dc57d3",
    "hamcrest-core": "66fdef91e9739348df7a096aa384a5685f4e875584cce89386a7a47251c4d8e9",
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("test", "benchmark"), nargs="?", default="test")
    parser.add_argument("--test-class", action="append", help="JUnit class (repeatable)")
    parser.add_argument("--jars-dir", type=Path, help="Override dependency cache (Gradle layout)")
    parser.add_argument("--download-deps", action="store_true", help="Fetch missing pinned jars from Maven Central (CI bootstrap)")
    args = parser.parse_args()
    if args.jars_dir is None:
        args.jars_dir = (Path(__file__).parent / ".deps" if args.download_deps else
                         Path(os.environ.get("GRADLE_USER_HOME", Path.home() / ".gradle")) / "caches/modules-2/files-2.1")

    def jar(group, name, version):
        matches = sorted((args.jars_dir / group / name / version).glob("*/*.jar"))
        matches = [p for p in matches if not p.name.endswith(("-sources.jar", "-javadoc.jar"))]
        if not matches and args.download_deps:
            filename = f"{name}-{version}.jar"
            url = f"https://repo.maven.apache.org/maven2/{group.replace('.', '/')}/{name}/{version}/{filename}"
            print(f"Downloading {group}:{name}:{version}", flush=True)
            with urllib.request.urlopen(url, timeout=120) as response:
                data = response.read()
            if hashlib.sha256(data).hexdigest() != SHA256[name]:
                parser.error(f"SHA-256 mismatch for {url}")
            destination = args.jars_dir / group / name / version / SHA256[name] / filename
            destination.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as out:
                out.write(data)
                temporary = Path(out.name)
            temporary.replace(destination)
            matches = [destination]
        if len(matches) != 1:
            parser.error(f"Expected one {group}:{name}:{version} jar in {args.jars_dir}; found {len(matches)}. Populate the dependency cache first.")
        if hashlib.sha256(matches[0].read_bytes()).hexdigest() != SHA256[name]:
            parser.error(f"SHA-256 mismatch for cached {matches[0]}")
        return str(matches[0])

    stdlib = jar("org.jetbrains.kotlin", "kotlin-stdlib", "2.1.20")
    annotations = jar("org.jetbrains", "annotations", "13.0")
    compiler_cp = os.pathsep.join([
        jar("org.jetbrains.kotlin", "kotlin-compiler-embeddable", "2.1.20"), stdlib, annotations,
        jar("org.jetbrains.kotlin", "kotlin-script-runtime", "2.1.20"),
        jar("org.jetbrains.kotlin", "kotlin-reflect", "2.1.20"),
        jar("org.jetbrains.intellij.deps", "trove4j", "1.0.20200330"),
        jar("org.jetbrains.kotlinx", "kotlinx-coroutines-core-jvm", "1.8.0"),
    ])
    junit = jar("junit", "junit", "4.13.2")
    hamcrest = jar("org.hamcrest", "hamcrest-core", "1.3")
    # Deliberately exclude only the Android/Expo adapter, not the detector.
    sources = sorted((SRC / "main/java/app/tunera/pitch").glob("*.kt"))
    sources = [p for p in sources if p.name != "TuneraPitchModule.kt"]
    tests = sorted((SRC / "test").rglob("*.kt"))
    sources += tests
    if args.mode == "benchmark":
        sources.append(ROOT / "tools/native-pitch/Benchmark.kt")
    # Keep generated files inside this owned tool directory, cleaned on exit.
    with tempfile.TemporaryDirectory(prefix=".host-", dir=Path(__file__).parent) as temp:
        runtime_cp = os.pathsep.join([temp, stdlib, annotations, junit, hamcrest])
        subprocess.run(["java", "-cp", compiler_cp, "org.jetbrains.kotlin.cli.jvm.K2JVMCompiler",
                        "-no-stdlib", "-no-reflect", "-jvm-target", "17", "-classpath", runtime_cp,
                        "-d", temp, *map(str, sources)], check=True)
        if args.mode == "test":
            classes = args.test_class or ["app.tunera.pitch." + p.stem for p in tests if p.name.endswith("Test.kt")]
            if not classes:
                parser.error("No JUnit test classes discovered")
            target = ["org.junit.runner.JUnitCore", *classes]
        else:
            target = ["app.tunera.pitch.BenchmarkKt"]
        print(f"Host {platform.machine()}; JVM only, not Android/device evidence", flush=True)
        subprocess.run(["java", "-cp", runtime_cp, *target], check=True)


if __name__ == "__main__":
    main()
