# Rich Image Mentions and Draggable Sheets

## Goal

Correct three interaction gaps in the Prompt Assistant implementation:

- Render each selected image reference as an inline visual token containing the image thumbnail and attachment name, matching the approved A concept, instead of showing only `@name` as ordinary text.
- Keep the send/stop control pinned to the far trailing edge of the composer toolbar.
- Make both the image-reference sheet and conversation-history sheet genuinely draggable, with a compact resting height and an expanded near-full-screen snap point.

The existing attachment preview strip remains visible. It represents what will be sent; inline mention tokens represent where an image is referenced in the prompt.

## Root causes

The current composer inserts `@name` into a standard React Native `TextInput`. A native `TextInput` only renders a uniform editable string and cannot place an arbitrary thumbnail component inside its text flow. Mention metadata exists, but no visual token layer consumes it.

Both current sheets are fixed-height `Modal` children. Their handles are decorative views: no pan responder, animated height, or release/snap calculation is connected to them. The send button also follows the two leading toolbar actions without a flexible spacer, so it cannot reach the trailing edge.

## Rich mention rendering

The composer keeps the native `TextInput` as the source of keyboard, selection, and accessibility behavior. A non-interactive visual layer mirrors the draft and replaces every valid mention range with a compact token made of:

- a 20–24 px circular image thumbnail,
- the attachment display name without its final file extension,
- a soft rounded background and subtle image outline.

Ordinary text remains normal text. The visual layer uses the same font size, line height, width, and padding as the input so tokens occupy the mention ranges in the same flow. The underlying textual label stays in the draft as `@name`; it remains the submitted prompt representation and fallback if a mention becomes invalid. The visual layer never intercepts touches, so caret movement and editing remain controlled by the input.

Mention metadata is still keyed by attachment ID and text range. Removing an attachment removes its tokens. If editing invalidates a range, reconciliation drops the visual token and the remaining characters display as ordinary text. Repeated references render repeated tokens.

The attachment strip remains above the input. The token layer does not remove, duplicate, or alter outgoing attachments.

## Shared draggable bottom sheet

Replace the two fixed sheet bodies with one shared `DraggableBottomSheet` component. It owns:

- `visible`, title, close action, and sheet content,
- an animated vertical position,
- a drag handle with a minimum 40 px touch target,
- compact and expanded snap points,
- backdrop and Android back dismissal.

Snap points are based on the current visible window height:

- compact: approximately 45% of the visible height,
- expanded: approximately 92% of the visible height.

Dragging the handle upward past the distance/velocity threshold expands to the 92% point. Dragging downward from expanded collapses to compact; dragging downward from compact past the close threshold dismisses the sheet. Short releases return to the nearest current snap point. Animations use an interruptible spring without bounce.

The sheet content receives the remaining height and scrolls internally. The handle owns the drag gesture so scrolling conversation history or attachment rows does not accidentally move the sheet.

## Composer toolbar

The add-image and `@` controls remain grouped on the leading side. A flexible spacer sits between them and the send/stop control, pinning send to the far trailing edge at every device width.

## Testing

Add tests for:

- rich-token segments containing the selected image URI and display name,
- ordinary text and repeated mention ordering,
- invalid/deleted mention fallback,
- toolbar spacer and trailing send placement,
- bottom-sheet release resolution for expand, collapse, close, and return-to-current-state,
- both history and image-reference screens using the shared draggable sheet,
- existing all-ready attachment sending behavior.

Run the complete Jest suite, TypeScript typecheck, and Android Expo export. A physical-device drag and keyboard check remains required when `adb` is available.

## Non-goals

- No asset-library management.
- No voice or direct video-generation controls.
- No provider API change or rich mention object in persisted messages.
- No drag-to-reorder of attachments or mention tokens.
