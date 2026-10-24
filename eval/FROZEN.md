# Frozen evaluation set

Frozen on 25 October 2026, after review of the 12 ambiguous labels (`docs/label-review.md`) and before any model run.

| File | SHA-256 |
| --- | --- |
| `eval/labelled-complaints.json` | `56e1d8ae0342a01bce3236e2a8cfcc311091739d5758c9b396c972c33c45c3ae` |
| `eval/devices.json` | `4422d15bb20c7a408602e0f5129c508b25995c78735d1a52d75c5c6206f9011f` |

The evaluation script refuses to run if either hash differs. Prompts are developed on `eval/dev-complaints.json`, never on this set.
