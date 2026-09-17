# PDP light-theme text visibility audit and fix

## Scope

Fix only the FoundOurMarket™ Product Detail Page in the light theme. Preserve the dark theme, logo, layout, routes, product logic, checkout, authentication, navigation, and all existing features.

## Root causes found

- The PDP defines its own dark palette on `[data-product-page]`, after the global light palette, so upper-page semantic text and surfaces can resolve to dark-theme values in light mode.
- Product Details cards use dark-oriented translucent gradients and very faint mixed text colors; specification labels and dividers become weak on the warm ivory theme.
- Reviews, FAQ, Q&A, and compare surfaces contain unscoped `white/*` text, borders, rings, and backgrounds intended for dark mode. Existing light glass fallbacks turn some of those surfaces white, leaving supporting text or controls nearly white-on-white.
- Collapsed description and answer blocks place gradient scrims over visible text. The description currently avoids duplicate controls, but its visible final lines are still washed out.
- Reveal elements begin at opacity zero and rely on delayed animation recovery, which can temporarily make specification content appear absent.

## Implementation

1. **Create one PDP light-theme boundary**
   - Keep the existing `data-product-page` marker and add a page-level light-only semantic override for primary, secondary, helper, border, card, input, and accent roles.
   - Scope all new rules to `html[data-theme="light"]` and PDP markers only; do not alter root or dark-theme tokens.

2. **Repair Product Details and specifications**
   - Give Product Details cards solid warm-white light surfaces and warm borders.
   - Set specification labels to readable secondary slate and values to primary ink.
   - Strengthen subtitles, counts, warranty copy, feature text, dividers, and inactive tabs without flattening hierarchy.
   - Remove light-theme ambient/noise treatments that reduce legibility while leaving dark presentation unchanged.

3. **Fix description collapse behavior**
   - Replace the overlay fade with clean height clipping in the PDP-owned description panel.
   - Keep exactly one Show More/Show Less control and preserve the measured, low-cost expansion behavior.
   - Ensure expanded content has no mask, ghost layer, or clipped text.

4. **Repair reviews, FAQ, questions, recommendations, and compare text**
   - Add narrow PDP section markers where necessary.
   - Within those light-only scopes, convert unscoped dark glass surfaces to warm-white surfaces, borders/rings to warm neutral lines, and supporting text to the readable ink ladder.
   - Preserve white text on genuine media overlays and orange primary buttons by explicitly excluding/marking those contexts.
   - Cover review summaries, cards, metadata, empty states, forms, FAQ answers, Q&A cards/answers, supporting copy, recommendation headings/product cards, and compare labels/values.

5. **Purchase, delivery, sticky bar, and support controls**
   - Retain the previously corrected compare price, stock/delivery chips, and Add to Cart hierarchy.
   - Add light-only readability rules for sticky purchase helper text and relevant floating support text/icons without changing behavior or positioning.

## Validation

- Check one real PDP from top to bottom in light mode at 320, 360, 375, 390, 412, and desktop widths.
- Exercise Product Details tabs, description Show More/Show Less, FAQ accordion, long-answer expansion, reviews, and sticky purchase states.
- Verify no horizontal overflow, clipping, overlap, transparent/washed text, duplicate expand controls, or dark overlays while scrolling.
- Measure representative primary, secondary, helper, specification, empty-state, and CTA color contrast in the rendered page.
- Repeat a desktop/mobile dark-theme visual comparison to confirm no dark-theme selectors or computed colors changed.
- Run the focused TypeScript check and inspect browser console output for regressions.
