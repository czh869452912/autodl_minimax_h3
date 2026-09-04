# Affected emulator before upgrade

- Device: `emulator-5554`
- Package: `com.example.autodlh3`
- Installed version: `1.4.9` (`versionCode=19`)
- Database SQLite integrity: `ok`
- Database schema version: `6`
- Local evidence copy: `affected-before.db` (ignored by Git; contains private application data)
- Local evidence SHA-256: `FB814775D83A1CB518CB38B2CA3448CF732C433650F1832C1EF2362142E94324`

## Redacted database summary

| Object | Count |
| --- | ---: |
| tasks | 4 |
| media_assets | 4 |
| workflow_jobs | 4 |
| workflow_registry | 1 |
| workflow_registry_active | 1 |
| workflow_registry_releases | absent in schema v6 |

Registry coordinate `autodl.minimax-h3.i2v-15s@1.0.0` used legacy identity `917cce0dca1a7a3cc178d46baee6c5dd16c2a586283bee2b7d426bda71705390`. The SHA-256 of its stored `definition_json` bytes was the same value. No task prompts, credentials, tokens, media paths, or payload bodies are recorded here.

## Settings and cached-media fingerprints

- `SecureStore.xml`: `4a85d68e1a7186c985ce313115433df481220ef9ac10fa1a1fd159c38a430cad`
- Poster files: 5; SHA-256 multiset `6ce68e…`, `072b4f…`, `e3be2b…`, `7d8c12…`, `b93be4…`
- Image-picker cache files: 5; all SHA-256 `5fa51d…`
