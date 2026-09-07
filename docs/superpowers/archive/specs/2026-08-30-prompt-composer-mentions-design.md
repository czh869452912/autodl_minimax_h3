# Prompt Composer Keyboard and Image Mentions

## Goal

Improve the Prompt Assistant composer on Android and align its interaction model with the supplied reference layouts:

- Keep the composer at the bottom of the resized visible window when the keyboard opens; remove the excessive extra lift currently seen on Android.
- Put image attachment and send controls on a toolbar row below the multiline input.
- Add an `@` control that opens a bottom sheet containing the current conversation's uploaded image attachments.
- Selecting an image inserts a visual `@` reference at the last cursor position, closes the sheet, and restores input focus.
- Keep every ready uploaded image in the message attachments when sending, whether or not it is referenced with `@`.

Video generation controls, voice input, and in-app asset-library management are explicitly out of scope.

## Current context and root cause

`PromptAssistantUi` already combines provider-managed attachments with locally selected gallery images and sends every ready image through the existing `setPendingAttachments`/`submitMessage` path. Its Android keyboard handling currently observes `keyboardDidShow` and adds a screen-coordinate-derived bottom padding. On devices where `adjustResize` already reduces the usable window, this duplicates part of the keyboard offset and lifts the composer too far.

The fix should make the Android layout rely on the resized viewport and safe-area inset only. iOS should retain the existing native `KeyboardAvoidingView` padding behavior.

## UX and component structure

The composer is a three-part vertical surface:

1. A horizontal attachment preview strip for all current attachments.
2. A multiline `TextInput` that occupies the upper content area and grows to its existing maximum height.
3. A bottom toolbar row containing:
   - add-image button (existing gallery/file picker behavior),
   - `@` image-reference button,
   - send or stop button aligned to the trailing edge.

The `@` control opens a bottom sheet with a drag handle, title, dimmed backdrop, and one row per ready image. Each row shows a thumbnail, filename, and an accessible action label. Uploading attachments are shown in the preview strip but are not selectable in the mention sheet.

When a row is selected:

- close the sheet,
- insert a token-like textual label such as `@角色正面` at the captured selection/cursor position,
- preserve the attachment's ID in mention metadata,
- keep the attachment in the preview strip and in the eventual outgoing attachment list,
- focus the text input again.

If no ready images exist, show an empty state with a clear “先上传图片附件” message and an add-image action. Tapping the backdrop, close button, or Android back dismisses the sheet without modifying text.

The same image may be referenced multiple times. Removing an image from the current composer also removes mention metadata that points to that image; already-sent messages are immutable.

## Data flow

The composer captures the current text selection before opening the sheet. A mention record contains at minimum:

```ts
type ImageMention = {
  attachmentId: string;
  label: string;
  start: number;
  end: number;
};
```

Selection insertion updates the draft text and shifts later mention ranges. If the user edits text, metadata is reconciled conservatively; invalid ranges are dropped rather than blocking typing or sending. Mention labels are presentation text in this iteration and are not removed from the prompt before submission.

The submit path remains unchanged for attachments: concatenate provider-ready and locally selected ready images, de-duplicate only according to the existing attachment behavior, and pass all of them to `setPendingAttachments` before `submitMessage`. Mention metadata is local composer state and is not required by the current provider API.

## Keyboard and layout behavior

- Android: do not add keyboard-height padding based on `keyboardDidShow`; rely on `adjustResize`/the actual available window height and add only `max(insets.bottom, 8)`.
- iOS: keep `KeyboardAvoidingView` with `behavior="padding"` and offset `0`.
- The toolbar must remain below the text input and above the keyboard safe area.
- The attachment strip and sheet must remain tappable while the keyboard is open.

## Error handling and limits

- Preserve the existing image picker limit of nine total images and the 20 MB per-image limit.
- Preserve existing picker error alerts.
- A mention action cannot select an uploading image.
- If the selected attachment disappears before insertion, dismiss without changing the text.
- Sending remains disabled while any attachment is uploading and when both text and ready attachments are absent.

## Testing and acceptance

Add or update tests for:

- cursor/selection insertion of an `@` label and mention range tracking,
- automatic sheet dismissal and input refocus after selection,
- empty-state behavior and exclusion of uploading attachments,
- repeated references and mention cleanup after attachment removal,
- all ready attachments still being sent even when only some are mentioned,
- composer structure with input above the toolbar and accessible add/mention/send controls,
- Android not applying the previous extra keyboard lift while iOS retains native KAV padding.

Run `npm run typecheck`, `npm test -- --runInBand`, and an Android Expo export. If an adb target is available, manually verify keyboard opening, picker upload, mention insertion, and send behavior.

## Non-goals

- No direct video-generation action from the composer.
- No microphone or voice input.
- No built-in asset-library CRUD or asset-management screen.
- No replacement of the existing provider attachment API or message persistence model.
