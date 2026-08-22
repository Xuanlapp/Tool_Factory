# Acrylic Runner Mapping`r`n`r`nQuy tắc tích hợp Tool với Web được giữ tại `docs/tool-web-contract.md`.

This map records the existing production runner. Phase 1 does not change Illustrator or packing logic.

## Entry and bridge

- Entry: Tool/src/index.ts
- Production command: npm start
- Validation command: npm run check
- Ignore-validation command: npm run error
- Illustrator bridge: Tool/scripts/launch-illustrator-and-run.vbs
- Import and packing JSX: Tool/scripts/import-image.jsx
- AI save JSX: Tool/scripts/save-ai.jsx
- Output export JSX: Tool/scripts/export-output-assets.jsx

## Mapping

Run: one npm start command. It opens a wait AI first, otherwise Template_UVDTF.ai.
Sheet: one opened template or wait file. It can end as a wait checkpoint or output sheet.
Item: one source PNG expanded into requested quantity run units.
Error: validation, Illustrator, packing, save, or export failure.
Output: AI, FRONT PNG, BACK PNG, and LAZER AI files.

## Current runner behavior

1. Read PNG files from Images.
2. Parse size, side count, and quantity from filenames.
3. Sort by size descending, quantity descending, then filename.
4. Open wait AI first when it exists; a wait cap filters oversized inputs.
5. Run Illustrator batch JSX through cscript.
6. Build LAZER, FRONT, and BACK as required.
7. Validate size and measurement comparisons.
8. Create border geometry, pack items, and reclip after pack.
9. Save wait AI if the sheet still has capacity above the wait threshold.
10. Otherwise save output AI and export FRONT/BACK/LAZER assets.
11. Update done history and remaining quantity only after a successful save.

## Platform identifiers

Every telemetry record must include toolId and machineId. Run records add runId. Sheet records add sheetId. Item records add itemId.

## File state

- Input: Images
- Errors: images_error
- Done history: imgaes_done
- Wait sheets: wait
- AI output: output_ai
- Front output: output_front
- Back output: output_back
- Lazer output: output_lazer

## Phase 1 restriction

The platform is read-only. It may read folders, Tool/.runtime JSON files, and process state, but must not run shell commands, move production files, or change Illustrator behavior.

