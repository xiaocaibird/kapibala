"""Read fixed Git objects; apply only to an owned temporary file copy."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
spec = json.loads((HERE / "manifest.json").read_text())
target = spec["file"]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git_source(revision):
    return subprocess.check_output(["git", "show", f"{revision}:{target}"], cwd=REPO)


def query_line(data):
    matches = [line for line in data.decode().splitlines()
               if "SELECT jsonb_array_length(items) AS total" in line
               and "FROM timeline_snapshots WHERE" in line]
    assert len(matches) == 1
    return matches[0]


current = git_source(spec["productRevision"])
old = git_source(spec["preOptimizationRevision"])
optimized = git_source(spec["optimizationRevision"])
assert query_line(current) == query_line(optimized)
assert digest(current) == spec["sourceSha256"]["product"]
assert digest(old) == spec["sourceSha256"]["preOptimizationCommitFile"]
assert digest(optimized) == spec["sourceSha256"]["optimizationCommitFile"]
assert digest(query_line(current).encode()) == spec["querySourceLineSha256"]["optimized"]
assert digest(query_line(old).encode()) == spec["querySourceLineSha256"]["original"]
extra = spec["additionalVerifiedRevision"]
assert digest(git_source(extra["revision"])) == extra["gatewayFileSha256"]
assert extra["gatewayFileSha256"] == spec["sourceSha256"]["product"]
for name, expected in spec["patches"].items():
    assert digest((HERE / name).read_bytes()) == expected

steps = []
with tempfile.TemporaryDirectory(prefix="kapibala-db002-patch-") as temporary:
    copy = Path(temporary)
    file = copy / target
    file.parent.mkdir(parents=True)
    file.write_bytes(current)
    for name, expected in [
        ("to-original-query.patch", spec["sourceSha256"]["controlledOriginalQueryVariant"]),
        ("to-optimized-query.patch", spec["sourceSha256"]["product"]),
    ]:
        patch = str(HERE / name)
        numstat = subprocess.check_output(["git", "apply", "--numstat", patch], cwd=copy).decode()
        assert numstat == f"1\t1\t{target}\n"
        subprocess.run(["git", "apply", "--check", patch], cwd=copy, check=True)
        subprocess.run(["git", "apply", patch], cwd=copy, check=True)
        assert digest(file.read_bytes()) == expected
        if name == "to-original-query.patch":
            assert query_line(file.read_bytes()) == query_line(old)
        steps.append({"patch": name, "applyCheck": "PASS", "apply": "PASS",
                      "numstat": numstat.strip(), "actualFileSha256": digest(file.read_bytes())})
    assert file.read_bytes() == current
    remaining_files = sorted(str(p.relative_to(copy)) for p in copy.rglob("*")
                             if p.is_file() and ".git" not in p.parts)
    assert remaining_files == [target]
print(json.dumps({"kind": "development-static-patch-verification", "productRevision": spec["productRevision"],
                  "queryMatchesOptimizationCommit": True, "steps": steps, "roundtripByteExact": True,
                  "temporaryCopyRemoved": not Path(temporary).exists(),
                  "databaseStarted": False, "applicationStarted": False, "benchmarkRun": False,
                  "qaResult": "NOT_ASSESSED"}, indent=2))
