# Third-Party Notices

This project includes data from the following third-party work. The licence text below is
reproduced verbatim from the upstream repository, as required by its permission notice.

## Lenia (Orbium unicaudatus pattern data)

| | |
|---|---|
| Work | Lenia - Mathematical Life Forms |
| Author / copyright holder | Bert Chan |
| Source repository | https://github.com/Chakazul/Lenia |
| Pinned commit | `adfc542939266de7f4bb7ebb552e8499701ee107` (2022-03-16) |
| Source file | `Python/animals.json` |
| Entry used | `"code": "O2u"`, name "Orbium unicaudatus" (`cells` RLE string and `params` R=13, T=10, m=0.15, s=0.015) |
| Used in this project at | `src/simulation/patterns.js` (verbatim RLE and parameters; the data is not modified) |
| Licence | MIT (upstream file `LICENSE.md`, same commit) |

Scientific reference for the model and the organism:
Chan, B. W.-C. "Lenia: Biology of Artificial Life", Complex Systems 28(3), 2019 (arXiv:1812.05433).

Only the pattern data and its published parameters are taken from the upstream repository. The
decoder (`src/simulation/rle.js`), the kernel and growth implementation, the GPU shaders and
everything else in this project are original code, written against the published description of the
model; no upstream source files are copied.

### How to re-verify the data

The unit test `tests/unit/patterns.test.js` checks the SHA-256 of the RLE string
(`62abb2c511c8d0491dba11e36ab18da89f3c473fa0dbeba5b32e50f6cda67df0`). To reproduce it independently:

```
curl -s https://raw.githubusercontent.com/Chakazul/Lenia/adfc542939266de7f4bb7ebb552e8499701ee107/Python/animals.json \
  | python3 -c "import sys,json,hashlib; r=next(x for x in json.load(sys.stdin) if x.get('code')=='O2u'); print(hashlib.sha256(r['cells'].encode()).hexdigest())"
```

### Known parameter discrepancy (sigma)

Published sources give different growth widths for Orbium (0.014, 0.015, 0.016, 0.017). This project uses
0.015, the value stored with this exact pattern in the pinned catalogue entry. Details and the measured
sensitivity are documented in `src/simulation/patterns.js` and `tests/unit/patterns.test.js`.

### Licence text (verbatim from upstream `LICENSE.md`)

```
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
