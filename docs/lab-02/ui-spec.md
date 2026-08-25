# Lab 2: UI Specifications

## 1. Zen Green Theme
All UI components strictly adhere to the following color palette:
- **Primary Action Color:** `#006B3C` (Zen Green) - Used for primary buttons, active links, and focus rings.
- **Pale Background:** `#EAF6EF` - Used for active table rows, selected items, or success banners.
- **Page Background:** `#F5F7F6` - The main off-white background color for the application.
- **Text Primary:** `#1A1A1A` - Used for headings and main body text.
- **Text Secondary:** `#666666` - Used for helper text and inactive states.

## 2. Typography & Layouts
- **Font Family:** 'Inter', sans-serif.
- **Layouts:** 
  - Desktop: Sidebar navigation with a main content area (max-width 1200px).
  - Tablet/Mobile: Hamburger menu navigation, single column content stretching 100% width.

## 3. Screen States
- **Loading:** All async actions must show a spinner or skeleton loader.
- **Empty:** Lists with zero results must display a friendly illustration and "No tickets found" text.
- **Error/Failure:** Safe error banners (red tint) must display at the top of forms on submission failure, keeping form inputs populated.
- **Busy:** Submit buttons must change text to "Processing..." and become `disabled` to prevent double-clicks.

## 4. Accessibility
- All inputs must have associated `<label>` elements.
- All interactive elements must show a distinct `outline: 2px solid #006B3C` on keyboard `:focus`.
- Validation errors must rely on text messages ("This field is required") in addition to red border colors (non-color indicators).

## 5. Visual Inspection Checklist
- [ ] Do primary buttons use `#006B3C`?
- [ ] Can I tab through the form using only my keyboard?
- [ ] Does the UI adapt cleanly to mobile dimensions?
- [ ] Does submitting a blank form show explicit text errors?
- [ ] Does the Submit button grey out and disable while an upload is happening?

## 6. Screenshot Evidence Requirements
Screenshots for E2E evidence must be captured at Desktop, Tablet, and Mobile breakpoints and saved exactly here:
- `artifacts/lab-02/screenshots/create-ticket/`
- `artifacts/lab-02/screenshots/my-tickets/`
- `artifacts/lab-02/screenshots/ticket-detail/`
