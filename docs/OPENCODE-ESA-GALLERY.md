# ESA gallery update

Add the newly supplied Mika image set to a new gallery collection:

- collection slug: `esa`
- title: `ESA`
- image folder: `assets/images/esa/`
- first asset slug: `esa-20260917-01`
- visibility: `preview`
- blurRequired: `true`

Generate the normal derivatives (`thumb`, `full`, `hero`, `mobile`, `blur`, `sharp`) and register the collection through the existing gallery generation source rather than editing only the generated `gallery.json`.

Keep the existing 18+ verification/blur behavior. Do not make this image the homepage hero. The ESA collection should appear as a normal gallery section/card.

Use the image supplied in the current ChatGPT task as the source. Commit with:

`feat: add ESA gallery image set`
