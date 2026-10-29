Each file here fills one `data-slot="name"` in an archetype skeleton (`_archetypes/*.html`). The build passes
`level=` (the heading level drawn in that block), `ratio=` (its image shape, like `4x3`) and, for a row of
identical columns, `span=` (columns out of 12). A slot on a row of identical columns repeats the column itself,
so it outputs the whole row (`<ul class="wf-row">` with one `<li class="wf-col span-N">` per item).
