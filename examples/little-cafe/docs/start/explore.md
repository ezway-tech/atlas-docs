---
title: Explore Atlas Docs
description: A hands-on tour with one place to try each feature.
order: 2
---

## Read and navigate
| Feature | Where to try it | What to do |
| --- | --- | --- |
| Headings and table of contents | [Latte recipe](../menu/latte.md) | Jump between ingredients and method. |
| Tables, images and zoom | [Menu](../menu/menu.md) | Open the menu board, then view it fullscreen. |
| Links and backlinks | [Ingredients](../menu/ingredients.md) | Follow a recipe link and inspect incoming links. |
| Search | Whole library | Search for `oat milk`, then search within the recipe. |
| Nested folders | Operations → Stock | Open the inventory guide. |
| Mermaid diagram | [Order flow](../operations/order-flow.md) | Zoom the diagram. |
| OpenAPI viewer | [Ordering API](../ordering/openapi.yml) | Expand an endpoint and inspect its response. No live API is supplied. |
| SQL schema | [Database](../ordering/schema.sql) | Inspect the tables and their relationship. |
| YAML and JSON | [Config](../ordering/cafe.yml), [sample order](../ordering/order.json) | Read or edit the source. |

## Edit and discuss
1. Open the [latte recipe](../menu/latte.md). Switch between visual and source editing, change a sentence, and save.
2. Select a paragraph and add a comment. A sample comment already highlights the milk choice.
3. Open the recipe history. Compare the two bundled older versions, then restore one. Restore changes your copy of the document.
4. Create a document and a folder, rename them, and drag siblings to change their order.

## Organize your workspace
The Menu folder starts pinned. Operations → Stock starts hidden: show it from the dashboard before browsing the inventory guide. Try changing a folder icon or cover image. Toggle light/dark theme and inspect keyboard shortcuts in the shortcut dialog; customize a shortcut there.

## Try the resource library
Open the resource library from the app navigation. The bundled files include a PNG menu board, a PNG drink diagram, a CSV stock sheet, a WAV service chime, and a short MP4 order-flow animation. Preview the images, play the audio/video, download the CSV, inspect where an image is used, and try editing an image. Upload or paste your own image to try those actions.

## Back up and restore
Export the library as a ZIP from the backup controls. To test import, stop the app and start it with a different, empty `DATA_DIR`, following the project README. Import the ZIP there. Import only accepts an empty library; do not delete your working library to make room.

## Reset the demo
Keep the original example untouched. To get a fresh copy, choose a new empty `DATA_DIR` and run `npm run seed:demo` with the app stopped.

## Try a nested table of contents
1. Open the Latte recipe and select **Mục lục** (table of contents).
2. The default range is H1–H3, so Quality check and Taste and texture appear, but the deeper sections do not. Previously saved preferences may change this range.
3. Open **Cấu hình mục lục**, set **Từ cấp** to H1 and **Đến cấp** to H6.
4. Expand Quality check → Taste and texture → Adjust the next cup → Record the adjustment → Shift handover note. Click the last heading to jump to it.
5. Collapse a branch, then try **Thu gọn tất cả** and **Mở tất cả**. Change the range back to H1–H3 to compare.

## Try all four editing modes
Use the Latte recipe for this exercise: its headings, emphasis, quote, nested list, and divider are supported in Visual mode.
1. Select **Chỉnh sửa**, then **Visual**. Edit a sentence or change a heading level.
2. Select **Source** to see the Markdown syntax.
3. Select **Split** to view source and rendered content together; select **Preview** for the rendered result.
4. Return to Source or Visual and save your change, or close and discard it.

The Ordering app article includes embedded SQL and OpenAPI. Use Source, Split, or Preview there. Visual is intentionally unavailable for complex content to avoid losing syntax. The same restriction applies to tables, checklists, and Mermaid diagrams.

## Organize and edit resources
1. Open the resource library. Search for `latte`, switch between grid and list, then clear the search.
2. Open **Bộ lọc**, choose images, and inspect the available source/usage filters. Clear filters before continuing.
3. To create an edited copy, return to the Latte recipe, select **Chỉnh sửa → Source → Chèn tài nguyên**, open `latte-layers.png`, and select **Vẽ / chỉnh sửa**. Editing directly from the resource library uses **Sửa ảnh** and overwrites the original; use the insert flow for this exercise.
4. Try the crop tool: drag a rectangle and apply **Cắt vùng này**. Undo to recover the full diagram.
5. Draw a mark with the pen. Use the text tool to add a short label. Try undo and redo.
6. Select **Lưu và chèn** to create a new image and insert it into the draft, then save the article. Confirm that the original diagram still exists and its original recipe link still works.

The source demo remains unchanged: all these actions affect only your copied library. To see a newer bundled demo, follow the README instructions to seed a new, empty DATA_DIR from the repository root.
