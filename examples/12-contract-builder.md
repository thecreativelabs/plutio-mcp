# 12 — Contract builder with variable substitution

Generate a Plutio contract (service agreement or NDA) from a structured scaffold, with parties/dates/purpose substituted via `{{ variables }}`.

Requires `PLUTIO_READ_ONLY=false`.

## The two tools

- **`plutio_list_contract_presets`** — see shipped scaffolds (currently `service-agreement` and `nda`).
- **`plutio_contract_from_preset`** — create a contract with a preset's blocks, optional signee link, and variable substitution.

## Prompt

> Create an NDA between us (Acme Corp) and Example LLC for evaluating a potential collaboration, effective today.

## What Claude will do

1. **`plutio_list_contract_presets`** to confirm the `nda` slug exists.
2. **`plutio_contract_from_preset`** with:
    ```json
    {
      "preset": "nda",
      "name": "Acme Corp ↔ Example LLC — Mutual NDA",
      "variables": {
        "party_a_name": "Acme Corp",
        "party_b_name": "Example LLC",
        "effective_date": "2026-04-23",
        "purpose_short": "evaluating a potential collaboration"
      }
    }
    ```

## Example answer

```
Created contract: Acme Corp ↔ Example LLC — Mutual NDA
  _id: contract_abc123
  preset: nda
  blocks: 10 (9 content + 1 signature)
  variables applied: party_a_name, party_b_name, effective_date, purpose_short

⚠️ Shipped preset contains TODO placeholders. Open the contract in Plutio
   and replace the legal clauses before sending for signature.
```

## Variable substitution

Every block's `textHTML` is run through a `{{ key }}` substitutor before being POSTed to Plutio. Whitespace inside the braces is tolerated:

| Token in preset | Replaced with |
|---|---|
| `{{ party_a_name }}` | value of `variables.party_a_name` |
| `{{effective_date}}` | value of `variables.effective_date` |
| `{{ unknown_key }}` | left as-is (so you can see what wasn't filled) |

## Allowed block types for contracts

Plutio enforces a stricter enum on contract blocks than proposals:

| Block type | Allowed on contract? | Body field |
|---|---|---|
| `content` | ✅ | top-level `textHTML` |
| `image` | ✅ | `attachment` ref |
| `canvas` | ✅ | (specialized) |
| `video` | ✅ | (specialized) |
| `html` | ✅ | bare (content set in Plutio UI) |
| `signature` | ✅ | bare; signees live on the contract record |
| `intro` | ❌ — proposal only | — |
| `items` | ❌ — proposal/invoice only | — |
| `fees` | ❌ — proposal/invoice only | — |

If the agent tries to add a `intro`/`items`/`fees` block to a contract, Plutio returns 400 `Type "X" is invalid. Valid options are: content, image, canvas, video, html, signature`. The contract builder uses only contract-valid types.

## ⚠️ Legal disclaimer

Shipped presets (`service-agreement.json`, `nda.json`) contain **placeholder clauses marked `<!-- TODO: ... -->`**. They are starter scaffolds, **not legal advice**. Before sending any contract for signature:

1. Replace every `<!-- TODO: ... -->` with your actual clause language.
2. Have the contract reviewed by qualified counsel for your jurisdiction.
3. Customize jurisdiction-specific clauses (governing law, IP transfer, warranties, limitation of liability).

Edit the shipped JSON files directly at [`src/presets/contracts/`](../src/presets/contracts) or pass `overrides.blocks` at call time.

## Combining with other tools

Common chain:

1. `plutio_proposal_from_preset` → create a proposal for a new client
2. *(client accepts)*
3. `plutio_contract_from_preset` → create the matching service agreement, link via `projectId` to the same project
4. *(send for signature in Plutio UI)*
