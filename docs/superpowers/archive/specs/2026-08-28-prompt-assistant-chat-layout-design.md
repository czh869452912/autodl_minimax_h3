# Prompt Assistant Chat Layout and Transfer Design

## Goal

Make the Prompt Assistant behave like a focused chatbot surface: use assistant-ui primitives for the conversation and composer, make file attachments work in the Android WebView, and show agent output as a stable streamed assistant message with separate tool activity.

## Approved Design

- Remove the Prompt Assistant page title, description, and large outer card.
- Let the chat occupy the available viewport between the global header and mobile bottom navigation. Keep only a compact history/new-thread toolbar.
- Keep the message viewport scrollable and anchor the composer to the bottom of the chat surface, above the mobile navigation safe area.
- Use assistant-ui's `ThreadPrimitive.Messages`, `MessagePrimitive.Parts`, `ComposerPrimitive.Attachments`, `ComposerPrimitive.AddAttachment`, `ComposerPrimitive.Input`, `ComposerPrimitive.Send`, and `ComposerPrimitive.Cancel` wherever the local runtime supports them.
- On Android, implement WebView `onShowFileChooser` so assistant-ui's standard file input can return selected `Uri[]` values. Keep the existing native media bridge for the video creation flow and retain compatibility with its existing `onMediaPicked` callback.
- Ensure the agent adapter emits only new text suffixes when the underlying agent stream contains cumulative message snapshots. Tool calls must have stable IDs and render as assistant-side activity rather than replacing the user message.

## Boundaries and Error Handling

- Attachment adapters remain `SimpleImageAttachmentAdapter` and `SimpleTextAttachmentAdapter`; unsupported files should be rejected by the adapter and leave the composer usable.
- File chooser cancellation must clear the pending callback without adding an attachment.
- Native callback parsing remains defensive and supports both old and current Android payload keys.
- A missing LLM configuration continues to show the existing inline warning without changing the chat layout.

## Verification

- Unit tests cover native payload normalization and cumulative-to-delta stream conversion.
- `npm test`, `npm run lint`, `npm run build`, and Android `:app:assembleDebug` must pass.
- Run a browser smoke check at mobile and desktop widths to verify the composer stays above bottom navigation, user and assistant messages remain distinct, and attachment previews appear before send.
