# Third-Party Notices

This project includes data from the following third-party work. The licence text below is
reproduced verbatim from the upstream repository, as required by its permission notice.

## Lenia (Orbium unicaudatus and Orbium bicaudatus pattern data)

| | |
| --- | --- |
| Work | Lenia - Mathematical Life Forms |
| Author / copyright holder | Bert Chan |
| Source repository | [Chakazul/Lenia](https://github.com/Chakazul/Lenia) |
| Pinned commit | `adfc542939266de7f4bb7ebb552e8499701ee107` (2022-03-16) |
| Source file | `Python/animals.json` |
| Entries used | `"code": "O2u"`, name "Orbium unicaudatus" (`cells` RLE string and `params` R=13, T=10, m=0.15, s=0.015); and `"code": "O2b"`, name "Orbium bicaudatus" (`params` R=13, T=10, m=0.15, s=0.014). Both entries are in the same file at the same commit |
| Used in this project at | `src/simulation/patterns.js` (verbatim RLE and parameters; the data is not modified) |
| Licence | MIT (upstream file `LICENSE.md`, same commit) |

Scientific reference for the model and the organism:
Chan, B. W.-C. "Lenia: Biology of Artificial Life", Complex Systems 28(3), 2019 (arXiv:1812.05433).

Only the pattern data and its published parameters are taken from the upstream repository. The
decoder (`src/simulation/rle.js`) is an independent JavaScript implementation of the run-length format
as read from upstream `Python/LeniaND.py` (`Board.rle2arr`). The kernel and growth implementation follow
the formulas in Chan (2019) and match the upstream `bump4` / `gaus` definitions. The GPU shaders and
everything else are original code. No upstream source text is copied.
`tests/fixtures/orbium-o2u-reference.json` and `tests/fixtures/orbium-o2b-reference.json` are the same patterns decoded by running the
upstream decoder source (`Board.rle2arr` and its helpers), and are used only to test ours. For O2b only numpy's `asarray` was replaced by
an identity stub, because numpy was not installed; the script that built the fixtures is not in the repository.

### How to re-verify the data

The unit test `tests/unit/patterns.test.js` checks the SHA-256 of each RLE string: O2u
`62abb2c511c8d0491dba11e36ab18da89f3c473fa0dbeba5b32e50f6cda67df0`, O2b
`382578f5a58d05c5eae95bf6e44306e8b5eade02e20d8ca416657c389b2660e5`. To reproduce them independently (use `O2b` for the second):

```sh
curl -s https://raw.githubusercontent.com/Chakazul/Lenia/adfc542939266de7f4bb7ebb552e8499701ee107/Python/animals.json \
  | python3 -c "import sys,json,hashlib; r=next(x for x in json.load(sys.stdin) if x.get('code')=='O2u'); print(hashlib.sha256(r['cells'].encode()).hexdigest())"
```

### Known parameter discrepancy (sigma)

Published sources give different growth widths for Orbium (0.014, 0.015, 0.016, 0.017). This project uses
0.015 for O2u, the value stored with that exact pattern in the pinned catalogue entry. O2b is a different pattern
and is used with its own stored value, 0.014. Details and the measured
sensitivity are documented in `src/simulation/patterns.js` and `tests/unit/patterns.test.js`.

### Licence text (verbatim from upstream `LICENSE.md`)

This text was compared with `LICENSE.md` at the pinned commit on 31 Oct 2026 and is identical. It covers both patterns.

```text
MIT License

Copyright (c) 2018 Bert Chan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
