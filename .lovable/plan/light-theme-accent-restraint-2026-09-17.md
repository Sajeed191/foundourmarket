# Light Theme Accent Restraint

## Goal
Make the light theme feel like the direct light counterpart of the existing dark theme: warm-white surfaces, white cards, charcoal text, quiet warm-gray borders, and orange used only for primary actions, active states, prices, small badges, icons, and thin details. Preserve the dark theme, real logo, layout, behavior, and all business functionality.

## Implementation
1. **Correct the shared light-theme foundation**
   - Remove the page-wide orange ambient wash and use the warm ivory canvas consistently.
   - Keep cards, panels, menus, dialogs, and section bands neutral with 1px warm-gray borders and restrained neutral shadows.
   - Reduce orange-tinted generic icon tiles and decorative surfaces to neutral warm-white treatments.

2. **Stop broad accent leakage**
   - Replace the global light-theme rule that turns every `.bg-accent` element into a glossy orange gradient.
   - Preserve orange fills only on explicitly primary actions, purchase actions, cart controls, selected controls, and checked states.
   - Make non-action accent utilities use a subtle tint, orange text, and a fine border instead of a large orange block.

3. **Refine active states and decoration**
   - Keep selected tabs, selected options, navigation states, prices, compact badges, and small highlights clearly orange.
   - Remove orange halos and deep orange shadows from light-theme cards, secondary controls, floating controls, and decorative elements.
   - Use thin orange lines or compact markers where emphasis is decorative rather than functional.

4. **Preserve key commerce hierarchy**
   - Keep Buy Now, Checkout, cart, and other true primary actions prominent.
   - Keep secondary actions white with charcoal text and warm-gray borders.
   - Keep product cards and image areas predominantly white; preserve readable pricing, stock, delivery, and badge treatments.

5. **Validate site-wide presentation**
   - Inspect representative storefront, product, cart, sign-in, account, and administration surfaces in light theme.
   - Test phone, tablet, and desktop widths for orange overuse, contrast, clipping, overlap, and scrolling artifacts.
   - Confirm dark-theme computed styles and screenshots remain unchanged, then run the project’s type validation.

## Technical Notes
- All new corrections will be scoped under `html[data-theme="light"]`; grey and dark themes will not be modified.
- Existing semantic light tokens will be reused; shared dark-theme variables and component behavior will remain untouched.
- No routes, data access, authentication, checkout logic, animations, or responsive structure will change.
