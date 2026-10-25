"""Build the small static word-vector table used for 'embedding' search.

Source: spaCy en_core_web_md word vectors (300-d GloVe-style, MIT licence for
spaCy models' code; vectors derived from public web text). We keep only words
that appear in the catalog or in the ~8k most common English words, reduce to
64 dims with PCA, L2-normalise, quantise to int8, and write public/vectors.json.

Usage: python3 scripts/build_vectors.py <path to extracted en_core_web_md vocab dir>
"""
import sys, json, re, base64
import numpy as np
from spacy.vocab import Vocab
from wordfreq import top_n_list

vocab = Vocab().from_disk(sys.argv[1])
cat = json.load(open("data/catalog.json"))
words = set()
for p in cat:
    blob = " ".join([p["name"], p["description"], " ".join(p["interests"]), " ".join(p["tags"]), " ".join(p["recipients"]), " ".join(p["occasions"])] + [r["text"] for r in p["reviews"]])
    words |= set(re.findall(r"[a-z]+", blob.lower()))
extra = open("scripts/query_vocab.txt").read().split() if __import__("os").path.exists("scripts/query_vocab.txt") else []
words |= set(extra)
words |= {w for w in top_n_list("en", 9000) if w.isalpha() and len(w) > 2}
keep = sorted(w for w in words if vocab.has_vector(w) and np.linalg.norm(vocab.get_vector(w)) > 0)
M = np.stack([vocab.get_vector(w) for w in keep]).astype("float32")
M /= np.linalg.norm(M, axis=1, keepdims=True)
mu = M.mean(0)
X = M - mu
U, S, Vt = np.linalg.svd(X, full_matrices=False)
D = 64
Z = X @ Vt[:D].T
Z /= np.linalg.norm(Z, axis=1, keepdims=True)
Q = np.clip(np.round(Z * 127), -127, 127).astype("int8")
out = {"dim": D, "n": len(keep), "words": keep, "data": base64.b64encode(Q.tobytes()).decode()}
json.dump(out, open("public/vectors.json", "w"), separators=(",", ":"))
import os
print(len(keep), "words ->", os.path.getsize("public/vectors.json") // 1024, "KiB; variance kept", round(float((S[:D]**2).sum() / (S**2).sum()), 3))
