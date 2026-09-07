import { createTimelineProjection } from './timelineProjection';
import { normalizeMessages } from './agentPresentation';

it('invalidates cached rows when nested attachment metadata changes in place', () => {
  const normalize = jest.fn(normalizeMessages);
  const project = createTimelineProjection(normalize);
  const messages = [{ id: 'u', role: 'user', content: 'image', attachments: [{ id: 'a', type: 'image', source: { type: 'url', value: 'file:///a', mimeType: 'image/png' }, metadata: { displayName: '图片1' } }] }];
  project(messages);
  messages[0].attachments[0].source.mimeType = 'image/jpeg';
  project(messages);
  expect(normalize).toHaveBeenCalledTimes(2);
});

it('does not parse unchanged history while streaming and handles equal-length edits', () => {
  const normalize = jest.fn(normalizeMessages);
  const projection = createTimelineProjection(normalize);
  const messages = Array.from({ length: 2000 }, (_, index) => ({ id: String(index), role: 'assistant', content: 'saved' }));
  const first = projection(messages);
  normalize.mockClear();
  for (let index = 0; index < 10; index++) { messages[1999].content = String(index); projection(messages); }
  expect(normalize).toHaveBeenCalledTimes(10);
  messages[0].content = 'other';
  const edited = projection(messages);
  expect(edited[0]).not.toBe(first[0]);
  expect(edited[1]).toBe(first[1]);
});
